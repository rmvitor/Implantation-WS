import { createDemo } from "../tests/fixtures/workspace.js";
import test from "node:test";
import assert from "node:assert/strict";
import {
  createEmptyWorkspace,
  isProjectClosed,
  setProjectClosed,
  deleteProject,
  clearWorkspace,
  homologationId,
  homologationMatrix,
  homologationProgress,
  configureHomologation,
  saveHomologationEntry,
  releaseHomologation,
  updateProjectEntities,
  sortActivities,
  cardSummary,
  newActivity,
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
  assert.deepEqual(
    validateBackup(createEmptyWorkspace()),
    createEmptyWorkspace(),
  );
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

test("prioridade ordena sem alterar ordem original, categorias e números sobrevivem ao backup", () => {
  const tasks = [
    { ...newActivity(), title: "Menor", priority: "baixa" },
    { ...newActivity(), title: "Normal", priority: "normal" },
    {
      ...newActivity(),
      title: "Primeira alta",
      priority: "alta",
      type: "pendencia",
      ticket: "904321",
    },
    {
      ...newActivity(),
      title: "Segunda alta",
      priority: "alta",
      type: "agenda",
    },
  ];
  assert.deepEqual(
    sortActivities(tasks, "priority").map((t) => t.title),
    ["Primeira alta", "Segunda alta", "Normal", "Menor"],
  );
  assert.equal(sortActivities(tasks), tasks);
  assert.equal(tasks[0].title, "Menor");
  assert.equal(cardSummary(tasks[2]), "Primeira alta — #904321");
  assert.equal(cardSummary(tasks[0]), "Menor");
  const backup = createDemo();
  backup.appearance = { theme: "dark", primary: "#7c3aed" };
  backup.boardOrders = { "quatro-barras": "priority" };
  backup.projects[0].tasks = tasks;
  const restored = validateBackup(backup);
  assert.deepEqual(restored.appearance, backup.appearance);
  assert.deepEqual(restored.boardOrders, backup.boardOrders);
  assert.equal(restored.projects[0].tasks[2].type, "pendencia");
  assert.equal(restored.projects[0].tasks[2].ticket, "904321");
  assert.equal(restored.projects[0].tasks[3].type, "agenda");
});

test("homologação considera apenas os módulos e entidades previstos e não aproveita OKs do quadro", () => {
  const project = createDemo().projects[0];
  assert.deepEqual(homologationProgress(project), {
    total: 0,
    done: 0,
    issues: 0,
    ready: false,
    released: false,
    percent: 0,
  });
  const selected = [
    homologationId("Patrimônio", "Prefeitura"),
    homologationId("Frota", "Fundo de Saúde"),
  ];
  const configured = configureHomologation(project, selected);
  assert.equal(homologationProgress(configured).total, 2);
  assert.equal(homologationProgress(configured).done, 0);
  assert.deepEqual(configured.tasks, project.tasks);
  assert.throws(
    () => releaseHomologation(configured, "Vitor"),
    /todos os módulos/,
  );
  assert.throws(
    () =>
      configureHomologation(project, [
        homologationId("Frota", "Entidade inexistente"),
      ]),
    /deste projeto/,
  );
});
function approved(project, id) {
  const entry = homologationMatrix(project).find((e) => e.id === id);
  return {
    ...entry,
    status: "ok",
    checks: entry.checks.map((c) => ({ ...c, done: true })),
    validatedBy: "Vitor",
    evidence: "Relatório antigo e novo comparados, totais conciliados.",
  };
}
test("OK exige conferência, responsável e referência; liberação conserva evidências no histórico", () => {
  const id = homologationId("Patrimônio", "Prefeitura");
  let project = configureHomologation(createDemo().projects[0], [id]);
  const draft = approved(project, id);
  assert.throws(
    () => saveHomologationEntry(project, { ...draft, checks: [] }),
    /conferência/,
  );
  assert.throws(
    () =>
      saveHomologationEntry(project, {
        ...draft,
        checks: draft.checks.map((c) => ({ ...c, done: false })),
      }),
    /conferência/,
  );
  assert.throws(
    () => saveHomologationEntry(project, { ...draft, validatedBy: " " }),
    /inválida|quem/,
  );
  project = saveHomologationEntry(
    project,
    draft,
    false,
    "2026-10-09T12:00:00Z",
  );
  assert.equal(homologationProgress(project).ready, true);
  assert.throws(() => releaseHomologation(project, " "), /quem/);
  const released = releaseHomologation(
    project,
    "Colega",
    "2026-10-09T13:00:00Z",
  );
  assert.equal(homologationProgress(released).released, true);
  assert.equal(released.logs[0].validation.by, "Colega");
  assert.match(released.logs[0].validation.evidence, /Patrimônio · Prefeitura/);
  const reopened = saveHomologationEntry(released, {
    ...draft,
    status: "pending",
  });
  assert.equal(homologationProgress(reopened).released, false);
  assert.equal(homologationProgress(reopened).done, 0);
  assert.equal(reopened.logs[1].validation.by, "Colega");
});
test("alteração de escopo ou entidades reabre liberação e preserva OKs das combinações mantidas", () => {
  const first = homologationId("Patrimônio", "Prefeitura");
  const second = homologationId("Frota", "Prefeitura");
  let project = configureHomologation(createDemo().projects[0], [first]);
  project = saveHomologationEntry(project, approved(project, first));
  project = releaseHomologation(project, "Vitor");
  const changed = configureHomologation(project, [first, second]);
  assert.equal(homologationProgress(changed).done, 1);
  assert.equal(homologationProgress(changed).ready, false);
  assert.equal(changed.homologation.release, null);
  const removed = updateProjectEntities(project, {
    ...project,
    entities: ["Fundo de Saúde"],
  });
  assert.equal(removed.homologation.release, null);
  assert.equal(homologationProgress(removed).total, 0);
  const restored = updateProjectEntities(removed, {
    ...removed,
    entities: project.entities,
  });
  assert.equal(homologationProgress(restored).released, false);
  assert.equal(homologationProgress(restored).done, 1);
});
test("divergência gera pendência vinculada uma única vez, sem alterar resultado automaticamente", () => {
  const id = homologationId("Almoxarifado", "Prefeitura");
  const project = configureHomologation(createDemo().projects[0], [id]);
  const entry = homologationMatrix(project).find((e) => e.id === id);
  const draft = {
    ...entry,
    status: "issue",
    notes: "Saldo de material divergente",
  };
  const changed = saveHomologationEntry(project, draft, true);
  assert.equal(changed.tasks.length, project.tasks.length + 1);
  const linked = changed.tasks.at(-1);
  assert.equal(linked.type, "pendencia");
  assert.equal(linked.homologationEntryId, id);
  assert.equal(homologationProgress(changed).issues, 1);
  const repeated = saveHomologationEntry(changed, draft, true);
  assert.equal(repeated.tasks.length, changed.tasks.length);
  const completed = saveActivity(repeated, {
    ...linked,
    stage: "concluido",
    criterion: "Conferir saldo",
    validation: { by: "Colega", at: "2026-10-09", evidence: "Saldo corrigido" },
  });
  assert.equal(homologationProgress(completed).done, 0);
});
test("backup de homologação preserva escopo, rotinas e liberação e rejeita aprovações incompletas", () => {
  const id = homologationId("Elicita", "Prefeitura");
  const data = createDemo();
  let project = configureHomologation(data.projects[0], [id]);
  project = saveHomologationEntry(project, approved(project, id));
  data.projects[0] = releaseHomologation(project, "Vitor");
  assert.deepEqual(validateBackup(JSON.parse(JSON.stringify(data))), data);
  const invalid = structuredClone(data);
  invalid.projects[0].homologation.entries.find(
    (e) => e.id === id,
  ).checks[0].done = false;
  assert.throws(() => validateBackup(invalid), /homologação/);
  const duplicate = structuredClone(data);
  duplicate.projects[0].homologation.entries.push(
    duplicate.projects[0].homologation.entries[0],
  );
  assert.throws(() => validateBackup(duplicate), /homologação/);
});

test("workspace vazio é válido e projetos antigos continuam ativos", () => {
  const empty = createEmptyWorkspace();
  assert.deepEqual(validateBackup(JSON.parse(JSON.stringify(empty))), empty);
  assert.equal(isProjectClosed(createDemo().projects[0]), false);
  const invalid = createDemo();
  invalid.projects[0].status = "desconhecido";
  assert.throws(() => validateBackup(invalid), /situação do projeto/);
});
test("encerrar e reabrir preserva tarefas, homologação e histórico e seleciona outro ativo", () => {
  const workspace = createDemo();
  const first = workspace.projects[0];
  workspace.projects.push({
    ...structuredClone(first),
    id: "p2",
    name: "Outro município",
  });
  const closed = setProjectClosed(
    workspace,
    first.id,
    true,
    "2026-10-09T12:00:00Z",
  );
  assert.equal(closed.selectedId, "p2");
  assert.equal(isProjectClosed(closed.projects[0]), true);
  assert.deepEqual(closed.projects[0].tasks, first.tasks);
  assert.deepEqual(closed.projects[0].trainings, first.trainings);
  assert.equal(closed.projects[0].logs[0].action, "projeto encerrado");
  assert.equal(isProjectClosed(workspace.projects[0]), false);
  const reopened = setProjectClosed(
    closed,
    first.id,
    false,
    "2026-10-09T13:00:00Z",
  );
  assert.equal(isProjectClosed(reopened.projects[0]), false);
  assert.equal(reopened.projects[0].closedAt, null);
  assert.equal(reopened.projects[0].logs[1].action, "projeto encerrado");
  assert.deepEqual(validateBackup(reopened), reopened);
});
test("excluir último projeto gera workspace vazio válido e remove preferências do projeto", () => {
  const workspace = createDemo();
  workspace.boardViews = { "quatro-barras": "table" };
  workspace.boardOrders = { "quatro-barras": "priority" };
  const deleted = deleteProject(workspace, "quatro-barras");
  assert.equal(deleted.projects.length, 0);
  assert.equal(deleted.selectedId, "");
  assert.deepEqual(deleted.boardViews, {});
  assert.deepEqual(deleted.boardOrders, {});
  assert.deepEqual(validateBackup(deleted), deleted);
  assert.equal(workspace.projects.length, 1);
});
test("limpeza remove todos os dados dos projetos e conserva apenas aparência", () => {
  const data = createDemo();
  data.appearance = { theme: "dark", primary: "#7c3aed" };
  data.boardViews = { "quatro-barras": "kanban" };
  const empty = clearWorkspace(data);
  assert.deepEqual(empty, {
    ...createEmptyWorkspace(),
    appearance: data.appearance,
  });
  assert.equal(data.projects.length, 1);
});
