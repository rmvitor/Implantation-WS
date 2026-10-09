import test from "node:test";
import assert from "node:assert/strict";
import { projectColor } from "./project-identity.js";
import { validateBackup } from "./domain.js";
import { createDemo } from "../tests/fixtures/workspace.js";

test("cor do município sobrevive ao backup e dados antigos recebem uma cor estável sem serem alterados", () => {
  const data = createDemo();
  const project = data.projects[0];
  const before = structuredClone(project);
  const original = projectColor(project);
  assert.equal(projectColor({ ...project, name: "Novo nome" }), original);
  assert.deepEqual(project, before);
  assert.equal(Object.hasOwn(validateBackup(data).projects[0], "color"), false);
  project.color = "#be185d";
  const restored = validateBackup(JSON.parse(JSON.stringify(data)));
  assert.equal(restored.projects[0].color, "#be185d");
  assert.equal(projectColor(restored.projects[0]), "#be185d");
});

test("backup rejeita cores inválidas e o destaque usa uma cor segura para valores inesperados", () => {
  const data = createDemo();
  for (const color of [
    "red",
    "#fff",
    "url(https://example.invalid)",
    ["#2563eb"],
    null,
  ]) {
    data.projects[0].color = color;
    assert.throws(() => validateBackup(data), /cor do projeto/);
    assert.match(projectColor(data.projects[0]), /^#[0-9a-f]{6}$/i);
  }
});
