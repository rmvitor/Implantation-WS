import test from "node:test";
import assert from "node:assert/strict";
import { createAcceptanceQueue } from "./implantation-queue.js";
import {
  readAcceptanceNavigation,
  implantationNavigationKey,
} from "./implantation-navigation.js";
import {
  saveImplantationQuestion,
  implantationProgress,
  issueImplantationTerm,
  saveImplantationModel,
  configureImplantation,
  implantationCatalog,
} from "./implantation.js";
import {
  preparedImplantation,
  completeImplantation,
  technicalActor,
} from "../tests/fixtures/implantation.js";
const turn = () => new Promise((resolve) => setTimeout(resolve, 10));

test("fila confirma cada versão, mantém o último texto digitado e serializa pontos diferentes", async () => {
  let release;
  const received = [];
  let inflight = 0,
    maximum = 0;
  const queue = createAcceptanceQueue({
    save: async (action) => {
      inflight++;
      maximum = Math.max(maximum, inflight);
      received.push(action);
      if (received.length === 1) await new Promise((r) => (release = r));
      inflight--;
      return true;
    },
  });
  queue.enqueue("a", "primeiro");
  await turn();
  queue.enqueue("a", "texto final");
  queue.enqueue("b", "outro ponto");
  assert.equal(queue.state.pending, 2);
  release();
  await turn();
  await turn();
  assert.deepEqual(received, ["primeiro", "texto final", "outro ponto"]);
  assert.equal(maximum, 1);
  assert.equal(queue.state.pending, 0);
  queue.dispose();
});
test("falha preserva rascunhos, só confirma após retry e debounce pode ser descarregado no blur", async () => {
  let fail = true;
  const received = [];
  const queue = createAcceptanceQueue({
    save: async (action) => {
      received.push(action);
      return !fail;
    },
  });
  queue.enqueue("a", "A");
  await turn();
  assert.equal(queue.state.failed, true);
  assert.equal(queue.state.pending, 1);
  queue.enqueue("a", "A final");
  queue.enqueue("b", "B");
  await turn();
  assert.deepEqual(received, ["A"]);
  fail = false;
  queue.retry();
  await turn();
  assert.deepEqual(received, ["A", "A final", "B"]);
  queue.enqueue("c", "texto", { delay: 200 });
  queue.enqueue("c", "texto completo", { delay: 200 });
  queue.flush("c");
  await turn();
  assert.equal(received.at(-1), "texto completo");
  assert.equal(queue.state.pending, 0);
  queue.dispose();
});
test("cache da navegação contém somente escolhas locais e é separado por conta e projeto", () => {
  const key = implantationNavigationKey("ana", "p1");
  assert.notEqual(key, implantationNavigationKey("bruno", "p1"));
  assert.notEqual(key, implantationNavigationKey("ana", "p2"));
  const result = readAcceptanceNavigation(
    {
      getItem: () =>
        JSON.stringify({
          entity: "Prefeitura",
          modules: { Prefeitura: "Frota" },
          entitiesCollapsed: true,
          answer: "dado que não pertence à navegação",
        }),
    },
    key,
  );
  assert.deepEqual(result, {
    entity: "Prefeitura",
    modules: { Prefeitura: "Frota" },
    entitiesCollapsed: true,
    modulesCollapsed: false,
  });
  assert.equal(
    readAcceptanceNavigation(
      {
        getItem: () => {
          throw Error();
        },
      },
      key,
    ).entity,
    "",
  );
});
test("Não pode ser salvo como rascunho; dispensa exige justificativa e os dois OKs", () => {
  let p = preparedImplantation();
  const id = p.implantation.entries[0].id;
  const draft = {
    answer: "no",
    notes: "",
    notUsed: false,
    responsibleIds: [],
    technical: false,
    clientIds: [],
  };
  p = saveImplantationQuestion(p, id, "01", draft, technicalActor);
  assert.equal(p.implantation.entries[0].questions[0].answer, "no");
  assert.equal(implantationProgress(p).ready, false);
  assert.throws(
    () =>
      saveImplantationQuestion(
        p,
        id,
        "01",
        { ...draft, notUsed: true, technical: true },
        technicalActor,
      ),
    /justifique/i,
  );
  p = completeImplantation(p);
  p = saveImplantationQuestion(
    p,
    id,
    "01",
    {
      ...draft,
      notUsed: true,
      notes: "A entidade não utiliza esta rotina.",
      responsibleIds: ["ana"],
      technical: true,
      clientIds: ["ana"],
    },
    technicalActor,
  );
  assert.equal(implantationProgress(p).ready, true);
  assert.doesNotThrow(() =>
    issueImplantationTerm(p, "Prefeitura", technicalActor),
  );
});
test("selecionar quem aceitou preserva o técnico; modelos e atualização de perguntas são exclusivos do Master", () => {
  let p = preparedImplantation();
  const e = p.implantation.entries[0];
  p = saveImplantationQuestion(
    p,
    e.id,
    "01",
    {
      answer: "yes",
      notes: "",
      responsibleIds: [],
      technical: true,
      clientIds: [],
    },
    technicalActor,
    "2026-10-24T10:00:00Z",
  );
  const proof = p.implantation.entries[0].questions[0].technical;
  p = saveImplantationQuestion(
    p,
    e.id,
    "01",
    {
      answer: "yes",
      notes: "",
      responsibleIds: ["ana"],
      technical: true,
      clientIds: ["ana"],
    },
    { id: "outro", name: "Outro consultor" },
    "2026-10-24T11:00:00Z",
  );
  assert.deepEqual(p.implantation.entries[0].questions[0].technical, proof);
  assert.throws(
    () => saveImplantationModel(p, e.id, e.questions, technicalActor),
    /Master/,
  );
  assert.throws(
    () =>
      configureImplantation(
        p,
        [{ module: "Elicita", entity: "Prefeitura" }],
        technicalActor,
      ),
    /modelo/,
  );
  const catalog = implantationCatalog();
  assert.equal(catalog.filter((m) => m.questions.length).length, 4);
});
test("desativar limpa perguntas e reativar usa o modelo atual sem alterar termos emitidos", () => {
  let p = issueImplantationTerm(
    completeImplantation(),
    "Prefeitura",
    technicalActor,
  );
  const term = structuredClone(p.implantation.terms[0]);
  p = configureImplantation(p, [], technicalActor);
  assert.deepEqual(p.implantation.entries[0].questions, []);
  assert.equal(p.implantation.entries[0].included, false);
  assert.deepEqual(p.implantation.terms[0], term);
  const catalog = implantationCatalog();
  catalog.find((m) => m.module === "Frota").questions[0].text = "Novo padrão?";
  p = configureImplantation(
    p,
    [{ module: "Frota", entity: "Prefeitura" }],
    technicalActor,
    catalog,
  );
  assert.equal(p.implantation.entries[0].questions[0].text, "Novo padrão?");
  assert.equal(p.implantation.entries[0].questions[0].answer, "");
  assert.deepEqual(p.implantation.terms[0], term);
});
