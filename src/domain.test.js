import test from "node:test";
import assert from "node:assert/strict";
import {
  createDemo,
  moveTask,
  saveActivity,
  isValidated,
  checklistProgress,
  matchesTask,
  validateBackup,
} from "./domain.js";

test("movimentação permite etapas em paralelo e mantém histórico de conclusão e reabertura", () => {
  const initial = createDemo().projects[0];
  const task = initial.tasks[0];
  assert.throws(() => moveTask(initial, task.id, "concluido"), /quem validou/);
  const completed = saveActivity(
    initial,
    {
      ...task,
      stage: "concluido",
      criterion: "Conferir os saldos e validar o relatório.",
      validation: {
        by: "Colega",
        at: "2026-10-08",
        evidence: "Relatório conferido: saldos reconciliados.",
      },
    },
    "2026-10-08T12:00:00.000Z",
  );
  assert.equal(completed.tasks[0].stage, "concluido");
  assert.equal(completed.tasks[0].completedAt, "2026-10-08T12:00:00.000Z");
  assert.equal(completed.logs[0].action, "concluída");
  assert.equal(initial.tasks[0].stage, "homologacao");
  assert.equal(completed.logs[0].validation.by, "Colega");
  const reopened = moveTask(completed, task.id, "todo");
  assert.equal(reopened.tasks[0].completedAt, null);
  assert.equal(reopened.logs.length, initial.logs.length + 2);
  assert.equal(reopened.tasks[0].validation, null);
  assert.equal(completed.logs[0].validation.by, "Colega");
  assert.equal(moveTask(reopened, task.id, "todo"), reopened);
  assert.equal(moveTask(reopened, task.id, "invalid"), reopened);
});

test("checklist completo não confirma conclusão ou validação", () => {
  const project = createDemo().projects[0];
  const task = project.tasks[3];
  assert.deepEqual(checklistProgress(task), { done: 3, total: 3 });
  assert.equal(isValidated(task), false);
  assert.throws(() => moveTask(project, task.id, "concluido"));
  const invalid = {
    ...task,
    stage: "concluido",
    criterion: "Conferir",
    validation: { by: "Colega", at: "invalid", evidence: "Print" },
  };
  assert.throws(() => saveActivity(project, invalid));
});

test("backup antigo migra situações sem perder números, checklists, notas ou registros", () => {
  const old = createDemo();
  old.version = 1;
  const stages = ["homologacao", "agenda", "pendencia", "chamado", "concluido"];
  old.projects[0].tasks = old.projects[0].tasks.slice(0, 5).map((t, i) => {
    const legacy = {
      ...t,
      stage: stages[i],
      description: "Contexto legado",
      ticket: i === 3 ? "872797" : "",
    };
    for (const key of [
      "type",
      "problem",
      "validation",
      "criterion",
      "attachments",
    ])
      delete legacy[key];
    return legacy;
  });
  const migrated = validateBackup(old);
  assert.equal(migrated.version, 2);
  assert.deepEqual(
    migrated.projects[0].tasks.map((t) => t.stage),
    ["homologacao", "todo", "todo", "waiting", "concluido"],
  );
  assert.equal(migrated.projects[0].tasks[3].type, "chamado");
  assert.equal(migrated.projects[0].tasks[3].ticket, "872797");
  assert.equal(migrated.projects[0].tasks[0].problem, "Contexto legado");
  assert.deepEqual(
    migrated.projects[0].tasks[0].checklists,
    old.projects[0].tasks[0].checklists,
  );
  assert.equal(migrated.projects[0].tasks[4].validation, null);
  assert.equal(isValidated(migrated.projects[0].tasks[4]), false);
  assert.deepEqual(migrated.projects[0].logs, old.projects[0].logs);
  assert.deepEqual(validateBackup(migrated), migrated);
  assert.equal(old.version, 1);
});

test("chamado é um tipo e pode circular por todas as situações de trabalho", () => {
  const project = createDemo().projects[0];
  const task = project.tasks[8];
  for (const stage of ["todo", "progress", "homologacao", "waiting"]) {
    const changed = moveTask(project, task.id, stage);
    const moved = changed.tasks.find((t) => t.id === task.id);
    assert.equal(moved.type, "chamado");
    assert.equal(moved.ticket, "872797");
    assert.equal(moved.stage, stage);
  }
});

test("progresso considera os checklists de todas as entidades", () => {
  const task = createDemo().projects[0].tasks[0];
  assert.deepEqual(checklistProgress(task), { done: 1, total: 6 });
  assert.deepEqual(checklistProgress({}), { done: 0, total: 0 });
});

test("busca encontra módulos, entidades e chamados sem depender de acentos", () => {
  const tasks = createDemo().projects[0].tasks;
  assert.equal(matchesTask(tasks[2], "patrimonio", "", ""), true);
  assert.equal(matchesTask(tasks[0], "saude", "", ""), true);
  assert.equal(matchesTask(tasks[8], "872797", "Patrimônio", "alta"), true);
  assert.equal(matchesTask(tasks[8], "", "Frotas", ""), false);
});

test("backup válido preserva dados e rejeita estrutura incompatível", () => {
  const backup = createDemo();
  assert.deepEqual(validateBackup(JSON.parse(JSON.stringify(backup))), backup);
  assert.throws(() => validateBackup({ projects: [] }));
  const invalid = structuredClone(backup);
  invalid.projects[0].tasks[0].checklists = null;
  assert.throws(() => validateBackup(invalid));
  const duplicate = structuredClone(backup);
  duplicate.projects.push(duplicate.projects[0]);
  assert.throws(() => validateBackup(duplicate));
  const invalidHistory = structuredClone(backup);
  invalidHistory.projects[0].logs[0].validation = {
    by: {},
    at: "2026-10-08",
    evidence: "Relatório",
  };
  assert.throws(() => validateBackup(invalidHistory));
  const invalidAttachment = structuredClone(backup);
  invalidAttachment.projects[0].tasks[0].attachments = [
    {
      id: "bad",
      name: "evidence.html",
      data: "data:text/html;base64,PGgxPk9sYTwvaDE+",
    },
  ];
  assert.throws(() => validateBackup(invalidAttachment));
});
