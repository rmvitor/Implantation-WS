import { test } from "node:test";
import assert from "node:assert/strict";
import { isMyActivity, assignActivity } from "./activity-responsibility.js";
import {
  newActivity,
  configureHomologation,
  saveHomologationEntry,
} from "./domain.js";
import { instantiateTemplate } from "./operations.js";
import {
  displayPreferences,
  withoutDevicePreferences,
} from "./device-preferences.js";

test("apenas meus usa a conta responsável, não nome nem criador", () => {
  const actor = { id: "a", name: "Mesmo nome" };
  assert.equal(
    isMyActivity({ ownerId: "a", owner: "Nome antigo", createdBy: "b" }, actor),
    true,
  );
  assert.equal(
    isMyActivity({ ownerId: "b", owner: "Mesmo nome", createdBy: "a" }, actor),
    false,
  );
  assert.equal(isMyActivity({ owner: "Mesmo nome" }, actor), false);
  assert.equal(isMyActivity({ ownerId: "a" }, null), false);
});
test("trocar o responsável conserva autoria, checklist e dados da tarefa", () => {
  const task = {
    ...newActivity(),
    title: "Conferir",
    createdBy: "a",
    ownerId: "a",
    checklists: [{ entity: "Prefeitura", items: [] }],
  };
  const changed = assignActivity(task, { id: "b", name: "Colega" });
  assert.equal(changed.ownerId, "b");
  assert.equal(changed.owner, "Colega");
  assert.equal(changed.createdBy, "a");
  assert.deepEqual(changed.checklists, task.checklists);
  assert.equal(task.ownerId, "a");
  assert.throws(() => assignActivity(task, null));
});
test("novas tarefas e modelos online começam com a conta atual", () => {
  const actor = { id: "a", name: "Técnico" };
  assert.equal(newActivity("todo", "", actor).ownerId, "a");
  const task = instantiateTemplate(
    {
      activity: {
        title: "Modelo",
        owner: "Conta de outro projeto",
        ownerId: "foreign",
      },
    },
    [],
    actor,
  );
  assert.equal(task.ownerId, "a");
  assert.equal(task.owner, "Técnico");
});
test("apenas meus é uma preferência do aparelho, fora do workspace compartilhado", () => {
  const prefs = displayPreferences({
    boardOnlyMine: { p: true, q: false, invalid: "yes" },
  });
  assert.deepEqual(prefs.boardOnlyMine, { p: true, q: false });
  assert.deepEqual(
    withoutDevicePreferences({
      projects: [],
      boardOnlyMine: prefs.boardOnlyMine,
    }),
    { projects: [] },
  );
});

test("pendência gerada pela homologação recebe a conta do técnico", () => {
  const actor = { id: "a", name: "Técnico" };
  const project = configureHomologation(
    { id: "p", entities: ["Prefeitura"], tasks: [], trainings: [], logs: [] },
    [JSON.stringify(["Frota", "Prefeitura"])],
  );
  const entry = project.homologation.entries.find((item) => item.included);
  const next = saveHomologationEntry(
    project,
    { ...entry, status: "issue", notes: "Saldo divergente" },
    true,
    undefined,
    actor,
  );
  assert.equal(next.tasks[0].ownerId, actor.id);
  assert.equal(next.tasks[0].owner, actor.name);
});
