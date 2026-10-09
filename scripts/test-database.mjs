import pg from "pg";
import { testRecords } from "./test-records.mjs";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Isolated disposable database. Never apply the test fixtures to a live project.
const url = new URL(
  process.env.IMPLANTA_TEST_DATABASE_URL ||
    "postgres://postgres@127.0.0.1:55432/postgres",
);
const database = `implanta_test_${process.pid}_${Date.now()}`;
const owner = new pg.Client({ connectionString: url.href });
await owner.connect();
const clients = [];
let checks = 0;
const ids = Object.fromEntries(
  ["admin", "editor", "viewer", "pending", "other"].map((name, i) => [
    name,
    `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
  ]),
);
const project = (id, name = id) => ({
  id,
  name,
  status: "active",
  entities: [],
  tasks: [],
  trainings: [],
  logs: [],
});
async function denied(client, sql, values = [], code = "42501") {
  await assert.rejects(client.query(sql, values), (e) => e.code === code);
  checks++;
}
async function count(client, table) {
  return Number(
    (await client.query(`select count(*) from public.${table}`)).rows[0].count,
  );
}
try {
  await owner.query(`create database ${database}`);
  await owner.query(`do $$ begin
    if not exists(select from pg_roles where rolname='anon') then create role anon nologin; end if;
    if not exists(select from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  end $$`);
  url.pathname = `/${database}`;
  const root = new pg.Client({ connectionString: url.href });
  await root.connect();
  clients.push(root);
  await root.query(`create schema auth;
    create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;`);
  await root.query(
    await readFile(
      new URL(
        "../supabase/migrations/202610090001_implanta.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  assert.equal(await count(root, "implanta_projects"), 0);
  checks++;
  for (const [name, id] of Object.entries(ids)) {
    await root.query(
      "insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)",
      [id, `${name}@example.invalid`, { display_name: name, admin: true }],
    );
  }
  assert.equal(
    (await root.query("select count(*) from implanta_private.admins")).rows[0]
      .count,
    "0",
  );
  checks++;
  assert.equal(
    (
      await root.query(
        "select count(*) from public.implanta_profiles where active",
      )
    ).rows[0].count,
    "0",
  );
  checks++;
  await root.query(
    "update public.implanta_profiles set active=true where id=$1",
    [ids.admin],
  );
  await root.query("insert into implanta_private.admins values($1)", [
    ids.admin,
  ]);
  const as = async (name, role = "authenticated") => {
    const c = new pg.Client({ connectionString: url.href });
    await c.connect();
    clients.push(c);
    await c.query(`set role ${role}`);
    if (name)
      await c.query("select set_config('request.jwt.claim.sub',$1,false)", [
        ids[name],
      ]);
    return c;
  };
  const admin = await as("admin"),
    editor = await as("editor"),
    viewer = await as("viewer"),
    pending = await as("pending"),
    other = await as("other"),
    anon = await as(null, "anon");
  for (const name of ["editor", "viewer", "other"])
    await admin.query("select public.implanta_set_user($1,$2,true,false)", [
      ids[name],
      name,
    ]);
  await denied(pending, "select public.implanta_create_project($1)", [
    project("blocked"),
  ]);
  await denied(anon, "select * from public.implanta_projects");
  await denied(anon, "select public.implanta_access()");
  const viewerAgenda = {
    personalAgenda: [
      {
        id: "private-trip",
        title: "Viagem do usuário",
        kind: "travel",
        date: "2026-10-13",
        endDate: "2026-10-16",
        allDay: true,
        time: "",
        endTime: "",
        tentative: true,
        place: "Local pessoal",
        notes: "",
      },
    ],
  };
  await viewer.query("select public.implanta_commit($1,$2,$3)", [
    "[]",
    "[]",
    JSON.stringify(viewerAgenda),
  ]);
  assert.deepEqual(
    (
      await viewer.query("select data from public.implanta_preferences")
    ).rows.map((row) => row.data),
    [viewerAgenda],
  );
  checks++;
  assert.equal(await count(admin, "implanta_preferences"), 0);
  checks++;
  assert.equal(await count(other, "implanta_preferences"), 0);
  checks++;
  await denied(anon, "select * from public.implanta_preferences");
  await denied(
    editor,
    "update public.implanta_preferences set data='{}' where user_id=$1",
    [ids.viewer],
  );
  for (const id of ["one", "two"])
    await admin.query("select public.implanta_create_project($1)", [
      project(id),
    ]);
  for (const [name, role] of [
    ["editor", "editor"],
    ["viewer", "viewer"],
  ])
    await admin.query("select public.implanta_grant_project($1,$2,$3)", [
      "one",
      ids[name],
      role,
    ]);
  assert.equal(await count(editor, "implanta_projects"), 1);
  checks++;
  assert.equal(await count(other, "implanta_projects"), 0);
  checks++;
  assert.equal(await count(admin, "implanta_projects"), 2);
  checks++;
  await denied(editor, "select public.implanta_grant_project($1,$2,$3)", [
    "two",
    ids.editor,
    "editor",
  ]);
  await denied(editor, "select public.implanta_set_user($1,$2,true,true)", [
    ids.editor,
    "editor",
  ]);
  await denied(editor, "select public.implanta_admin_users()");
  await denied(editor, "update public.implanta_projects set version=999");
  await denied(editor, "update public.implanta_profiles set active=true");
  await denied(editor, "select public.implanta_create_project($1)", [
    project("three"),
  ]);
  await denied(editor, "select public.implanta_delete_project($1,$2)", [
    "one",
    1,
  ]);
  await denied(viewer, "select public.implanta_save_project($1,$2,$3)", [
    "one",
    project("one", "viewer edit"),
    1,
  ]);
  await denied(editor, "select public.implanta_save_project($1,$2,$3)", [
    "two",
    project("two"),
    1,
  ]);
  await denied(editor, "select public.implanta_save_project($1,$2,$3)", [
    "one",
    { ...project("one"), status: "closed" },
    1,
  ]);
  await editor.query("select public.implanta_save_project($1,$2,$3)", [
    "one",
    project("one", "editor change"),
    1,
  ]);
  assert.equal(
    (
      await admin.query(
        "select version from public.implanta_projects where id='one'",
      )
    ).rows[0].version,
    "2",
  );
  checks++;
  await denied(
    admin,
    "select public.implanta_save_project($1,$2,$3)",
    ["one", project("one", "outdated"), 1],
    "40001",
  );
  assert.equal(
    (
      await admin.query(
        "select actor_id from public.implanta_audit where project_id='one' order by id desc limit 1",
      )
    ).rows[0].actor_id,
    ids.editor,
  );
  checks++;
  assert.equal(await count(editor, "implanta_notifications"), 1);
  checks++;
  assert.deepEqual(
    Object.keys(
      (await editor.query("select * from public.implanta_notifications"))
        .rows[0],
    ).sort(),
    ["revision", "user_id"],
  );
  checks++;
  await denied(
    admin,
    "select public.implanta_set_user($1,$2,false,false)",
    [ids.admin, "admin"],
    "P0001",
  );
  // Whole import rolls back, including its first successful operation and audit.
  await denied(
    admin,
    "select public.implanta_commit($1,$2,$3)",
    [
      JSON.stringify([
        { id: "three", create: true, data: project("three") },
        { id: "bad", create: true, data: { id: "bad" } },
      ]),
      "[]",
      null,
    ],
    "P0001",
  );
  assert.equal(await count(admin, "implanta_projects"), 2);
  checks++;
  const secondEditor = await as("editor");
  const race = await Promise.allSettled(
    [editor, secondEditor].map((c, i) =>
      c.query("select public.implanta_save_project($1,$2,$3)", [
        "one",
        project("one", `race ${i}`),
        2,
      ]),
    ),
  );
  assert.equal(race.filter((r) => r.status === "fulfilled").length, 1);
  checks++;
  assert.equal(race.find((r) => r.status === "rejected").reason.code, "40001");
  checks++;
  await admin.query("select public.implanta_grant_project($1,$2,null)", [
    "one",
    ids.editor,
  ]);
  assert.equal(await count(editor, "implanta_projects"), 0);
  checks++;
  await denied(editor, "select public.implanta_save_project($1,$2,$3)", [
    "one",
    project("one"),
    3,
  ]);
  await admin.query("select public.implanta_set_user($1,$2,false,false)", [
    ids.viewer,
    "viewer",
  ]);
  assert.equal(await count(viewer, "implanta_projects"), 0);
  checks++;
  await denied(viewer, "select public.implanta_save_preferences($1)", [{}]);
  await denied(other, "select * from implanta_private.admins");
  await admin.query("select public.implanta_delete_project($1,$2)", ["one", 3]);
  assert.equal(await count(admin, "implanta_members"), 0);
  checks++;
  await root.query("delete from auth.users where id=$1", [ids.viewer]);
  console.log(
    `${checks} verificações PostgreSQL: permissões, isolamento, concorrência e importação atômica aprovadas.`,
  );
  await testRecords({root,admin,editor,viewer,other,ids,denied});
} finally {
  await Promise.all(clients.map((c) => c.end()));
  await owner.query(`drop database if exists ${database}`);
  await owner.end();
}
