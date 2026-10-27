import pg from "pg";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { newActivity } from "../src/domain.js";
import { recordChanges, assembleRecords } from "../src/records.js";

export async function testActivityResponsibility(owner, connectionUrl) {
  const name = `activity_assignment_${process.pid}_${Date.now()}`;
  const url = new URL(connectionUrl);
  url.pathname = "/" + name;
  const clients = [];
  const ids = Object.fromEntries(
    [
      "master",
      "manager",
      "editor",
      "viewer",
      "other",
      "inactive",
      "duplicate",
    ].map((k, i) => [
      k,
      `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    ]),
  );
  let checks = 0;
  const open = async (who) => {
    const c = new pg.Client({ connectionString: url.href });
    await c.connect();
    clients.push(c);
    if (who) {
      await c.query("set role authenticated");
      await c.query("select set_config('request.jwt.claim.sub',$1,false)", [
        ids[who],
      ]);
    }
    return c;
  };
  const migration = async (file) =>
    readFile(
      new URL("../supabase/migrations/" + file, import.meta.url),
      "utf8",
    );
  await owner.query(`create database ${name}`);
  try {
    const root = await open();
    await root.query(
      "create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;",
    );
    await root.query(await migration("202610090001_implanta.sql"));
    for (const [who, id] of Object.entries(ids))
      await root.query(
        "insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)",
        [
          id,
          who + "@example.invalid",
          { display_name: who === "duplicate" ? "editor" : who },
        ],
      );
    await root.query(
      "update public.implanta_profiles set active=true where id<>$1",
      [ids.inactive],
    );
    await root.query("insert into implanta_private.admins values($1)", [
      ids.master,
    ]);
    const project = {
      id: "p",
      name: "Projeto",
      entities: [],
      tasks: [
        { ...newActivity(), id: "old-created", title: "Sem responsável" },
        {
          ...newActivity(),
          id: "ambiguous",
          title: "Nome repetido",
          owner: "editor",
        },
        { ...newActivity(), id: "unknown", title: "Sem autoria" },
        {
          ...newActivity(),
          id: "inactive-created",
          title: "Criador sem acesso",
        },
      ],
      trainings: [],
      logs: [],
    };
    await root.query(
      "insert into public.implanta_projects(id,data,created_by)values($1,$2,$3)",
      [project.id, project, ids.manager],
    );
    await root.query(
      "insert into public.implanta_projects(id,data,created_by)values('foreign',$1,$2)",
      [{ ...project, id: "foreign", tasks: [] }, ids.other],
    );
    for (const [who, role] of [
      ["editor", "editor"],
      ["duplicate", "editor"],
      ["viewer", "viewer"],
      ["inactive", "editor"],
    ])
      await root.query(
        "insert into public.implanta_members values('p',$1,$2)",
        [ids[who], role],
      );
    await root.query(
      "insert into public.implanta_projects(id,data,created_by) values('orphan',$1,$2)",
      [
        {
          ...project,
          id: "orphan",
          tasks: [
            {
              ...newActivity(),
              id: "orphan-task",
              title: "Gestor inativo",
              ownerId: ids.inactive,
              owner: "Gestor antigo",
            },
          ],
        },
        ids.inactive,
      ],
    );
    await root.query(
      "insert into public.implanta_members values('orphan',$1,'editor')",
      [ids.editor],
    );
    await root.query(await migration("202610090002_records.sql"));
    await root.query(
      (await migration("202610150001_project_ownership.sql")).replaceAll(
        "SEU_EMAIL_MASTER",
        "master@example.invalid",
      ),
    );
    await root.query(
      "insert into public.implanta_record_audit(project_id,kind,record_id,action,actor_id,actor_name)values('p','activity','old-created','criado',$1,'editor')",
      [ids.editor],
    );
    await root.query(
      "insert into public.implanta_record_audit(project_id,kind,record_id,action,actor_id,actor_name) values('p','activity','inactive-created','criado',$1,'inactive')",
      [ids.inactive],
    );
    await root.query(
      await migration("202610270001_activity_responsibility.sql"),
    );
    const master = await open("master"),
      editor = await open("editor"),
      viewer = await open("viewer"),
      other = await open("other");
    const read = async () => {
      const snapshot = (
        await editor.query("select public.implanta_read_v2() value")
      ).rows[0].value;
      return {
        snapshot,
        project: assembleRecords(snapshot.records).find((p) => p.id === "p"),
      };
    };
    const write = async (next, as = editor) => {
      const { snapshot, project: current } = await read();
      const diff = recordChanges([current], [next], snapshot.records);
      const result = (
        await as.query(
          "select public.implanta_commit_v2($1,$2,'[]','[]',null,false) value",
          [JSON.stringify(diff.changes), JSON.stringify(diff.removed)],
        )
      ).rows[0].value;
      return assembleRecords(result.records).find((p) => p.id === "p");
    };
    let p = (await read()).project;
    assert.equal(
      p.tasks.find((t) => t.id === "old-created").ownerId,
      ids.editor,
    );
    assert.equal(
      p.tasks.find((t) => t.id === "old-created").createdBy,
      ids.editor,
    );
    assert.equal(
      p.tasks.find((t) => t.id === "ambiguous").ownerId,
      ids.manager,
    );
    assert.equal(p.tasks.find((t) => t.id === "unknown").ownerId, ids.manager);
    assert.equal(p.tasks.find((t) => t.id === "unknown").createdBy, null);
    assert.equal(
      p.tasks.find((t) => t.id === "ambiguous").responsibilityRecovery
        .previousOwner,
      "editor",
    );
    checks += 2;
    checks += 4;
    const list = (
      await editor.query("select public.implanta_activity_assignees('p') value")
    ).rows[0].value;
    assert.deepEqual(
      new Set(list.users.map((u) => u.id)),
      new Set([ids.master, ids.manager, ids.editor, ids.duplicate]),
    );
    assert.equal(list.unresolved, 0);
    assert.equal(
      p.tasks.find((t) => t.id === "inactive-created").createdBy,
      ids.inactive,
    );
    assert.equal(
      p.tasks.find((t) => t.id === "inactive-created").ownerId,
      ids.manager,
    );
    checks += 2;
    checks += 2;
    const orphan = (
      await editor.query(
        "select public.implanta_activity_assignees('orphan') value",
      )
    ).rows[0].value;
    assert.equal(orphan.unresolved, 1);
    const preserved = (
      await root.query(
        "select data from public.implanta_activity_records where project_id='orphan'",
      )
    ).rows[0].data;
    assert.equal(
      preserved.responsibilityRecovery.previousOwnerId,
      ids.inactive,
    );
    checks += 2;
    await assert.rejects(
      other.query("select public.implanta_activity_assignees('p')"),
      (e) => e.code === "42501",
    );
    await assert.rejects(
      viewer.query("select public.implanta_activity_assignees('p')"),
      (e) => e.code === "42501",
    );
    checks += 2;
    const add = (p, id, fields = {}) => ({
      ...p,
      tasks: [...p.tasks, { ...newActivity(), id, title: id, ...fields }],
    });
    p = await write(add(p, "default"));
    assert.equal(p.tasks.find((t) => t.id === "default").ownerId, ids.editor);
    assert.equal(p.tasks.find((t) => t.id === "default").createdBy, ids.editor);
    checks += 2;
    p = await write(
      add(p, "delegated", {
        ownerId: ids.manager,
        owner: "manager",
        createdBy: ids.other,
      }),
    );
    assert.equal(
      p.tasks.find((t) => t.id === "delegated").createdBy,
      ids.editor,
    );
    assert.equal(
      p.tasks.find((t) => t.id === "delegated").ownerId,
      ids.manager,
    );
    checks += 2;
    p = await write(
      add(p, "legacy-import", { owner: "Nome anterior do Trello" }),
    );
    assert.equal(
      p.tasks.find((t) => t.id === "legacy-import").ownerId,
      ids.editor,
    );
    assert.equal(
      p.tasks.find((t) => t.id === "legacy-import").responsibilityRecovery
        .previousOwner,
      "Nome anterior do Trello",
    );
    checks += 2;
    for (const who of ["viewer", "other", "inactive"]) {
      await assert.rejects(
        write(add(p, "bad-" + who, { ownerId: ids[who], owner: who })),
        (e) => e.code === "23514",
      );
      checks++;
    }
    await assert.rejects(
      write(add(p, "viewer-write"), viewer),
      (e) => e.code === "42501",
    );
    checks++;
    p = await write({
      ...p,
      tasks: p.tasks.map((t) =>
        t.id === "default"
          ? {
              ...t,
              ownerId: ids.manager,
              owner: "forged label",
              createdBy: ids.other,
            }
          : t,
      ),
    });
    assert.equal(p.tasks.find((t) => t.id === "default").owner, "manager");
    assert.equal(p.tasks.find((t) => t.id === "default").createdBy, ids.editor);
    checks += 2;
    p = await write(
      {
        ...p,
        tasks: p.tasks.map((t) =>
          t.id === "default" ? { ...t, ownerId: null, owner: "" } : t,
        ),
      },
      master,
    );
    assert.equal(p.tasks.find((t) => t.id === "default").ownerId, ids.editor);
    assert.equal(p.tasks.find((t) => t.id === "default").createdBy, ids.editor);
    checks += 2;
    await assert.rejects(
      master.query("select public.implanta_grant_project('p',$1,'viewer')", [
        ids.editor,
      ]),
      (e) => e.code === "23514",
    );
    checks++;
    await assert.rejects(
      master.query("select public.implanta_set_user($1,'editor',false,false)", [
        ids.editor,
      ]),
      (e) => e.code === "23514",
    );
    checks++;
    await assert.rejects(
      master.query("select public.implanta_transfer_project('p',$1)", [
        ids.other,
      ]),
      (e) => e.code === "23514",
    );
    checks++;
    p = await write({
      ...p,
      tasks: p.tasks.map((t) => ({
        ...t,
        ownerId: ids.master,
        owner: "master",
      })),
    });
    await master.query(
      "select public.implanta_grant_project('p',$1,'viewer')",
      [ids.editor],
    );
    await master.query(
      "select public.implanta_grant_project('p',$1,'editor')",
      [ids.editor],
    );
    checks++;
    // A deactivation committed while an assignment waits must win.
    await master.query(
      "select public.implanta_grant_project('p',$1,'editor')",
      [ids.other],
    );
    await master.query("begin");
    await master.query(
      "select public.implanta_set_user($1,'other',false,false)",
      [ids.other],
    );
    const waiting = assert.rejects(
      write(add(p, "racing", { ownerId: ids.other, owner: "other" })),
      (e) => e.code === "23514",
    );
    let blocked = false;
    for (let n = 0; n < 100; n++) {
      blocked = (
        await root.query(
          "select exists(select 1 from pg_stat_activity where datname=$1 and wait_event_type='Lock' and query like '%implanta_commit_v2%') value",
          [name],
        )
      ).rows[0].value;
      if (blocked) break;
      await new Promise((r) => setTimeout(r, 20));
    }
    await master.query("commit");
    await waiting;
    assert.equal(blocked, true);
    checks += 2;
    // Recheck the writer too: assigning another eligible person does not let an
    // account complete a write after that account has been deactivated.
    await master.query("begin");
    await master.query(
      "select public.implanta_set_user($1,'editor',false,false)",
      [ids.editor],
    );
    const revokedWriter = assert.rejects(
      write(
        add(p, "revoked-writer", { ownerId: ids.manager, owner: "manager" }),
      ),
      (e) => e.code === "42501",
    );
    let writerBlocked = false;
    for (let n = 0; n < 100; n++) {
      writerBlocked = (
        await root.query(
          "select exists(select 1 from pg_stat_activity where datname=$1 and wait_event_type='Lock' and query like '%implanta_commit_v2%') value",
          [name],
        )
      ).rows[0].value;
      if (writerBlocked) break;
      await new Promise((r) => setTimeout(r, 20));
    }
    await master.query("commit");
    await revokedWriter;
    assert.equal(writerBlocked, true);
    checks += 2;
    await master.query(
      "select public.implanta_set_user($1,'editor',true,false)",
      [ids.editor],
    );
    const before = (await read()).project;
    await root.query(
      await migration("202610270001_activity_responsibility.sql"),
    );
    assert.deepEqual((await read()).project, before);
    checks++;
    // Removing a complete project remains possible with assigned work.
    const version = (
      await root.query(
        "select version from public.implanta_projects where id='p'",
      )
    ).rows[0].version;
    await master.query(
      "select public.implanta_commit_v2('[]','[]','[]',$1,null,false)",
      [JSON.stringify([{ id: "p", version }])],
    );
    assert.equal(
      (
        await root.query(
          "select count(*) from public.implanta_activity_records where project_id='p'",
        )
      ).rows[0].count,
      "0",
    );
    checks++;
    console.log(
      `${checks} verificações de responsáveis: criador, vínculo por ID, editores ativos, isolamento, mudança, permissões, concorrência e migração preservada.`,
    );
  } finally {
    await Promise.all(clients.map((c) => c.end()));
    await owner.query(`drop database if exists ${name}`);
  }
}
