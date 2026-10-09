import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mergeProject,
  CollaborationConflict,
  validateConnection,
  workspacePreferences,
  same,
} from "./team-domain.js";
import { createTeamService } from "./team-service.js";
import { createEmptyWorkspace, newActivity } from "./domain.js";

const base = () => ({
  id: "p",
  name: "Município teste",
  entities: [],
  tasks: [{ ...newActivity(), id: "t", title: "Conferir dados" }],
  trainings: [],
  logs: [],
});
test("colegas podem editar campos e atividades diferentes sem sobrescrever alterações", () => {
  const b = base(),
    l = structuredClone(b),
    r = structuredClone(b);
  l.tasks[0].title = "Título local";
  r.tasks[0].executedWork = "Conferência remota";
  l.logs.push({ id: "local", at: "2026-10-09T12:00:00Z" });
  r.logs.push({ id: "remote", at: "2026-10-09T13:00:00Z" });
  const merged = mergeProject(b, l, r);
  assert.equal(merged.tasks[0].title, "Título local");
  assert.equal(merged.tasks[0].executedWork, "Conferência remota");
  assert.deepEqual(
    merged.logs.map((v) => v.id),
    ["remote", "local"],
  );
});
test("mesmo campo alterado e exclusão de atividade em edição mantêm conflito explícito", () => {
  const b = base(),
    l = structuredClone(b),
    r = structuredClone(b);
  l.tasks[0].title = "Um";
  r.tasks[0].title = "Outro";
  assert.throws(() => mergeProject(b, l, r), CollaborationConflict);
  r.tasks = [];
  assert.throws(() => mergeProject(b, l, r), CollaborationConflict);
});
test("merge trata propriedades de JSON como dados sem modificar protótipos", () => {
  const result = mergeProject(
    JSON.parse('{"__proto__":{"a":1},"b":1}'),
    JSON.parse('{"__proto__":{"a":2},"b":1}'),
    JSON.parse('{"__proto__":{"a":1},"b":2}'),
  );
  assert.equal(Object.getPrototypeOf(result), Object.prototype);
  assert.equal(result.__proto__.a, 2);
  assert.equal(result.b, 2);
  assert.equal({}.a, undefined);
});
test("conexão aceita apenas chave pública e HTTPS; preferências não carregam projetos", () => {
  const key = (role) =>
    `test.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.test`;
  assert.equal(
    validateConnection({
      url: "https://example.supabase.co/",
      key: key("anon"),
    }).url,
    "https://example.supabase.co",
  );
  for (const secret of ["sb_secret_test", key("service_role"), "invalid"])
    assert.throws(() =>
      validateConnection({ url: "https://example.supabase.co", key: secret }),
    );
  assert.throws(() =>
    validateConnection({ url: "http://example.com", key: key("anon") }),
  );
  assert.deepEqual(
    workspacePreferences({ projects: [base()], version: 2, selectedId: "p" }),
    { selectedId: "p" },
  );
});

function fakeClient(initial) {
  let row = { id: "p", data: structuredClone(initial), version: 1 },
    prefs = {},
    failRefresh = false;
  return {
    failAfterCommit: false,
    conflictNext: false,
    calls: 0,
    get row() {
      return row;
    },
    remote(change) {
      row = { ...row, data: change(row.data), version: row.version + 1 };
    },
    from(table) {
      let single = false;
      const query = {
        select() {
          return query;
        },
        order() {
          return query;
        },
        eq() {
          return query;
        },
        single() {
          single = true;
          return query;
        },
        maybeSingle() {
          single = true;
          return query;
        },
        then(resolve, reject) {
          const data =
            table === "implanta_projects"
              ? single
                ? row
                : [row]
              : table === "implanta_members"
                ? []
                : { data: prefs };
          return Promise.resolve(
            failRefresh
              ? { error: { message: "network unavailable" } }
              : { data: structuredClone(data) },
          ).then(resolve, reject);
        },
      };
      return query;
    },
    async rpc(name, args) {
      if (name === "implanta_read_v2") return { error: { code: "PGRST202" } };
      this.calls++;
      if (this.conflictNext) {
        this.conflictNext = false;
        row.version++;
        return { error: { code: "40001" } };
      }
      for (const change of args.p_changes) {
        if (!change.create && change.version !== row.version)
          return { error: { code: "40001" } };
        row = {
          id: change.id,
          data: structuredClone(change.data),
          version: row.version + 1,
        };
      }
      if (args.p_preferences) prefs = structuredClone(args.p_preferences);
      failRefresh = this.failAfterCommit;
      return { data: null, error: null };
    },
  };
}
test("salvamento combina a última versão do banco e tenta novamente em corrida de versão", async () => {
  const b = base(),
    client = fakeClient(b),
    service = createTeamService(client, () => {});
  const original = await service.load(),
    next = structuredClone(original);
  next.projects[0].tasks[0].title = "Alteração local";
  client.remote((p) => ({ ...p, name: "Nome remoto" }));
  client.conflictNext = true;
  const saved = await service.commit(original, next);
  assert.equal(saved.projects[0].name, "Nome remoto");
  assert.equal(saved.projects[0].tasks[0].title, "Alteração local");
  assert.equal(client.calls, 2);
});
test("conflito de campo não grava; queda depois da confirmação não apresenta alteração como perdida", async () => {
  const client = fakeClient(base()),
    service = createTeamService(client, () => {});
  const original = await service.load(),
    next = structuredClone(original);
  next.projects[0].name = "Local";
  client.remote((p) => ({ ...p, name: "Remoto" }));
  await assert.rejects(service.commit(original, next), CollaborationConflict);
  assert.equal(client.calls, 0);
  assert.equal(service.committing, false);
  const current = await service.load(),
    updated = structuredClone(current);
  updated.projects[0].tasks[0].title = "Confirmado";
  client.failAfterCommit = true;
  const saved = await service.commit(current, updated);
  assert.equal(saved.projects[0].tasks[0].title, "Confirmado");
  assert.match(service.warning, /Alteração salva/);
});

test("comparação de dados ignora a ordem das propriedades do JSONB e conserva a ordem das listas", () => {
  assert.equal(
    same({ a: 1, b: { c: 2, d: 3 } }, { b: { d: 3, c: 2 }, a: 1 }),
    true,
  );
  assert.equal(same([1, 2], [2, 1]), false);
  assert.equal(same({ a: 1 }, { a: 2 }), false);
  assert.equal(same(null, {}), false);
});

test("exclusão online aceita cartão antigo normalizado e JSONB reordenado sem perder alteração de colega", async () => {
  const stored = base();
  delete stored.tasks[0].executedWork;
  stored.tasks[0] = Object.fromEntries(
    Object.entries(stored.tasks[0]).sort(([a], [b]) => a.localeCompare(b)),
  );
  const client = fakeClient(stored),
    service = createTeamService(client, () => {});
  const original = await service.load(),
    next = structuredClone(original);
  next.projects[0].tasks = [];
  next.projects[0].logs.push({
    id: "deleted",
    title: "Conferir dados",
    action: "excluída",
    at: "2026-10-09T12:00:00Z",
  });
  client.remote((p) => ({ ...p, name: "Nome atualizado pelo colega" }));
  const saved = await service.commit(original, next);
  assert.equal(saved.projects[0].tasks.length, 0);
  assert.equal(saved.projects[0].name, "Nome atualizado pelo colega");
  assert.equal(saved.projects[0].logs[0].action, "excluída");
  assert.equal(client.calls, 1);
});
