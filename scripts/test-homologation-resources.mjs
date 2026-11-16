import pg from "pg";
import { preparedImplantation } from "../tests/fixtures/implantation.js";
import { configureHomologation, homologationId } from "../src/domain.js";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
export async function testHomologationResources(owner, connection) {
  const database = `homologation_resources_${process.pid}_${Date.now()}`,
    url = new URL(connection);
  url.pathname = "/" + database;
  const clients = [],
    ids = Object.fromEntries(
      ["master", "manager", "editor", "viewer", "other", "pending"].map((n) => [
        n,
        randomUUID(),
      ]),
    );
  let checks = 0;
  const open = async (who) => {
    const c = new pg.Client({ connectionString: url.href });
    await c.connect();
    clients.push(c);
    if (who) {
      await c.query(`set role ${who === "anon" ? "anon" : "authenticated"}`);
      if (who !== "anon")
        await c.query("select set_config('request.jwt.claim.sub',$1,false)", [
          ids[who],
        ]);
    }
    return c;
  };
  const sql = async (file) =>
    readFile(
      new URL("../supabase/migrations/" + file, import.meta.url),
      "utf8",
    );
  const rpc = async (c, name, args) =>
    (
      await c.query(
        `select public.${name}(${args.map((_, i) => "$" + (i + 1)).join(",")}) data`,
        args,
      )
    ).rows[0].data;
  const fail = async (c, name, args, code = "42501") => {
    await assert.rejects(rpc(c, name, args), (e) => e.code === code);
    checks++;
  };
  await owner.query(`create database ${database}`);
  try {
    const root = await open();
    await root.query(
      `create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`,
    );
    await root.query(await sql("202610090001_implanta.sql"));
    for (const [n, id] of Object.entries(ids))
      await root.query("insert into auth.users values($1,$2,$3)", [
        id,
        n + "@example.invalid",
        { display_name: n },
      ]);
    await root.query(
      "update public.implanta_profiles set active=true where id<>$1",
      [ids.pending],
    );
    await root.query("insert into implanta_private.admins values($1)", [
      ids.master,
    ]);
    for (const id of ["p", "foreign"])
      await root.query(
        "insert into public.implanta_projects(id,data,created_by) values($1,$2,$3)",
        [
          id,
          {
            ...configureHomologation(preparedImplantation(), [
              homologationId("Frota", "Prefeitura"),
            ]),
            id,
            name: id,
            status: "active",
          },
          ids[id === "p" ? "manager" : "other"],
        ],
      );
    await root.query(
      "insert into public.implanta_members values('p',$1,'editor'),('p',$2,'viewer'),('p',$3,'editor')",
      [ids.editor, ids.viewer, ids.pending],
    );
    await root.query(await sql("202610090002_records.sql"));
    await root.query(
      (await sql("202610150001_project_ownership.sql")).replaceAll(
        "SEU_EMAIL_MASTER",
        "master@example.invalid",
      ),
    );
    await root.query(await sql("202610240001_implantation_acceptance.sql"));
    const entry = JSON.stringify(["Frota", "Prefeitura"]);
    // Minimal Storage schema exercises the same SQL policies and metadata contract.
    // Bucket byte enforcement itself belongs to the real Supabase Storage service.
    await root.query(
      `create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);create table storage.objects(id uuid default gen_random_uuid(),bucket_id text references storage.buckets,name text,metadata jsonb,unique(bucket_id,name));alter table storage.objects enable row level security;grant usage on schema storage to anon,authenticated;grant select,insert,delete on storage.objects to authenticated;`,
    );
    const migration = await sql("202611160001_homologation_resources.sql");
    await root.query(migration);
    const validatorMigration = await sql(
      "202611160002_homologation_validator.sql",
    );
    const writer =
      "public.implanta_commit_v2(jsonb,jsonb,jsonb,jsonb,jsonb,boolean)";
    const currentDefinition = async () =>
      (
        await root.query("select pg_get_functiondef($1::regprocedure) value", [
          writer,
        ])
      ).rows[0].value;
    const originalDefinition = await currentDefinition();
    const originalAcl = (
      await root.query(
        "select proacl::text acl from pg_proc where oid=$1::regprocedure",
        [writer],
      )
    ).rows[0].acl;
    // Reproduce the old failure on valid writers whose BEGIN/access guard differ
    // only in formatting or already have a statement before the access check.
    const variants = [
      [
        "one-space indentation",
        originalDefinition.replace(
          "begin\n  if not implanta_private.enabled()",
          "begin\n if not implanta_private.enabled()",
        ),
      ],
      [
        "CRLF and tabs",
        originalDefinition.replace(
          "begin\n  if not implanta_private.enabled()",
          "BEGIN\r\n\tIF NOT implanta_private.enabled()",
        ),
      ],
      [
        "existing lock and comments",
        originalDefinition.replace(
          "begin\n  if not implanta_private.enabled()",
          "BEGIN\n perform pg_advisory_xact_lock(2026100901);\n -- início do gravador\n IF NOT implanta_private.enabled()",
        ),
      ],
      [
        "blank lines and one-line block",
        originalDefinition.replace(
          "begin\n  if not implanta_private.enabled()",
          "begin /* guarda de acesso */ if not implanta_private.enabled()",
        ),
      ],
    ];
    for (const [label, definition] of variants) {
      assert.notEqual(definition, originalDefinition, label);
      await root.query(definition);
      assert(
        !(await currentDefinition()).includes(
          "begin\n  if not implanta_private.enabled()",
        ),
        label + ": old guard would fail",
      );
      checks++;
      await root.query(validatorMigration);
      const patched = await currentDefinition();
      assert(
        patched.includes("implanta_private.homologation_validation("),
        label,
      );
      assert.match(patched, /if\s+not\s+implanta_private\.enabled\(\)/i, label);
      assert(
        patched.indexOf("pg_advisory_xact_lock(2026100901)") <
          patched.indexOf("-- Locks in deterministic order"),
        label,
      );
      assert.equal(
        (
          await root.query(
            "select proacl::text acl from pg_proc where oid=$1::regprocedure",
            [writer],
          )
        ).rows[0].acl,
        originalAcl,
      );
      checks++;
      await root.query(validatorMigration);
      assert.equal(
        await currentDefinition(),
        patched,
        label + ": repeat is idempotent",
      );
      checks++;
    }
    // An unrecognized access check still aborts and rolls back, rather than
    // bypassing permissions or partially replacing the writer.
    const unsupported = originalDefinition.replaceAll(
      "implanta_private.enabled()",
      "implanta_private.enabled_not_supported()",
    );
    await root.query(unsupported);
    const beforeFailure = await currentDefinition();
    await assert.rejects(
      root.query(validatorMigration),
      (e) => e.code === "P0001" && /Verificação de acesso/.test(e.message),
    );
    await root.query("rollback");
    assert.equal(await currentDefinition(), beforeFailure);
    checks++;
    await root.query(originalDefinition);
    await root.query(validatorMigration);
    const editor = await open("editor"),
      viewer = await open("viewer"),
      other = await open("other"),
      pending = await open("pending"),
      anon = await open("anon");
    const scope = ["p", "migration", entry],
      get = (c = editor) => rpc(c, "implanta_homologation_resources", scope);
    for (const c of [other, pending, anon])
      await fail(c, "implanta_homologation_resources", scope);
    await fail(editor, "implanta_homologation_resources", [
      "p",
      "migration",
      "unknown",
    ]);
    const initial = await get();
    assert.equal(initial.revision, 0);
    assert.deepEqual(initial.users.map((u) => u.name).sort(), [
      "editor",
      "manager",
      "master",
      "viewer",
    ]);
    checks++;
    await fail(viewer, "implanta_homologation_responsible", [
      ...scope,
      ids.viewer,
      0,
    ]);
    for (const id of [ids.other, ids.pending])
      await fail(
        editor,
        "implanta_homologation_responsible",
        [...scope, id, 0],
        "23514",
      );
    const saved = await rpc(editor, "implanta_homologation_responsible", [
      ...scope,
      ids.viewer,
      0,
    ]);
    assert.equal(saved.responsibleName, "viewer");
    assert.equal(saved.audit[0].actor_name, "editor");
    checks++;
    assert.equal(saved.validatorVersion, 1);
    checks++;
    const row = (
      await root.query(
        "select * from public.implanta_conference_records where project_id='p' and id=$1",
        [entry],
      )
    ).rows[0];
    const approval = {
      ...row.data,
      status: "ok",
      checks: row.data.checks.map((c) => ({ ...c, done: true })),
      evidence: "Relatórios comparados",
      validatedBy: "Forjado",
      validatedActorId: ids.other,
      recordedActorId: ids.other,
      recordedBy: "Forjado",
      responsibleRevision: 1,
    };
    const commitApproval = (data, revision) =>
      rpc(editor, "implanta_commit_v2", [
        JSON.stringify([
          { project_id: "p", kind: "conference", id: entry, data, revision },
        ]),
        "[]",
        "[]",
        "[]",
        null,
        false,
      ]);
    await commitApproval(approval, row.revision);
    const confirmed = (
      await root.query(
        "select * from public.implanta_conference_records where project_id='p' and id=$1",
        [entry],
      )
    ).rows[0];
    assert.equal(confirmed.data.validatedBy, "viewer");
    assert.equal(confirmed.data.validatedActorId, ids.viewer);
    assert.equal(confirmed.data.recordedBy, "editor");
    assert.equal(confirmed.data.recordedActorId, ids.editor);
    assert.equal(confirmed.data.responsibleRevision, undefined);
    checks++;
    await assert.rejects(
      commitApproval(
        {
          ...confirmed.data,
          notes: "Tentativa inválida",
          validatedResponsibleId: ids.other,
          responsibleRevision: 1,
        },
        confirmed.revision,
      ),
      (e) => e.code === "23514",
    );
    checks++;
    const reopened = {
      ...confirmed.data,
      status: "pending",
      validatedBy: "",
      validatedAt: "",
      validatedResponsibleId: ids.manager,
      responsibleRevision: 1,
    };
    await commitApproval(reopened, confirmed.revision);
    assert.equal((await get()).responsibleId, ids.manager);
    checks++;
    const pendingRow = (
      await root.query(
        "select * from public.implanta_conference_records where project_id='p' and id=$1",
        [entry],
      )
    ).rows[0];
    assert.equal(pendingRow.data.status, "pending");
    assert.equal(pendingRow.data.validatedBy, "");
    checks++;
    await commitApproval(
      {
        ...approval,
        validatedResponsibleId: ids.viewer,
        responsibleRevision: 2,
      },
      pendingRow.revision,
    );
    const currentApproved = (
      await root.query(
        "select * from public.implanta_conference_records where project_id='p' and id=$1",
        [entry],
      )
    ).rows[0];
    assert.equal(currentApproved.data.validatedBy, "viewer");
    checks++;

    const audit = (
      await root.query(
        "select actor_id,actor_name from public.implanta_record_audit where project_id='p' and kind='conference' and record_id=$1 order by id desc limit 1",
        [entry],
      )
    ).rows[0];
    assert.equal(audit.actor_id, ids.editor);
    assert.equal(audit.actor_name, "editor");
    checks++;
    await assert.rejects(
      commitApproval(
        { ...approval, responsibleRevision: 0 },
        currentApproved.revision,
      ),
      (e) => e.code === "40001",
    );
    checks++;
    await root.query(validatorMigration);
    assert.equal(
      (
        await root.query(
          "select data from public.implanta_conference_records where project_id='p' and id=$1",
          [entry],
        )
      ).rows[0].data.validatedBy,
      "viewer",
    );
    checks++;

    await fail(
      editor,
      "implanta_homologation_responsible",
      [...scope, ids.manager, 0],
      "40001",
    );
    const otherScope = await rpc(editor, "implanta_homologation_resources", [
      "p",
      "implantation",
      entry,
    ]);
    assert.equal(otherScope.responsibleId, null);
    checks++;
    const file = randomUUID(),
      reserve = (size = 15728640, id = file) => [
        ...scope,
        id,
        "comparação.pdf",
        size,
      ];
    await fail(viewer, "implanta_homologation_file_reserve", reserve());
    await fail(
      editor,
      "implanta_homologation_file_reserve",
      reserve(15728641),
      "23514",
    );
    await fail(
      editor,
      "implanta_homologation_file_reserve",
      reserve(0),
      "23514",
    );
    await rpc(editor, "implanta_homologation_file_reserve", reserve());
    assert.equal((await get()).files[0].state, "pending");
    assert.equal((await get(viewer)).files.length, 0);
    checks++;
    await assert.rejects(
      other.query(
        "insert into storage.objects(bucket_id,name,metadata) values('homologation-attachments',$1,'{\"size\":15728640}')",
        [file],
      ),
      (e) => e.code === "42501",
    );
    checks++;
    await editor.query(
      "insert into storage.objects(bucket_id,name,metadata) values('homologation-attachments',$1,'{\"size\":15728640}')",
      [file],
    );
    await fail(editor, "implanta_homologation_file_forget", [file], "23514");
    const finished = await rpc(editor, "implanta_homologation_file_finish", [
      file,
    ]);
    assert.equal(finished.files[0].state, "ready");
    assert.equal((await get(viewer)).files.length, 1);
    checks++;
    await rpc(editor, "implanta_homologation_file_finish", [file]);
    assert.equal(
      (await get()).audit.filter((a) => a.action === "file_added").length,
      1,
    );
    checks++;
    assert.equal(
      (
        await viewer.query("select * from storage.objects where name=$1", [
          file,
        ])
      ).rows.length,
      1,
    );
    assert.equal(
      (await other.query("select * from storage.objects")).rows.length,
      0,
    );
    checks++;
    assert.equal(
      (await viewer.query("delete from storage.objects returning *")).rows
        .length,
      0,
    );
    checks++;
    await root.query(migration);
    await root.query(validatorMigration);
    assert.equal((await get()).files.length, 1);
    checks++;
    await root.query(
      "delete from public.implanta_members where project_id='p' and user_id=$1",
      [ids.viewer],
    );
    await fail(viewer, "implanta_homologation_resources", scope);
    assert.equal(
      (await viewer.query("select * from storage.objects")).rows.length,
      0,
    );
    checks++;
    await fail(
      editor,
      "implanta_homologation_responsible",
      [...scope, ids.viewer, 1],
      "23514",
    );
    await root.query(
      "update public.implanta_municipality_records set data=jsonb_set(data,'{status}','\"closed\"') where project_id='p'",
    );
    await fail(
      editor,
      "implanta_homologation_file_reserve",
      reserve(1, randomUUID()),
    );
    assert.equal(
      (await editor.query("delete from storage.objects returning *")).rows
        .length,
      0,
    );
    checks++;
    await root.query(
      "update public.implanta_municipality_records set data=jsonb_set(data,'{status}','\"active\"') where project_id='p'",
    );
    await rpc(editor, "implanta_homologation_file_delete_begin", [file]);
    await fail(editor, "implanta_homologation_file_finish", [file], "40001");
    await editor.query("delete from storage.objects where name=$1", [file]);
    await rpc(editor, "implanta_homologation_file_forget", [file]);
    assert.equal((await get()).files.length, 0);
    checks++;
    const bad = randomUUID();
    await rpc(editor, "implanta_homologation_file_reserve", reserve(10, bad));
    await editor.query(
      "insert into storage.objects(bucket_id,name,metadata) values('homologation-attachments',$1,'{\"size\":11}')",
      [bad],
    );
    await fail(editor, "implanta_homologation_file_finish", [bad], "23514");
    await rpc(editor, "implanta_homologation_file_delete_begin", [bad]);
    await editor.query("delete from storage.objects where name=$1", [bad]);
    await rpc(editor, "implanta_homologation_file_forget", [bad]);
    const b = (
      await root.query(
        "select * from storage.buckets where id='homologation-attachments'",
      )
    ).rows[0];
    assert.equal(b.public, false);
    assert.equal(Number(b.file_size_limit), 15728640);
    checks++;
    await assert.rejects(
      editor.query("select * from implanta_private.homologation_files"),
      (e) => e.code === "42501",
    );
    checks++;
    assert.equal(
      (await root.query("select count(*) from public.implanta_projects"))
        .rows[0].count,
      "2",
    );
    checks++;
  } finally {
    await Promise.all(clients.map((c) => c.end()));
    await owner.query(`drop database ${database}`);
  }
  console.log(
    `${checks} verificações de responsável/anexos: escopo, permissões, privacidade, 15 MB, conflitos e recuperação aprovadas.`,
  );
}
