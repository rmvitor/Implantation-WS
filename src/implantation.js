import templates from "./implantation-templates.json" with { type: "json" };
import { same } from "./team-domain.js";

export const IMPLANTATION_MODULES = [
  "Compras e Contratos",
  "Almoxarifado",
  "Patrimônio",
  "Frota",
  "Fiscalização de contrato",
  "Elicita",
];
export const ANSWERS = { yes: "Sim", no: "Não", na: "Não se aplica" };
const uid = () => crypto.randomUUID();
const time = () => new Date().toISOString();
export const implantationId = (module, entity) =>
  JSON.stringify([module, entity]);
export const implantationTemplate = (module) => templates[module];
export function defaultQuestions(module) {
  return (templates[module]?.questions || []).map((q) => ({
    ...structuredClone(q),
    answer: "",
    notes: "",
    responsibleIds: [],
    technical: null,
    clients: [],
  }));
}
export function newImplantationEntry(module, entity) {
  return {
    id: implantationId(module, entity),
    module,
    entity,
    included: true,
    modelVersion: templates[module]?.version || "personalizado",
    responsibles: [],
    questions: defaultQuestions(module),
  };
}
export function implantationEntries(project, entity) {
  return (project.implantation?.entries || []).filter(
    (e) =>
      e.included &&
      project.entities.includes(e.entity) &&
      (!entity || e.entity === entity),
  );
}
function log(project, title, action, detail, actor, now = time()) {
  return {
    ...project,
    logs: [
      {
        id: uid(),
        title,
        action,
        implantation: structuredClone(detail),
        at: now,
        ...(actor ? { actorId: actor.id, actorName: actor.name } : {}),
      },
      ...project.logs,
    ],
  };
}
function replaceEntry(project, entry, action, detail, actor) {
  const before = project.implantation?.entries || [];
  const next = {
    ...project,
    implantation: {
      version: 1,
      ...project.implantation,
      entries: before.some((e) => e.id === entry.id)
        ? before.map((e) => (e.id === entry.id ? entry : e))
        : [...before, entry],
      terms: project.implantation?.terms || [],
    },
  };
  return log(
    next,
    `Implantação · ${entry.module} · ${entry.entity}`,
    action,
    detail,
    actor,
  );
}
export function configureImplantation(project, pairs, actor) {
  const ids = new Set(
    pairs.map(({ module, entity }) => {
      if (
        !IMPLANTATION_MODULES.includes(module) ||
        !project.entities.includes(entity)
      )
        throw new Error("Módulo ou entidade inválidos.");
      return implantationId(module, entity);
    }),
  );
  const previous = project.implantation?.entries || [];
  const entries = previous.map((e) => ({ ...e, included: ids.has(e.id) }));
  for (const { module, entity } of pairs)
    if (!previous.some((e) => e.id === implantationId(module, entity)))
      entries.push(newImplantationEntry(module, entity));
  const next = {
    ...project,
    implantation: {
      version: 1,
      ...project.implantation,
      entries,
      terms: project.implantation?.terms || [],
    },
  };
  return log(
    next,
    "Escopo da homologação da implantação",
    "configurado",
    {
      before: previous.filter((e) => e.included).map((e) => e.id),
      after: [...ids],
    },
    actor,
  );
}
export function saveImplantationResponsibles(
  project,
  entryId,
  responsibles,
  actor,
) {
  const entry = project.implantation.entries.find((e) => e.id === entryId);
  if (!entry) throw new Error("Módulo não encontrado.");
  const people = responsibles.map((r) => ({
    id: r.id || uid(),
    name: r.name.trim(),
    role: r.role.trim(),
    email: r.email.trim(),
  }));
  if (
    people.some(
      (r) =>
        !r.name ||
        !r.role ||
        (r.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email)),
    ) ||
    new Set(people.map((r) => r.id)).size !== people.length
  )
    throw new Error(
      "Informe nome e cargo de cada responsável e confira os e-mails.",
    );
  const unchanged = (id) =>
    same(
      people.find((r) => r.id === id),
      entry.responsibles.find((r) => r.id === id),
    );
  const questions = entry.questions.map((q) => ({
    ...q,
    responsibleIds: q.responsibleIds.filter((id) =>
      people.some((r) => r.id === id),
    ),
    clients: q.clients.filter((c) => unchanged(c.id)),
  }));
  return replaceEntry(
    project,
    { ...entry, responsibles: people, questions },
    "responsáveis atualizados",
    { before: entry.responsibles, after: people },
    actor,
  );
}
const questionDefinition = (q) => ({
  id: q.id,
  text: q.text,
  help: q.help || "",
  kind: q.kind,
  justifyWhen: q.justifyWhen,
  condition: q.condition || "",
});
export function saveImplantationModel(project, entryId, questions, actor) {
  const entry = project.implantation.entries.find((e) => e.id === entryId);
  if (!entry || !questions.length)
    throw new Error("Mantenha pelo menos uma pergunta no módulo.");
  if (
    new Set(questions.map((q) => q.id)).size !== questions.length ||
    questions.some(
      (q) =>
        !q.id ||
        !q.text.trim() ||
        !["capability", "choice", "blocking"].includes(q.kind) ||
        !["yes", "no"].includes(q.justifyWhen),
    )
  )
    throw new Error("Confira o texto e o tipo das perguntas.");
  const items = questions.map((draft) => {
    const definition = {
      ...questionDefinition(draft),
      text: draft.text.trim(),
    };
    const original = entry.questions.find((q) => q.id === draft.id);
    return original && same(questionDefinition(original), definition)
      ? original
      : {
          ...definition,
          answer: "",
          notes: "",
          responsibleIds: original?.responsibleIds || [],
          technical: null,
          clients: [],
        };
  });
  return replaceEntry(
    project,
    { ...entry, questions: items },
    "perguntas atualizadas; aceites dos pontos alterados reiniciados",
    {
      before: entry.questions.map(questionDefinition),
      after: items.map(questionDefinition),
    },
    actor,
  );
}
export function questionBlocker(q) {
  if (q.answer === "na") return false;
  return q.kind === "blocking"
    ? q.answer === "yes"
    : q.kind === "capability" && q.answer === "no";
}
export function questionAnswered(q) {
  return (
    Object.hasOwn(ANSWERS, q.answer) &&
    (!(q.answer === "na" || q.answer === q.justifyWhen) || !!q.notes.trim())
  );
}
export function questionReady(entry, q) {
  return (
    questionAnswered(q) &&
    !questionBlocker(q) &&
    !!q.technical?.actorId &&
    q.technical?.source !== "imported-unverified" &&
    q.responsibleIds.length > 0 &&
    q.responsibleIds.every((id) =>
      entry.responsibles.some(
        (r) =>
          r.id === id &&
          r.name.trim() &&
          r.role.trim() &&
          q.clients.some(
            (c) =>
              c.id === id &&
              c.clientName === r.name &&
              c.clientRole === r.role &&
              c.actorId &&
              c.source !== "imported-unverified",
          ),
      ),
    )
  );
}
export function implantationProgress(project, entity) {
  const entries = implantationEntries(project, entity);
  const questions = entries.flatMap((e) =>
    e.questions.map((q) => ({ entry: e, q })),
  );
  return {
    total: questions.length,
    done: questions.filter(({ entry, q }) => questionReady(entry, q)).length,
    blockers: questions.filter(({ q }) => questionBlocker(q)).length,
    ready:
      entries.length > 0 &&
      entries.every(
        (e) =>
          e.questions.length > 0 &&
          e.questions.every((q) => questionReady(e, q)),
      ),
  };
}
export function saveImplantationQuestion(
  project,
  entryId,
  questionId,
  draft,
  actor,
  now = time(),
) {
  const entry = project.implantation.entries.find((e) => e.id === entryId);
  const old = entry?.questions.find((q) => q.id === questionId);
  if (!old) throw new Error("Pergunta não encontrada.");
  const responsibleIds = [...new Set(draft.responsibleIds)];
  if (responsibleIds.some((id) => !entry.responsibles.some((r) => r.id === id)))
    throw new Error("Selecione os responsáveis deste módulo.");
  const response = {
    ...old,
    answer: draft.answer,
    notes: draft.notes.trim(),
    responsibleIds,
  };
  if (response.answer && !Object.hasOwn(ANSWERS, response.answer))
    throw new Error("Resposta inválida.");
  if (response.answer && !questionAnswered(response))
    throw new Error("Justifique a resposta antes de salvar.");
  const changed =
    old.answer !== response.answer ||
    old.notes !== response.notes ||
    !same(old.responsibleIds, responsibleIds);
  const identity =
    actor?.id && actor.name?.trim()
      ? {
          actorId: actor.id,
          by: actor.name,
          at: now,
          source: "authenticated-client",
        }
      : null;
  if ((draft.technical || draft.clientIds?.length) && !identity)
    throw new Error("Entre com sua conta para registrar os OKs.");
  if (
    (draft.technical || draft.clientIds?.length) &&
    !questionAnswered(response)
  )
    throw new Error(
      "Responda a pergunta e justifique quando necessário antes de confirmar.",
    );
  response.technical = draft.technical
    ? !changed &&
      old.technical &&
      old.technical.source !== "imported-unverified"
      ? old.technical
      : identity
    : null;
  response.clients = (draft.clientIds || []).map((id) => {
    if (!responsibleIds.includes(id))
      throw new Error(
        "O aceite deve ser de um responsável selecionado para este ponto.",
      );
    const previous =
      !changed &&
      old.clients.find(
        (c) => c.id === id && c.source !== "imported-unverified",
      );
    const person = entry.responsibles.find((r) => r.id === id);
    return (
      previous || {
        id,
        clientName: person.name,
        clientRole: person.role,
        ...identity,
      }
    );
  });
  const questions = entry.questions.map((q) =>
    q.id === questionId ? response : q,
  );
  return replaceEntry(
    project,
    { ...entry, questions },
    "resposta e aceites registrados",
    { questionId, text: response.text, before: old, after: response },
    actor,
  );
}
export function implantationSnapshot(project, entity) {
  return {
    projectId: project.id,
    projectName: project.name,
    state: project.state || "",
    dream: project.dream || "",
    fiscal: project.fiscal || "",
    entity,
    entries: structuredClone(implantationEntries(project, entity)),
  };
}
export function currentImplantationTerm(project, entity) {
  const snapshot = implantationSnapshot(project, entity);
  return (project.implantation?.terms || []).find(
    (t) =>
      t.entity === entity &&
      t.source !== "imported-unverified" &&
      same(t.snapshot, snapshot),
  );
}
export function issueImplantationTerm(project, entity, actor, now = time()) {
  if (!actor?.id || !actor.name?.trim())
    throw new Error("Entre com sua conta para emitir o termo.");
  if (!implantationProgress(project, entity).ready)
    throw new Error(
      "Resolva os impedimentos e registre todos os OKs do técnico e dos responsáveis do cliente.",
    );
  if (currentImplantationTerm(project, entity))
    throw new Error("Já existe um termo atualizado para esta entidade.");
  const term = {
    id: uid(),
    entity,
    at: now,
    actorId: actor.id,
    actorName: actor.name,
    source: "authenticated-client",
    snapshot: implantationSnapshot(project, entity),
  };
  const next = {
    ...project,
    implantation: {
      ...project.implantation,
      terms: [term, ...(project.implantation?.terms || [])],
    },
  };
  return log(
    next,
    `Termo de homologação da implantação · ${entity}`,
    "emitido para assinatura",
    { termId: term.id },
    actor,
    now,
  );
}
const text = (s) => typeof s === "string";
const validIdentity = (v) =>
  v === null ||
  (v &&
    text(v.actorId) &&
    !!v.actorId &&
    text(v.by) &&
    !!v.by.trim() &&
    text(v.at) &&
    !Number.isNaN(Date.parse(v.at)));
