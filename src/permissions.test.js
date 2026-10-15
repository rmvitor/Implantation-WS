import { test } from "node:test";
import assert from "node:assert/strict";
import { accountRole, canCreateProject, canManageProject, canEditProject, projectAccessLabel } from "./permissions.js";

test("Master mantém controle global; dono gerencia somente seus projetos", () => {
  const owner = { id: "a", active: true, rolesVersion: 1, master: false, projectRoles: [{ id: "own", ownerId: "a" }, { id: "shared", ownerId: "b" }] };
  const grants = [{ project_id: "shared", user_id: "a", role: "viewer" }];
  assert.equal(canCreateProject(owner), true);
  assert.equal(canManageProject(owner, "own"), true);
  assert.equal(canEditProject(owner, [], "own"), true);
  assert.equal(projectAccessLabel(owner, [], "own"), "Gestor do projeto");
  assert.equal(canManageProject(owner, "shared"), false);
  assert.equal(canEditProject(owner, grants, "shared"), false);
  assert.equal(projectAccessLabel(owner, grants, "shared"), "Leitura");
  const master = { ...owner, master: true, admin: true };
  assert.equal(accountRole(master), "Master");
  assert.equal(canManageProject(master, "unknown"), true);
  assert.equal(canEditProject(master, [], "unknown"), true);
  assert.equal(canManageProject({ ...owner, active: false }, "own"), false);
  assert.equal(canCreateProject({ ...master, active: false }), false);
});
test("edição é por projeto/usuário e migração pendente conserva as restrições anteriores", () => {
  const legacyEditor = { id: "a", active: true, admin: false };
  assert.equal(canCreateProject(legacyEditor), false);
  assert.equal(canManageProject(legacyEditor, "p"), false);
  assert.equal(canEditProject(legacyEditor, [{ project_id: "p", user_id: "b", role: "editor" }], "p"), false);
  assert.equal(canEditProject(legacyEditor, [{ project_id: "p", user_id: "a", role: "editor" }], "p"), true);
  assert.equal(accountRole({ ...legacyEditor, admin: true }), "Administrador");
  assert.equal(canCreateProject({ ...legacyEditor, admin: true }), true);
  assert.equal(canManageProject({ active: true, rolesVersion: 1, projectRoles: [{ id: "p" }] }, "p"), false);
  assert.equal(canManageProject({ ...legacyEditor, rolesVersion: 1, projectRoles: {} }, "p"), false);
});
