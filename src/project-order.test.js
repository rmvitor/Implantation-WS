import test from "node:test";
import assert from "node:assert/strict";
import { orderedProjects, reorderProjects } from "./project-order.js";
import { validateBackup, deleteProject, setProjectClosed } from "./domain.js";
import { workspacePreferences } from "./team-domain.js";
import { createDemo } from "../tests/fixtures/workspace.js";

const fixture = () => {
  const data = createDemo();
  data.projects = ["a", "b", "c", "d"].map((id) => ({
    ...structuredClone(data.projects[0]),
    id,
    name: id,
  }));
  return data;
};
test("mover projeto salva somente a preferência, conserva registros e acrescenta projetos novos ao fim", () => {
  const data = fixture();
  const original = structuredClone(data);
  const moved = reorderProjects(data, "a", "c");
  assert.deepEqual(moved.projectOrder, ["b", "c", "a", "d"]);
  assert.deepEqual(moved.projects, original.projects);
  assert.deepEqual(data, original);
  assert.deepEqual(
    workspacePreferences(moved).projectOrder,
    moved.projectOrder,
  );
  assert.equal(Object.hasOwn(workspacePreferences(moved), "projects"), false);
  const projects = [{ id: "novo" }, ...moved.projects.slice().reverse()];
  assert.deepEqual(
    orderedProjects(projects, moved.projectOrder).map((p) => p.id),
    ["b", "c", "a", "d", "novo"],
  );
  assert.equal(reorderProjects(data, "desconhecido", "a"), data);
  assert.equal(reorderProjects(data, "a", "a"), data);
});
test("ordem funciona com filtros e backups e resiste a encerramento, exclusão e preferências antigas", () => {
  let data = reorderProjects(fixture(), "d", "a");
  const restored = validateBackup(JSON.parse(JSON.stringify(data)));
  assert.deepEqual(restored.projectOrder, ["d", "a", "b", "c"]);
  data = setProjectClosed(restored, "a", true);
  assert.deepEqual(
    orderedProjects(
      data.projects.filter((p) => p.status !== "closed"),
      data.projectOrder,
    ).map((p) => p.id),
    ["d", "b", "c"],
  );
  data = deleteProject(data, "b");
  assert.deepEqual(data.projectOrder, ["d", "a", "c"]);
  assert.deepEqual(
    validateBackup({ ...data, projectOrder: ["c", "c", "removido", "d"] })
      .projectOrder,
    ["c", "d"],
  );
  for (const invalid of [null, "a,b", [1], [{}]])
    assert.throws(
      () => validateBackup({ ...data, projectOrder: invalid }),
      /ordem dos projetos/,
    );
  assert.equal(Object.hasOwn(validateBackup(fixture()), "projectOrder"), false);
});
