import { test } from "node:test";
import assert from "node:assert/strict";
import { clearRetiredDeviceData, devicePreferencesKey, readDevicePreferences, withoutDevicePreferences } from "./device-preferences.js";
import { workspacePreferences } from "./team-domain.js";

test("preferências de tela são separadas por conta e só migram o estado local anterior", () => {
  const legacy = { boardViews: { p: "list" }, boardCollapsed: { p: ["todo"] } };
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null };
  const local = devicePreferencesKey();
  assert.notEqual(local, devicePreferencesKey("user"));
  assert.deepEqual(readDevicePreferences(storage, local, legacy).boardViews, { p: "list" });
  values.set(local, JSON.stringify({ boardViews: { p: "table", q: "invalid" }, boardCollapsed: { p: ["todo", "todo", "invalid"] } }));
  assert.deepEqual(readDevicePreferences(storage, local, legacy).boardCollapsed, { p: ["todo"] });
  assert.deepEqual(readDevicePreferences(storage, local, legacy).boardViews, { p: "table" });
  assert.deepEqual(readDevicePreferences(storage, devicePreferencesKey("user")).boardViews, {});
  values.set(local, "invalid JSON");
  assert.deepEqual(readDevicePreferences(storage, local, legacy).boardViews, { p: "list" });
});

test("visualização, recolhimento e ordenação nunca entram nas preferências compartilhadas", () => {
  const workspace = { version: 2, projects: [], selectedId: "p", appearance: { mode: "dark" }, boardViews: { p: "table" }, boardOrders: { p: "priority" }, boardCollapsed: { p: ["todo"] } };
  assert.deepEqual(workspacePreferences(workspace), { selectedId: "p", appearance: { mode: "dark" } });
  assert.deepEqual(withoutDevicePreferences(workspace), { version: 2, projects: [], selectedId: "p", appearance: { mode: "dark" } });
});

test("limpeza da integração descontinuada preserva autenticação, projetos e outras aplicações", () => {
  const retained = ["implanta.workspace.v1", "implanta.display.v1:local", "sb-project-auth-token", "entrelinhas.preferences", "other.mail.device.v1:user"];
  const values = new Map([...retained, "implanta.mail.device.v1:user-a", "implanta.mail.device.v1:user-b"].map((key) => [key, `saved:${key}`]));
  const storage = {
    get length() { return values.size; },
    key: (index) => [...values.keys()][index],
    removeItem: (key) => values.delete(key),
  };
  clearRetiredDeviceData(storage);
  assert.deepEqual([...values.keys()], retained);
  for (const key of retained) assert.equal(values.get(key), `saved:${key}`);
  clearRetiredDeviceData(storage);
  assert.deepEqual([...values.keys()], retained);
  assert.doesNotThrow(() => clearRetiredDeviceData({ get length() { throw new Error("Blocked storage"); } }));
});
