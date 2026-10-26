import test from "node:test";
import assert from "node:assert/strict";
import {
  configureImplantation,
  defaultQuestions,
  implantationId,
  implantationProgress,
  currentImplantationTerm,
  issueImplantationTerm,
  saveImplantationModel,
  saveImplantationQuestion,
  saveImplantationResponsibles,
  validateImplantation,
  importedImplantation,
  questionBlocker,
} from "./implantation.js";
import { projectRecords, assembleRecords, recordChanges } from "./records.js";
import { mergeProject } from "./team-domain.js";
import { validateBackup } from "./domain.js";
import { publicBackup } from "./privacy.js";
import {
  implantationProject,
  preparedImplantation,
  completeImplantation,
  technicalActor as actor,
} from "../tests/fixtures/implantation.js";

test("94 perguntas dos quatro modelos mantêm escolhas, caminhos e impedimentos invertidos", () => {
  assert.deepEqual(
    ["Frota", "Compras e Contratos", "Almoxarifado", "Patrimônio"].map(
      (m) => defaultQuestions(m).length,
    ),
    [11, 48, 17, 18],
  );
  const compras = defaultQuestions("Compras e Contratos");
  assert.ok(
    compras.find((q) => q.text.includes("PNCP") && q.help.includes("PNCP")),
  );
  assert.equal(
    questionBlocker({
      ...compras.find((q) => q.kind === "choice"),
      answer: "no",
    }),
    false,
  );
  for (const module of [
    "Frota",
    "Compras e Contratos",
    "Almoxarifado",
    "Patrimônio",
  ]) {
    assert.equal(defaultQuestions(module).at(-1).kind, "blocking");
    assert.equal(
      questionBlocker({ ...defaultQuestions(module).at(-1), answer: "no" }),
      false,
    );
    assert.equal(
      questionBlocker({ ...defaultQuestions(module).at(-1), answer: "yes" }),
      true,
    );
  }
  assert.equal(defaultQuestions("Elicita").length, 0);
});
test("escopo, responsáveis e edição das perguntas são específicos por entidade e não alteram o padrão", () => {
  let p = preparedImplantation();
  p = configureImplantation(
    p,
    [
      { module: "Frota", entity: "Prefeitura" },
      { module: "Frota", entity: "Fundo de Saúde" },
    ],
    actor,
  );
  const id = implantationId("Frota", "Prefeitura"),
    other = p.implantation.entries[1];
  const edited = structuredClone(p.implantation.entries[0].questions);
  edited[0].text = "Pergunta própria?";
  p = saveImplantationModel(p, id, edited, actor, { master: true });
  assert.equal(p.implantation.entries[1], other);
  assert.notEqual(defaultQuestions("Frota")[0].text, "Pergunta própria?");
  assert.equal(implantationProgress(p, "Fundo de Saúde").done, 0);
  assert.equal(other.responsibles.length, 0);
  p = configureImplantation(
    p,
    [{ module: "Frota", entity: "Fundo de Saúde" }],
    actor,
  );
  assert.deepEqual(p.implantation.entries[0].questions, []);
  assert.equal(p.implantation.entries[0].included, false);
});
test("termo exige técnico logado, todos os responsáveis, justificativa e ausência de impedimentos", () => {
  let p = preparedImplantation(),
    entry = p.implantation.entries[0];
  const draft = {
    answer: "yes",
    notes: "",
    responsibleIds: ["ana", "bruno"],
    technical: true,
    clientIds: ["ana"],
  };
  assert.throws(
    () => saveImplantationQuestion(p, entry.id, "01", draft, null),
    /Entre com sua conta/,
  );
  p = saveImplantationQuestion(p, entry.id, "01", draft, actor);
  assert.equal(implantationProgress(p).done, 0);
  assert.throws(
    () => issueImplantationTerm(p, "Prefeitura", actor),
    /todos os OKs/,
  );
  assert.throws(
    () =>
      saveImplantationQuestion(
        p,
        entry.id,
        "01",
        { ...draft, answer: "no" },
        actor,
      ),
    /não podem ter aceites/i,
  );
  assert.throws(
    () =>
      saveImplantationQuestion(
        p,
        entry.id,
        "01",
        { ...draft, answer: "na" },
        actor,
      ),
    /não podem ter aceites/i,
  );
  p = completeImplantation(p);
  assert.equal(implantationProgress(p).ready, true);
  p = saveImplantationQuestion(
    p,
    entry.id,
    "11",
    {
      ...draft,
      clientIds: ["ana", "bruno"],
      answer: "yes",
      notes: "Impedimento em análise",
    },
    actor,
  );
  assert.equal(implantationProgress(p).blockers, 1);
  assert.throws(
    () => issueImplantationTerm(p, "Prefeitura", actor),
    /Resolva os impedimentos/,
  );
  p = saveImplantationQuestion(
    p,
    entry.id,
    "11",
    { ...draft, answer: "yes", notes: "Impedimento em análise", clientIds: [] },
    actor,
  );
  p = saveImplantationQuestion(
    p,
    entry.id,
    "11",
    { ...draft, technical: false, clientIds: [], answer: "no" },
    actor,
  );
  assert.equal(implantationProgress(p).ready, true);
});
test("alterar perguntas, respostas ou nomes invalida os aceites correspondentes e preserva termos emitidos", () => {
  let p = issueImplantationTerm(completeImplantation(), "Prefeitura", actor);
  const term = structuredClone(p.implantation.terms[0]),
    id = p.implantation.entries[0].id;
  assert.ok(currentImplantationTerm(p, "Prefeitura"));
  p = saveImplantationResponsibles(
    p,
    id,
    p.implantation.entries[0].responsibles.map((r) =>
      r.id === "ana" ? { ...r, role: "Novo cargo" } : r,
    ),
    actor,
  );
  assert.equal(currentImplantationTerm(p, "Prefeitura"), undefined);
  assert.equal(implantationProgress(p).ready, false);
  assert.deepEqual(p.implantation.terms[0], term);
  assert.equal(p.implantation.entries[0].questions[0].clients.length, 1);
  const questions = structuredClone(p.implantation.entries[0].questions);
  questions[0].text = "Outro ponto?";
  p = saveImplantationModel(p, id, questions, actor, { master: true });
  assert.equal(p.implantation.entries[0].questions[0].technical, null);
  assert.equal(p.implantation.entries[0].questions[0].answer, "");
  assert.ok(p.implantation.entries[0].questions[1].technical);
  assert.deepEqual(p.implantation.terms[0], term);
});
test("registros separam escopo, módulo, perguntas e termos; colegas editam pontos diferentes sem sobrescrever", () => {
  const p = completeImplantation(),
    records = projectRecords(p).map((r) => ({ ...r, revision: 3 }));
  const restored = assembleRecords(records)[0];
  assert.deepEqual(restored.implantation, p.implantation);
  assert.equal(
    records.find((r) => r.kind === "municipality").data.implantation,
    undefined,
  );
  const a = structuredClone(p),
    b = structuredClone(p);
  a.implantation.entries[0].questions[0].notes = "Relatório A";
  b.implantation.entries[0].questions[1].notes = "Relatório B";
  const merged = mergeProject(p, a, b);
  assert.equal(
    merged.implantation.entries[0].questions[0].notes,
    "Relatório A",
  );
  assert.equal(
    merged.implantation.entries[0].questions[1].notes,
    "Relatório B",
  );
  const diff = recordChanges([p], [a], records);
  assert.equal(diff.changes.length, 1);
  assert.equal(diff.changes[0].kind, "implantation_question");
  assert.equal(diff.changes[0].revision, 3);
  b.implantation.entries[0].questions[0].notes = "Conflito";
  assert.throws(() => mergeProject(p, a, b), /mesmo campo/);
});
test("backup preserva a rotina e a restauração marca aceites importados sem reemitir termos", () => {
  const p = issueImplantationTerm(completeImplantation(), "Prefeitura", actor);
  validateImplantation(p.implantation);
  const backup = publicBackup({ version: 2, selectedId: p.id, projects: [p] });
  assert.equal(backup.projects[0].cpf, "");
  validateBackup(backup);
  const imported = importedImplantation(p);
  validateImplantation(imported.implantation);
  assert.equal(implantationProgress(imported).ready, false);
  assert.equal(imported.implantation.terms[0].source, "imported-unverified");
  assert.equal(currentImplantationTerm(imported, "Prefeitura"), undefined);
  const reconfirmed = completeImplantation(imported);
  assert.equal(implantationProgress(reconfirmed).ready, true);
  assert.equal(
    reconfirmed.implantation.entries[0].questions[0].technical.source,
    "authenticated-client",
  );
  assert.equal(
    reconfirmed.implantation.entries[0].questions[0].clients[0].source,
    "authenticated-client",
  );
  const existing = importedImplantation(p, p);
  assert.deepEqual(existing.implantation.terms[0], p.implantation.terms[0]);
  const invalid = structuredClone(p.implantation);
  invalid.entries[0].questions[0].clients[0].id = "estranho";
  assert.throws(() => validateImplantation(invalid), /aceites/);
});
