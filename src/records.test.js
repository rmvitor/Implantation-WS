import test from "node:test";
import assert from "node:assert/strict";
import { createDemo } from "../tests/fixtures/workspace.js";
import {
  projectRecords,
  assembleRecords,
  recordChanges,
  recordKey,
} from "./records.js";
import { createTeamService } from "./team-service.js";

test("registros recompõem município com contexto, chamado, histórico e CPF separado", () => {
  const p = createDemo().projects[0];
  p.handovers = [
    {
      id: "pass",
      at: "2026-10-09",
      currentState: "Em validação",
      pending: "saldo",
      nextStep: "comparar",
      responsible: "Ana",
    },
  ];
  const records = projectRecords(p).map((r) => ({ ...r, revision: 1 }));
  const restored = assembleRecords(records)[0];
  for (const key of [
    "tasks",
    "trainings",
    "logs",
    "handovers",
    "cpf",
    "name",
    "id",
    "entities",
  ]) {
    if (key === "tasks")
      assert.deepEqual(
        restored.tasks.map(({ updatedAt, updatedBy, ...t }) => t),
        p.tasks,
      );
    else if (key === "logs")
      assert.deepEqual(
        restored.logs,
        [...p.logs].sort((a, b) => b.at.localeCompare(a.at)),
      );
    else assert.deepEqual(restored[key], p[key]);
  }
  const root = records.find((r) => r.kind === "municipality");
  assert.equal(root.data.tasks, undefined);
  assert.equal(root.data.cpf, undefined);
  assert.equal(
    assembleRecords(records.filter((r) => r.kind !== "personal"))[0].cpf,
    "",
  );
});
test("edição de contexto envia somente o registro vinculado, sem todos os cartões", () => {
  const p = createDemo().projects[0],
    next = structuredClone(p);
  next.tasks[0].problem = "Novo contexto";
  const records = projectRecords(p).map((r) => ({ ...r, revision: 7 }));
  const diff = recordChanges([p], [next], records);
  assert.equal(diff.changes.length, 1);
  assert.equal(diff.changes[0].kind, "context");
  assert.equal(diff.changes[0].revision, 7);
  assert.deepEqual(diff.removed, []);
});
test("cliente v2 combina campos diferentes e impede conflito e exclusão concorrente", async () => {
  const p = createDemo().projects[0];
  let records = projectRecords(p).map((r) => ({ ...r, revision: 1 })),
    version = 1;
  const calls = [];
  const read = () => ({
    records: structuredClone(records),
    projects: [{ id: p.id, version }],
    preferences: {},
    access: [],
    admin: true,
  });
  const client = {
    async rpc(name, args) {
      if (name === "implanta_read_v2") return { data: read() };
      assert.equal(name, "implanta_commit_v2");
      calls.push(args);
      for (const r of args.p_changes) {
        const idx = records.findIndex((x) => recordKey(x) === recordKey(r));
        assert.equal(r.revision, records[idx]?.revision || 0);
        if (idx >= 0) records[idx] = { ...r, revision: r.revision + 1 };
        else records.push({ ...r, revision: 1 });
      }
      version++;
      return { data: read() };
    },
  };
  const service = createTeamService(client, () => {});
  const base = await service.load();
  const next = structuredClone(base);
  next.projects[0].tasks[0].problem = "Ana";
  const context = records.find(
    (r) => r.kind === "context" && r.id === p.tasks[0].id,
  );
  context.data.nextAction = "Bia";
  context.revision++;
  const saved = await service.commit(base, next);
  assert.equal(saved.projects[0].tasks[0].problem, "Ana");
  assert.equal(saved.projects[0].tasks[0].nextAction, "Bia");
  assert.equal(calls[0].p_changes.length, 1);
  const stale = structuredClone(saved),
    desired = structuredClone(saved);
  desired.projects[0].tasks[0].problem = "Conflito";
  context.data.problem = "Outro"; // replace current referenced record
  records.find(
    (r) => r.kind === "context" && r.id === p.tasks[0].id,
  ).data.problem = "Outro";
  await assert.rejects(service.commit(stale, desired), /mesmo campo/);
  const deleting = structuredClone(stale);
  deleting.projects[0].tasks = deleting.projects[0].tasks.slice(1);
  await assert.rejects(service.commit(stale, deleting), /mesmo campo/);
  assert.equal(calls.length, 1);
});
test("falha de rede no protocolo v2 nunca retorna ao salvamento legado", async () => {
  const client = {
    rpc: async () => ({ error: { code: "NETWORK", message: "offline" } }),
    from() {
      throw new Error("fallback inseguro");
    },
  };
  await assert.rejects(
    createTeamService(client, () => {}).load(),
    (e) => e.code === "NETWORK",
  );
});

test("criação com ID recebido de um colega não substitui um município ausente na base local", async () => {
  const p = createDemo().projects[0];
  const records = projectRecords(p).map((r) => ({ ...r, revision: 1 }));
  let writes = 0;
  const client = {
    rpc: async (name) => {
      if (name === "implanta_read_v2")
        return {
          data: {
            records,
            projects: [{ id: p.id, version: 1 }],
            preferences: {},
            access: [],
            admin: true,
          },
        };
      writes++;
      return { data: null };
    },
  };
  const service = createTeamService(client, () => {});
  await service.load();
  await assert.rejects(
    service.commit(
      { version: 2, projects: [] },
      { version: 2, projects: [{ ...p, name: "Substituir" }] },
    ),
    /Outro colega criou/,
  );
  assert.equal(writes, 0);
});

test("tarefa comum não cria chamado vazio e mudar categoria conserva o número existente", () => {
  const p = createDemo().projects[0];
  const regular = p.tasks.find((t) => t.type === "tarefa" && !t.ticket);
  const called = p.tasks.find((t) => t.type === "chamado" && t.ticket);
  const records = projectRecords(p);
  assert.equal(
    records.some((r) => r.kind === "ticket" && r.id === regular.id),
    false,
  );
  assert.ok(records.some((r) => r.kind === "ticket" && r.id === called.id));
  called.type = "tarefa";
  const restored = assembleRecords(projectRecords(p))[0];
  assert.equal(
    restored.tasks.find((t) => t.id === called.id).ticket,
    called.ticket,
  );
});
