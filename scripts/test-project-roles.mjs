import pg from "pg";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { projectRecords } from "../src/records.js";

// Both storage protocols are tested in separate disposable databases. Nothing
// here uses the production URL or any live account.
export async function testProjectRoles(owner, connectionUrl) {
  const migration = await readFile(new URL("../supabase/migrations/202610150001_project_ownership.sql", import.meta.url), "utf8");
  let checks = 0;
  for (const normalized of [false, true]) {
    const name = `implanta_roles_${process.pid}_${Date.now()}`;
    const url = new URL(connectionUrl); url.pathname = `/${name}`;
    const clients = [];
    const ids = Object.fromEntries(["master", "a", "b", "editor", "viewer", "pending"].map((key, index) => [key, `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`]));
    const project = (id) => ({ id, name: id, status: "active", entities: [], tasks: [], trainings: [], logs: [], cpf: "123.456.789-00" });
    const open = async () => { const c = new pg.Client({ connectionString: url.href }); await c.connect(); clients.push(c); return c; };
    const denied = async (c, sql, args = []) => { await assert.rejects(c.query(sql, args), (e) => e.code === "42501"); checks++; };
    await owner.query(`create database ${name}`);
    try {
      const root = await open();
      await root.query(`create schema auth; create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
        create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
        grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;`);
      await root.query(await readFile(new URL("../supabase/migrations/202610090001_implanta.sql", import.meta.url), "utf8"));
      for (const [key, id] of Object.entries(ids)) await root.query("insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)", [id, `${key}@example.invalid`, { display_name: key, admin: true, master: true }]);
      await root.query("update public.implanta_profiles set active=true where id<>$1", [ids.pending]);
      await root.query("insert into implanta_private.admins values($1),($2)", [ids.master, ids.b]);
      for (const [id, creator] of [["a", ids.a], ["b", ids.b], ["legacy", ids.master], ["unowned", null]])
        await root.query("insert into public.implanta_projects(id,data,created_by) values($1,$2,$3)", [id, project(id), creator]);
      await root.query("insert into public.implanta_members values('a',$1,'editor'),('a',$2,'viewer'),('b',$3,'viewer')", [ids.editor, ids.viewer, ids.a]);
      if (normalized) await root.query(await readFile(new URL("../supabase/migrations/202610090002_records.sql", import.meta.url), "utf8"));
      const before = (await root.query("select id,data,version from public.implanta_projects order by id")).rows;
      // An unconfigured first activation fails atomically.
      await assert.rejects(root.query(migration), /Substitua SEU_EMAIL_MASTER/); await root.query("rollback"); checks++;
      const activated = migration.replaceAll("SEU_EMAIL_MASTER", "master@example.invalid");
      await root.query(activated);
      assert.deepEqual((await root.query("select id,data,version from public.implanta_projects order by id")).rows, before); checks++;
      const actors = {};
      for (const [key, id] of Object.entries(ids)) {
        const c = await open(); await c.query("set role authenticated"); await c.query("select set_config('request.jwt.claim.sub',$1,false)", [id]); actors[key] = c;
      }
      const { master, a, b, editor, viewer, pending } = actors;
      const anon = await open(); await anon.query("set role anon");
      await denied(anon, "select public.implanta_project_people('a',null)");
      await denied(anon, "select public.implanta_transfer_project('a',$1)", [ids.a]);
      const access = async (c) => (await c.query("select public.implanta_access() data")).rows[0].data;
      const read = async (c) => normalized ? (await c.query("select public.implanta_read_v2() data")).rows[0].data.projects.map((p) => p.id).sort() : (await c.query("select id from public.implanta_projects order by id")).rows.map((p) => p.id);
      const modern = (c, changed = [], created = [], deleted = []) => c.query("select public.implanta_commit_v2($1,'[]',$2,$3,null,false)", [JSON.stringify(changed), JSON.stringify(created), JSON.stringify(deleted)]);
      const create = (c, p) => normalized ? modern(c, projectRecords(p).map((r) => ({ ...r, revision: 0 })), [{ id: p.id, data: p }]) : c.query("select public.implanta_create_project($1)", [p]);
      const save = async (c, id, changes) => {
        if (!normalized) {
          const r = (await root.query("select data,version from public.implanta_projects where id=$1", [id])).rows[0];
          return c.query("select public.implanta_save_project($1,$2,$3)", [id, { ...r.data, ...changes }, r.version]);
        }
        const data = (await master.query("select public.implanta_read_v2() data")).rows[0].data;
        const r = data.records.find((r) => r.kind === "municipality" && r.id === id);
        return modern(c, [{ ...r, data: { ...r.data, ...changes } }]);
      };
      const remove = async (c, id) => {
        const version = (await root.query("select version from public.implanta_projects where id=$1", [id])).rows[0].version;
        return normalized ? modern(c, [], [], [{ id, version }]) : c.query("select public.implanta_delete_project($1,$2)", [id, version]);
      };
      assert.equal((await access(master)).master, true);
      assert.equal((await access(b)).master, false); checks++;
      assert.deepEqual(await read(master), ["a", "b", "legacy", "unowned"]);
      assert.deepEqual(await read(a), ["a", "b"]); assert.deepEqual(await read(b), ["b"]);
      if (normalized) await assert.rejects(read(pending), (e) => e.code === "42501");
      else assert.deepEqual(await read(pending), []); checks++;
      assert.equal((await access(a)).projectRoles.find((p) => p.id === "a").ownerId, ids.a); checks++;
      for (const [key, c] of [["a", a], ["b", b], ["viewer", viewer]]) {
        const p = { ...project(`new-${key}`), ownerId: ids.master, created_by: ids.master };
        await create(c, p);
        const actual = (await root.query("select owner_id,created_by from public.implanta_projects where id=$1", [p.id])).rows[0];
        assert.deepEqual(actual, { owner_id: ids[key], created_by: ids[key] }); checks++;
      }
      await assert.rejects(create(pending, project("blocked")), (e) => e.code === "42501"); checks++;
      await denied(a, "select public.implanta_admin_users()");
      await denied(a, "select public.implanta_set_user($1,'elevated',true,true)", [ids.a]);
      await denied(a, "update public.implanta_projects set owner_id=$1 where id='b'", [ids.a]);
      await denied(a, "select public.implanta_transfer_project('b',$1)", [ids.a]);
      await denied(a, "select public.implanta_grant_project('b',$1,'editor')", [ids.editor]);
      await denied(editor, "select public.implanta_grant_project('a',$1,'viewer')", [ids.b]);
      await denied(viewer, "select public.implanta_project_people('a',null)");
      await denied(a, "select public.implanta_grant_project('a',$1,'owner')", [ids.b]);
      await denied(a, "select public.implanta_grant_project('a',$1,'editor')", [ids.pending]);
      await denied(a, "select public.implanta_grant_project('a',$1,'viewer')", [ids.master]);
      await denied(a, "select public.implanta_grant_project('a',$1,null)", [ids.a]);
      await a.query("select public.implanta_grant_project('a',$1,'editor')", [ids.b]);
      const people = (await a.query("select public.implanta_project_people('a',null) data")).rows[0].data;
      assert(people.some((p) => p.id === ids.b && p.role === "editor"));
      assert(!people.some((p) => p.id === ids.pending)); checks++;
      await a.query("select public.implanta_grant_project('a',$1,null)", [ids.b]);
      assert.deepEqual(await read(b), ["b", "new-b"]); checks++;
      await assert.rejects(save(a, "b", { status: "closed" }), (e) => e.code === "42501"); checks++;
      await save(a, "a", { status: "closed" }); await save(a, "a", { status: "active" }); checks++;
      await assert.rejects(remove(editor, "a"), (e) => e.code === "42501"); checks++;
      await remove(a, "new-a"); assert(!(await read(master)).includes("new-a")); checks++;
      // A request that began before a transfer must check the new owner after
      // acquiring the project's lock; the previous owner cannot grant access.
      await create(a, project("race"));
      await master.query("begin");
      await master.query("select public.implanta_transfer_project('race',$1)", [ids.b]);
      const competing = a.query("select public.implanta_grant_project('race',$1,'editor')", [ids.editor]).then(() => null, (error) => error);
      try {
        let blocked = false;
        for (let attempt = 0; attempt < 100; attempt++) {
          blocked = (await root.query("select cardinality(pg_blocking_pids($1))>0 as blocked", [a.processID])).rows[0].blocked;
          if (blocked) break;
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        assert.equal(blocked, true);
      } finally { await master.query("commit"); }
      assert.equal((await competing)?.code, "42501"); checks++;
      // A transfer changes scoped management, not historical authorship.
      await master.query("select public.implanta_transfer_project('a',$1)", [ids.b]);
      assert.equal((await root.query("select created_by from public.implanta_projects where id='a'")).rows[0].created_by, ids.a);
      await denied(a, "select public.implanta_grant_project('a',$1,'viewer')", [ids.b]);
      await b.query("select public.implanta_grant_project('a',$1,'viewer')", [ids.a]); checks++;
      const audit = (await b.query("select * from public.implanta_access_audit where project_id='a'")).rows;
      assert(audit.length >= 4); assert(audit.some((r) => r.actor_id === ids.master && r.action === "gestão transferida"));
      assert(audit.every((r) => r.at && r.actor_name && r.target_name)); checks++;
      assert.equal((await viewer.query("select * from public.implanta_access_audit")).rowCount, 0); checks++;
      await denied(a, "insert into public.implanta_access_audit(actor_name,target_name,action) values('fake','fake','fake')");
      // The platform-owner tier cannot be delegated through the ordinary UI.
      await denied(master, "select public.implanta_set_user($1,'b',true,true)", [ids.b]);
      await master.query("select public.implanta_set_user($1,'b renamed',true,false)", [ids.b]);
      await root.query(migration);
      assert.equal((await access(b)).master, false);
      assert.equal((await access(master)).master, true);
      assert.equal((await access(master)).projectRoles.find((p) => p.id === "a").ownerId, ids.b); checks++;
      await master.query("select public.implanta_set_user($1,'b',true,false)", [ids.b]);
      assert((await master.query("select * from public.implanta_access_audit where project_id is null")).rowCount >= 2); checks++;
      await master.query("select public.implanta_set_user($1,'b',false,false)", [ids.b]);
      if (normalized) await assert.rejects(read(b), (e) => e.code === "42501");
      else assert.deepEqual(await read(b), []);
      await denied(b, "select public.implanta_grant_project('a',$1,'editor')", [ids.a]); checks++;
      console.log(`Níveis de acesso (${normalized ? "registros" : "legado"}): isolamento, autoria, aprovação, gestão e auditoria aprovados.`);
    } finally {
      await Promise.all(clients.map((c) => c.end()));
      await owner.query(`drop database if exists ${name}`);
    }
  }
  console.log(`${checks} verificações adicionais de níveis de acesso aprovadas.`);
}
