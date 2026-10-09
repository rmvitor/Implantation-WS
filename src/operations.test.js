import test from "node:test";
import assert from "node:assert/strict";
import { createDemo } from "../tests/fixtures/workspace.js";
import { newActivity, validateBackup } from "./domain.js";
import {
  actionNow,
  actionLimits,
  instantiateTemplate,
  weeklyBulletin,
  stampChanges,
} from "./operations.js";
import { publicBackup, preserveOmittedData } from "./privacy.js";
import { mergeProject } from "./team-domain.js";

test("Ação agora usa 1/5 dias, separa atrasos e não inventa data de atualização", () => {
  const p = createDemo().projects[0];
  p.logs = [];
  p.tasks = [
    { ...newActivity(), id: "overdue", title: "Vencida", date: "2026-10-08" },
    { ...newActivity(), id: "near", title: "Amanhã", date: "2026-10-10" },
    { ...newActivity(), id: "future", title: "Depois", date: "2026-10-11" },
    {
      ...newActivity(),
      id: "stale",
      type: "chamado",
      stage: "waiting",
      updatedAt: "2026-10-04T12:00:00Z",
    },
    {
      ...newActivity(),
      id: "recent",
      type: "chamado",
      stage: "waiting",
      updatedAt: "2026-10-05T12:00:00Z",
    },
    { ...newActivity(), id: "unknown", type: "chamado", stage: "waiting" },
    { ...newActivity(), id: "done", stage: "concluido", date: "2026-10-01" },
  ];
  const actions = actionNow([p], {}, new Date("2026-10-09T12:00:00Z"));
  assert.deepEqual(
    actions.map((a) => a.task.id),
    ["overdue", "near", "stale", "unknown"],
  );
  assert.deepEqual(actions.find((a) => a.task.id === "unknown").reasons, [
    "Sem atualização registrada",
  ]);
  assert.equal(
    actionNow([{ ...p, status: "closed" }], {}, new Date("2026-10-09")).length,
    0,
  );
  assert.deepEqual(actionLimits({ nearDays: -1, staleDays: NaN }), {
    nearDays: 1,
    staleDays: 5,
  });
});
test("backup comum omite CPF e anexos sem apagar dados locais na restauração", () => {
  const data = createDemo();
  data.projects[0].cpf = "123.456.789-00";
  const task = data.projects[0].tasks[0];
  task.problem = "Fiscal: 12345678900";
  task.attachments = [
    { id: "a", name: "evidencia.txt", data: "data:text/plain;base64,QQ==" },
  ];
  const safe = publicBackup(data);
  assert.equal(safe.projects[0].cpf, "");
  assert.equal(safe.projects[0].tasks[0].problem, "Fiscal: ***.***.***-**");
  assert.deepEqual(safe.projects[0].tasks[0].attachments, []);
  const restored = preserveOmittedData(validateBackup(safe), data);
  assert.equal(restored.projects[0].cpf, data.projects[0].cpf);
  assert.deepEqual(restored.projects[0].tasks[0].attachments, task.attachments);
  assert.equal(data.projects[0].tasks[0].problem, "Fiscal: 12345678900");
});
test("modelo instancia IDs novos e não copia aceite, prazo, chamado ou anexos", () => {
  const model = {
    activity: {
      ...newActivity(),
      title: "Conferir",
      stage: "concluido",
      date: "2026-10-09",
      ticket: "10",
      validation: { by: "Teste" },
      attachments: [{}],
    },
    checks: ["Conferir saldo"],
  };
  const a = instantiateTemplate(model, ["Prefeitura"]),
    b = instantiateTemplate(model, ["Prefeitura"]);
  assert.notEqual(a.id, b.id);
  assert.notEqual(a.checklists[0].items[0].id, b.checklists[0].items[0].id);
  assert.equal(a.stage, "todo");
  assert.equal(a.validation, null);
  assert.equal(a.date, "");
  assert.equal(a.ticket, "");
  assert.deepEqual(a.attachments, []);
});
test("autoria no cliente mantém histórico importado e não gera conflito por horário automático", () => {
  const base = createDemo();
  const local = structuredClone(base),
    remote = structuredClone(base);
  local.projects[0].tasks[0].problem = "Alteração A";
  remote.projects[0].tasks[0].nextAction = "Alteração B";
  const stamped = stampChanges(
    base,
    local,
    { id: "u1", name: "Ana" },
    "2026-10-09T10:00:00Z",
  );
  const other = stampChanges(
    base,
    remote,
    { id: "u2", name: "Bia" },
    "2026-10-09T11:00:00Z",
  );
  const combined = mergeProject(
    base.projects[0],
    stamped.projects[0],
    other.projects[0],
  );
  assert.equal(combined.tasks[0].problem, "Alteração A");
  assert.equal(combined.tasks[0].nextAction, "Alteração B");
  assert.equal(stamped.projects[0].logs[0].actorId, "u1");
  assert.deepEqual(
    stamped.projects[0].logs.at(-1),
    base.projects[0].logs.at(-1),
  );
});
test("boletim limita avanços ao período e apresenta riscos somente quando registrados", () => {
  const p = createDemo().projects[0];
  p.logs = [
    { title: "Antes", action: "concluída", at: "2026-10-01" },
    { title: "Dentro", action: "validada", at: "2026-10-08" },
  ];
  p.handovers = [
    {
      at: "2026-10-09",
      nextStep: "Comparar saldos",
      responsible: "Ana",
      risks: "Viagem pode atrasar",
    },
  ];
  const text = weeklyBulletin([p], "2026-10-05", "2026-10-09", {});
  assert.match(text, /Dentro: validada/);
  assert.doesNotMatch(text, /- Antes:/);
  assert.match(text, /Viagem pode atrasar/);
  assert.match(text, /Comparar saldos · Ana/);
});