export function validateImplantation(value) {
  if (
    !value ||
    value.version !== 1 ||
    !Array.isArray(value.entries) ||
    !Array.isArray(value.terms)
  )
    throw new Error("Backup inválido: homologação da implantação.");
  const ids = new Set();
  for (const e of value.entries) {
    if (
      !e ||
      !IMPLANTATION_MODULES.includes(e.module) ||
      !text(e.entity) ||
      e.id !== implantationId(e.module, e.entity) ||
      ids.has(e.id) ||
      typeof e.included !== "boolean" ||
      !text(e.modelVersion) ||
      !Array.isArray(e.responsibles) ||
      !Array.isArray(e.questions)
    )
      throw new Error("Backup inválido: escopo da implantação.");
    ids.add(e.id);
    const people = new Set();
    for (const r of e.responsibles) {
      if (
        !r ||
        !text(r.id) ||
        !r.id ||
        people.has(r.id) ||
        !text(r.name) ||
        !r.name.trim() ||
        !text(r.role) ||
        !r.role.trim() ||
        !text(r.email)
      )
        throw new Error("Backup inválido: responsáveis da implantação.");
      people.add(r.id);
    }
    const questions = new Set();
    for (const q of e.questions) {
      if (
        !q ||
        !text(q.id) ||
        !q.id ||
        questions.has(q.id) ||
        !text(q.text) ||
        !q.text.trim() ||
        !text(q.help) ||
        !["capability", "choice", "blocking"].includes(q.kind) ||
        !["yes", "no"].includes(q.justifyWhen) ||
        !["", "yes", "no", "na"].includes(q.answer) ||
        !text(q.notes) ||
        !Array.isArray(q.responsibleIds) ||
        new Set(q.responsibleIds).size !== q.responsibleIds.length ||
        q.responsibleIds.some((id) => !people.has(id)) ||
        !validIdentity(q.technical) ||
        !Array.isArray(q.clients) ||
        new Set(q.clients.map((c) => c?.id)).size !== q.clients.length ||
        q.clients.some(
          (c) => !c || !q.responsibleIds.includes(c.id) || !validIdentity(c),
        ) ||
        ((q.technical || q.clients.length) && !questionAnswered(q))
      )
        throw new Error("Backup inválido: perguntas e aceites da implantação.");
      questions.add(q.id);
    }
  }
  const termIds = new Set();
  for (const t of value.terms) {
    if (
      !t ||
      !text(t.id) ||
      !t.id ||
      termIds.has(t.id) ||
      !text(t.entity) ||
      !text(t.actorId) ||
      !text(t.actorName) ||
      !text(t.at) ||
      Number.isNaN(Date.parse(t.at)) ||
      !t.snapshot ||
      !text(t.snapshot.projectId) ||
      !text(t.snapshot.projectName) ||
      t.snapshot.entity !== t.entity ||
      !Array.isArray(t.snapshot.entries)
    )
      throw new Error("Backup inválido: termo da implantação.");
    validateImplantation({
      version: 1,
      entries: t.snapshot.entries,
      terms: [],
    });
    if (
      !implantationProgress(
        { entities: [t.entity], implantation: { entries: t.snapshot.entries } },
        t.entity,
      ).ready &&
      t.source !== "imported-unverified"
    )
      throw new Error("Backup inválido: termo sem todos os OKs.");
    termIds.add(t.id);
  }
}

// A restored file is evidence of an earlier record, not a new authenticated
// confirmation. Reconfirm live points; keep historical snapshots identifiable.
export function importedImplantation(project, existing) {
  if (!project.implantation)
    return existing?.implantation
      ? { ...project, implantation: structuredClone(existing.implantation) }
      : project;
  const value = structuredClone(project.implantation);
  const mark = (entries) =>
    entries.forEach((e) =>
      e.questions.forEach((q) => {
        if (q.technical) q.technical.source = "imported-unverified";
        q.clients.forEach((c) => {
          c.source = "imported-unverified";
        });
      }),
    );
  mark(value.entries);
  value.terms = value.terms.map((t) => {
    const previous = existing?.implantation?.terms.find(
      (old) => old.id === t.id,
    );
    if (previous) return structuredClone(previous);
    t.source = "imported-unverified";
    mark(t.snapshot.entries);
    return t;
  });
  for (const t of existing?.implantation?.terms || [])
    if (!value.terms.some((term) => term.id === t.id))
      value.terms.push(structuredClone(t));
  return { ...project, implantation: value };
}
