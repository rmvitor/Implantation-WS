import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createDemo } from "../tests/fixtures/workspace.js";
import {
  newActivity,
  validateBackup,
  configureHomologation,
  saveHomologationEntry,
  releaseHomologation,
} from "../src/domain.js";
import { createTeamService } from "../src/team-service.js";
import { projectRecords, assembleRecords } from "../src/records.js";

export async function testRecords({
  root,
  admin,
  editor,
  viewer,
  other,
  ids,
  denied,
}) {
  let checks = 0;
  await root.query(
    "insert into auth.users(id,email) values($1,'viewer@example.invalid') on conflict(id) do nothing",
    [ids.viewer],
  );
  await root.query("update public.implanta_profiles set active=true");
  const p = createDemo().projects[0];
  p.id = "normalized";
  p.cpf = "123.456.789-00";
  p.tasks = [
    {
      ...newActivity(),
      id: "t1",
      title: "Migrada",
      module: "Patrimônio",
      type: "chamado",
      stage: "waiting",
      ticket: "100",
      problem: "Saldos",
      criterion: "Conferir saldos",
    },
    { ...newActivity(), id: "t2", title: "Outra" },
    {
      ...newActivity(),
      id: "historic",
      title: "Conclusão histórica",
      stage: "concluido",
    },
  ];
  p.logs = [
    {
      id: "l1",
      taskId: "t1",
      title: "Migrada",
      action: "atualizada",
      at: "2026-10-01T12:00:00Z",
    },
  ];
  const legacyScope = JSON.stringify(["Patrimônio", p.entities[0]]);
  p.homologation = configureHomologation(
    p,
    [legacyScope],
    "2020-01-01T12:00:00Z",
  ).homologation;
  const legacyEntry = p.homologation.entries.find((e) => e.id === legacyScope);
  Object.assign(legacyEntry, {
    status: "ok",
    checks: legacyEntry.checks.map((c) => ({ ...c, done: true })),
    validatedBy: "Fiscal antigo",
    validatedAt: "2020-01-01T12:00:00Z",
    evidence: "Conferência histórica",
  });
  p.homologation.release = {
    by: "Fiscal antigo",
    at: "2020-01-01T12:00:00Z",
    scope: [legacyScope],
  };
  p.handovers = [
    {
      id: "pass",
      at: "2026-10-01T12:00:00Z",
      currentState: "Migração",
      pending: "saldo",
      nextStep: "conferir",
      responsible: "Ana",
      risks: "",
    },
  ];
  await admin.query("select public.implanta_create_project($1)", [p]);
  await admin.query("select public.implanta_grant_project($1,$2,$3)", [
    p.id,
    ids.editor,
    "editor",
  ]);
  await admin.query("select public.implanta_grant_project($1,$2,$3)", [
    p.id,
    ids.viewer,
    "viewer",
  ]);
  await root.query(
    await readFile(
      new URL(
        "../supabase/migrations/202610090002_records.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const read = async (c) =>
    (await c.query("select public.implanta_read_v2() data")).rows[0].data;
  const a = await read(admin),
    e = await read(editor),
    v = await read(viewer);
  assert.equal(
    a.records.find((r) => r.kind === "personal" && r.project_id === p.id).data
      .cpf,
    p.cpf,
  );
  checks++;
  assert.equal(
    e.records.find((r) => r.kind === "personal" && r.project_id === p.id).data
      .cpf,
    p.cpf,
  );
  assert.equal(
    v.records.some((r) => r.kind === "personal"),
    false,
  );
  checks++;
  assert.equal((await read(other)).records.length, 0);
  checks++;
  await denied(
    viewer,
    "select * from implanta_private.implanta_personal_records",
  );
  await denied(admin, "select data from public.implanta_projects");
  await denied(editor, "select public.implanta_save_project($1,$2,1)", [
    p.id,
    p,
  ]);
  await denied(
    editor,
    "select public.implanta_commit($1,$2,null)",
    [[], []],
    "55000",
  );
  const restored = assembleRecords(a.records).find((r) => r.id === p.id);
  assert.deepEqual(
    restored.tasks.map(({ updatedAt, updatedBy, ...t }) => t),
    p.tasks,
  );
  checks++;
  assert.deepEqual(restored.trainings, p.trainings);
  assert.deepEqual(restored.homologation, p.homologation);
  checks++;
  assert.deepEqual(restored.handovers, p.handovers);
  assert.deepEqual(restored.logs, p.logs);
  checks++;
  assert.equal(
    restored.tasks.find((t) => t.id === "t1").updatedAt,
    "2026-10-01T12:00:00+00:00",
  );
  checks++;
  assert.equal(
    restored.tasks.find((t) => t.id === "historic").validation,
    null,
  );
  checks++;
  const rpc = (c) => ({
    async rpc(name, args) {
      try {
        const keys = Object.keys(args || {});
        const result = await c.query(
          `select public.${name}(${keys.map((_, i) => "$" + (i + 1)).join(",")}) data`,
          keys.map((k) =>
            args[k] && typeof args[k] === "object"
              ? JSON.stringify(args[k])
              : args[k],
          ),
        );
        return { data: result.rows[0].data };
      } catch (error) {
        return { error };
      }
    },
  });
  const svc = createTeamService(rpc(editor), () => {}),
    second = createTeamService(rpc(editor), () => {});
  const base = await svc.load(),
    baseB = await second.load();
  const next = structuredClone(base);
  next.projects.find((x) => x.id === p.id).tasks[0].title = "Nova descrição";
  const saved = await svc.commit(base, next);
  assert.equal(
    saved.projects.find((x) => x.id === p.id).tasks[0].title,
    "Nova descrição",
  );
  checks++;
  const independent = structuredClone(baseB);
  independent.projects.find((x) => x.id === p.id).tasks[0].nextAction =
    "Comparar";
  const savedB = await second.commit(baseB, independent);
  assert.equal(
    savedB.projects.find((x) => x.id === p.id).tasks[0].title,
    "Nova descrição",
  );
  assert.equal(
    savedB.projects.find((x) => x.id === p.id).tasks[0].nextAction,
    "Comparar",
  );
  checks++;
  const conflict = structuredClone(baseB);
  conflict.projects.find((x) => x.id === p.id).tasks[0].title = "Sobrescrever";
  await assert.rejects(second.commit(baseB, conflict), /mesmo campo/);
  checks++;
  const commit = async (
    c,
    changes,
    removed = [],
    created = [],
    deleted = [],
    preferences = null,
    importing = false,
  ) =>
    c.query("select public.implanta_commit_v2($1,$2,$3,$4,$5,$6) data", [
      JSON.stringify(changes),
      JSON.stringify(removed),
      JSON.stringify(created),
      JSON.stringify(deleted),
      preferences,
      importing,
    ]);
  const records = (await read(editor)).records,
    core = records.find(
      (r) => r.project_id === p.id && r.kind === "activity" && r.id === "t1",
    );
  const context = records.find(
    (r) => r.project_id === p.id && r.kind === "context" && r.id === "t1",
  );
  await denied(
    viewer,
    "select public.implanta_commit_v2($1,$2,$3,$4,null,false)",
    [
      JSON.stringify([{ ...core, data: { ...core.data, title: "Bloqueada" } }]),
      "[]",
      "[]",
      "[]",
    ],
  );
  await assert.rejects(
    commit(editor, [{ ...core, revision: core.revision - 1 }]),
    (err) => err.code === "40001",
  );
  checks++;
  await assert.rejects(
    commit(editor, [
      {
        ...core,
        data: {
          ...core.data,
          stage: "concluido",
          validation: { by: "Nome forjado", at: "2000-01-01", evidence: "" },
        },
      },
    ]),
    /critério e evidência/,
  );
  checks++;
  await commit(editor, [
    {
      ...core,
      data: {
        ...core.data,
        stage: "concluido",
        validation: {
          by: "Nome forjado",
          actorId: ids.admin,
          at: "2000-01-01",
          evidence: "Saldo conferido",
        },
      },
    },
  ]);
  const stamped = (await read(editor)).records.find(
    (r) => r.kind === "activity" && r.project_id === p.id && r.id === "t1",
  ).data.validation;
  assert.equal(stamped.actorId, ids.editor);
  assert.equal(stamped.by, "editor");
  assert.equal(stamped.source, "server");
  assert.ok(Math.abs(Date.now() - Date.parse(stamped.at)) < 10000);
  checks++;
  const audit = (
    await editor.query(
      "select * from public.implanta_record_audit where project_id=$1 order by id desc limit 1",
      [p.id],
    )
  ).rows[0];
  assert.equal(audit.actor_id, ids.editor);
  assert.ok(audit.changed_fields.includes("validation"));
  checks++;
  await denied(
    editor,
    "update public.implanta_record_audit set actor_name=$1",
    ["forjado"],
  );
  const privacy = (await read(admin)).records.find(
    (r) => r.kind === "personal" && r.project_id === p.id,
  );
  await assert.rejects(
    commit(viewer, [privacy]),
    (err) => err.code === "42501",
  );
  checks++;
  await assert.rejects(
    commit(editor, [core], [], [], [], null, true),
    (err) => err.code === "42501",
  );
  checks++;
  // Full transaction rollback: a valid earlier record must not persist when a later one fails.
  const t2 = (await read(editor)).records.find(
    (r) => r.kind === "activity" && r.project_id === p.id && r.id === "t2",
  );
  await assert.rejects(
    commit(editor, [
      { ...t2, data: { ...t2.data, title: "Não persistir" } },
      { ...context, revision: 0 },
    ]),
    (err) => err.code === "40001",
  );
  assert.equal(
    (await read(editor)).records.find(
      (r) => r.kind === "activity" && r.project_id === p.id && r.id === "t2",
    ).data.title,
    "Outra",
  );
  checks++;
  // A stale delete includes every linked revision; a newer context invalidates the transaction.
  const deleting = (await read(editor)).records.filter(
    (r) => r.project_id === p.id && r.id === "t2",
  );
  const newContext = deleting.find((r) => r.kind === "context");
  await commit(editor, [
    {
      ...newContext,
      data: { ...newContext.data, problem: "Colega está editando" },
    },
  ]);
  await assert.rejects(
    commit(editor, [], deleting),
    (err) => err.code === "40001",
  );
  assert.ok(
    (await read(editor)).records.some(
      (r) => r.kind === "activity" && r.project_id === p.id && r.id === "t2",
    ),
  );
  checks++;
  assert.deepEqual(
    (
      await root.query(
        "select data from public.implanta_projects where id=$1",
        [p.id],
      )
    ).rows[0].data,
    p,
  );
  checks++;
  // Exercise new municipality, structured handoff, import and deletion using the actual client protocol.
  const adminService = createTeamService(rpc(admin), () => {}),
    adminBase = await adminService.load();
  const fresh = {
    ...structuredClone(p),
    id: "created-v2",
    name: "Município novo",
    tasks: [],
    logs: [],
    handovers: [],
  };
  const created = await adminService.commit(adminBase, {
    ...adminBase,
    projects: [...adminBase.projects, fresh],
  });
  assert.ok(created.projects.some((x) => x.id === "created-v2"));
  checks++;
  const imported = structuredClone(created);
  const target = imported.projects.find((x) => x.id === "created-v2");
  target.tasks = [
    {
      ...newActivity(),
      id: "import",
      title: "Histórica",
      stage: "concluido",
      criterion: "Conferir",
      validation: { by: "Histórico", at: "2020-01-01", evidence: "Relatório" },
      completedAt: "2020-01-01",
    },
  ];
  const importedResult = await adminService.commit(created, imported, {
    import: true,
  });
  const validated = importedResult.projects.find((x) => x.id === "created-v2")
    .tasks[0].validation;
  assert.equal(validated.by, "Histórico");
  assert.equal(validated.at, "2020-01-01");
  assert.equal(validated.source, "imported-unverified");
  checks++;
  const hbase = await adminService.load(),
    hp = hbase.projects.find((x) => x.id === "created-v2");
  hp.entities = ["Prefeitura"];
  const hid = JSON.stringify(["Patrimônio", "Prefeitura"]);
  let homologated = configureHomologation(hp, [hid]);
  let entry = homologated.homologation.entries.find((x) => x.id === hid);
  entry = {
    ...entry,
    status: "ok",
    checks: entry.checks.map((x) => ({ ...x, done: true })),
    validatedBy: "Forjado",
    evidence: "Relatórios",
  };
  homologated = saveHomologationEntry(homologated, entry);
  homologated = releaseHomologation(homologated, "Forjado");
  const hr = await adminService.commit(hbase, {
    ...hbase,
    projects: hbase.projects.map((x) => (x.id === hp.id ? homologated : x)),
  });
  assert.equal(
    hr.projects.find((x) => x.id === hp.id).homologation.release.actorId,
    ids.admin,
  );
  checks++;
  const approved = hr.projects
    .find((x) => x.id === hp.id)
    .homologation.entries.find((x) => x.id === hid);
  assert.equal(approved.validatedActorId, ids.admin);
  assert.equal(approved.validationSource, "server");
  checks++;
  const removed = await adminService.commit(hr, {
    ...hr,
    projects: hr.projects.filter((x) => x.id !== "created-v2"),
  });
  assert.equal(
    removed.projects.some((x) => x.id === "created-v2"),
    false,
  );
  checks++;
  console.log(
    `${checks} verificações adicionais: migração preservada, registros independentes, conflitos, autoria de servidor, CPF privado e importação aprovados.`,
  );
}
