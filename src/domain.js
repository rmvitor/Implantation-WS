import { validateAppointment } from "./appointments.js";
import { validatePersonalAgenda } from "./personal-agenda.js";

export const STAGES = [
  { id: "todo", label: "A fazer", color: "#dcab58" },
  { id: "progress", label: "Em andamento", color: "#6c9fcb" },
  { id: "waiting", label: "Aguardando retorno", color: "#db867d" },
  { id: "homologacao", label: "Em homologação", color: "#9184c8" },
  { id: "concluido", label: "Concluídos", color: "#70a08a" },
];
export const MODULES = [
  "Compras e Contratos",
  "Almoxarifado",
  "Patrimônio",
  "Frota",
  "Fiscalização de contrato",
  "Elicita",
];
export const CATEGORIES = {
  chamado: "Chamado",
  tarefa: "Tarefa",
  agenda: "Agenda",
  pendencia: "Pendência",
};
export const PRIORITIES = { alta: "Alta", normal: "Normal", baixa: "Baixa" };
export function sortActivities(tasks, order = "manual") {
  if (order !== "priority") return tasks;
  const rank = { alta: 0, normal: 1, baixa: 2 };
  return [...tasks].sort(
    (a, b) => (rank[a.priority] ?? 1) - (rank[b.priority] ?? 1),
  );
}
export function normalizeModule(module) {
  const key = module
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return (
    {
      frotas: "Frota",
      frota: "Frota",
      "compras e contratos": "Compras e Contratos",
      patrimonio: "Patrimônio",
      licitacoes: "Elicita",
      elicita: "Elicita",
      "fiscalizacao de contrato": "Fiscalização de contrato",
    }[key] || module
  );
}
export function cardSummary(task) {
  return `${task.title}${task.type === "chamado" && task.ticket ? ` — #${task.ticket}` : ""}`;
}
export const uid = () => globalThis.crypto.randomUUID();
export const localDate = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
export const nextDate = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return localDate(d);
};
export function checklistProgress(task) {
  const items = (task.checklists || []).flatMap((c) => c.items);
  return { done: items.filter((i) => i.done).length, total: items.length };
}
export function isValidated(task) {
  const v = task.validation;
  return Boolean(
    task.criterion?.trim() &&
      v?.by?.trim() &&
      v?.evidence?.trim() &&
      v?.at &&
      !Number.isNaN(Date.parse(v.at)),
  );
}
export function saveActivity(
  project,
  activity,
  now = new Date().toISOString(),
) {
  if (!activity.title?.trim())
    throw new Error("Informe um título específico para a atividade.");
  if (!STAGES.some((s) => s.id === activity.stage))
    throw new Error("Situação inválida.");
  if (activity.stage === "concluido" && !isValidated(activity))
    throw new Error(
      "Para concluir, registre o critério, quem validou, a data e a evidência da validação.",
    );
  const original = project.tasks.find((t) => t.id === activity.id);
  const task = {
    ...activity,
    title: activity.title.trim(),
    validation: activity.stage === "concluido" ? activity.validation : null,
    completedAt:
      activity.stage === "concluido" ? original?.completedAt || now : null,
  };
  const action = !original
    ? task.stage === "concluido"
      ? "criada e concluída"
      : "criada"
    : original.stage !== task.stage
      ? task.stage === "concluido"
        ? "concluída"
        : `movida para ${STAGES.find((s) => s.id === task.stage).label}`
      : "atualizada";
  return {
    ...project,
    tasks: original
      ? project.tasks.map((t) => (t.id === task.id ? task : t))
      : [...project.tasks, task],
    logs: [
      {
        id: uid(),
        taskId: task.id,
        title: task.title,
        action,
        at: now,
        ...(task.validation
          ? { validation: { ...task.validation }, criterion: task.criterion }
          : {}),
        ...(task.executedWork ? { executedWork: task.executedWork } : {}),
      },
      ...project.logs,
    ],
  };
}
export function moveTask(
  project,
  taskId,
  stage,
  now = new Date().toISOString(),
) {
  const task = project.tasks.find((t) => t.id === taskId);
  if (!task || task.stage === stage || !STAGES.some((s) => s.id === stage))
    return project;
  return saveActivity(project, { ...task, stage }, now);
}
export function newActivity(stage = "todo", date = "") {
  return {
    id: uid(),
    title: "",
    module: "",
    stage,
    type: "tarefa",
    owner: "",
    priority: "normal",
    date,
    time: "",
    description: "",
    executedWork: "",
    problem: "",
    impact: "",
    nextAction: "",
    nextOwner: "",
    blockedBy: "",
    ticket: "",
    ticketUrl: "",
    ticketStatus: "Aguardando retorno",
    evidence: "",
    attachments: [],
    criterion: "",
    validation: null,
    completedAt: null,
    checklists: [],
  };
}
export function migrateWorkspace(value) {
  const legacy = value.version === 1;
  const map = { agenda: "todo", pendencia: "todo", chamado: "waiting" };
  return {
    ...value,
    version: 2,
    projects: value.projects.map((p) => ({
      ...p,
      tasks: p.tasks.map((t) => ({
        ...newActivity(),
        ...t,
        module: normalizeModule(t.module),
        stage: legacy ? map[t.stage] || t.stage : t.stage,
        type:
          t.type === "atividade"
            ? "tarefa"
            : t.type ||
              (t.ticket || t.stage === "chamado"
                ? "chamado"
                : t.stage === "agenda"
                  ? "agenda"
                  : t.stage === "pendencia"
                    ? "pendencia"
                    : "tarefa"),
        problem: legacy ? t.problem || t.description || "" : t.problem || "",
        validation: t.validation || null,
      })),
    })),
  };
}
export function matchesTask(task, query, module, priority) {
  const normalize = (s) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  return (
    (!query ||
      normalize(
        [
          task.title,
          task.module,
          task.ticket,
          task.owner,
          task.nextAction,
          task.nextOwner,
          task.problem,
          task.executedWork,
          task.blockedBy,
          ...(task.checklists || []).map((c) => c.entity),
        ].join(" "),
      ).includes(normalize(query))) &&
    (!module || task.module === module) &&
    (!priority || task.priority === priority)
  );
}
export function validateBackup(value) {
  if (
    !value ||
    ![1, 2].includes(value.version) ||
    !Array.isArray(value.projects)
  )
    throw new Error("Selecione um backup do Implanta.");
  const ids = new Set();
  if (value.personalAgenda !== undefined)
    validatePersonalAgenda(value.personalAgenda);
  if (
    value.projectOrder !== undefined &&
    (!Array.isArray(value.projectOrder) ||
      !value.projectOrder.every((id) => typeof id === "string"))
  )
    throw new Error("Backup inválido: ordem dos projetos.");
  if (
    value.actionLimits !== undefined &&
    (!value.actionLimits ||
      !["nearDays", "staleDays"].every(
        (k) =>
          Number.isInteger(value.actionLimits[k]) &&
          value.actionLimits[k] >= 0 &&
          value.actionLimits[k] <= 365,
      ))
  )
    throw new Error("Backup inválido: limites de acompanhamento.");
  if (
    value.taskTemplates !== undefined &&
    (!Array.isArray(value.taskTemplates) ||
      !value.taskTemplates.every(
        (t) =>
          t &&
          typeof t.id === "string" &&
          typeof t.name === "string" &&
          t.activity &&
          typeof t.activity.title === "string" &&
          Array.isArray(t.checks) &&
          t.checks.every((v) => typeof v === "string"),
      ))
  )
    throw new Error("Backup inválido: modelos de tarefas.");
  for (const p of value.projects) {
    if (
      !p ||
      typeof p.id !== "string" ||
      ids.has(p.id) ||
      typeof p.name !== "string" ||
      !Array.isArray(p.entities) ||
      !p.entities.every((e) => typeof e === "string") ||
      !Array.isArray(p.tasks) ||
      !Array.isArray(p.trainings) ||
      !Array.isArray(p.logs)
    )
      throw new Error("Backup inválido: dados do município incompletos.");
    if (p.status !== undefined && !["active", "closed"].includes(p.status))
      throw new Error("Backup inválido: situação do projeto.");
    if (
      p.color !== undefined &&
      (typeof p.color !== "string" || !/^#[0-9a-f]{6}$/i.test(p.color))
    )
      throw new Error("Backup inválido: cor do projeto.");
    if (
      p.closedAt != null &&
      (typeof p.closedAt !== "string" || Number.isNaN(Date.parse(p.closedAt)))
    )
      throw new Error("Backup inválido: data de encerramento do projeto.");
    if (
      p.handovers !== undefined &&
      (!Array.isArray(p.handovers) ||
        !p.handovers.every(
          (h) =>
            h &&
            typeof h.id === "string" &&
            typeof h.at === "string" &&
            !Number.isNaN(Date.parse(h.at)) &&
            ["currentState", "pending", "nextStep", "responsible"].every(
              (k) => typeof h[k] === "string",
            ) &&
            (h.risks === undefined || typeof h.risks === "string"),
        ))
    )
      throw new Error("Backup inválido: passagens de trabalho.");
    if (p.homologation !== undefined) validateHomologation(p.homologation);
    for (const event of p.trainings) validateAppointment(event);
    ids.add(p.id);
    const taskIds = new Set();
    for (const t of p.tasks) {
      const stages =
        value.version === 1
          ? ["homologacao", "agenda", "pendencia", "chamado", "concluido"]
          : STAGES.map((s) => s.id);
      if (
        !t ||
        typeof t.id !== "string" ||
        taskIds.has(t.id) ||
        typeof t.title !== "string" ||
        typeof t.module !== "string" ||
        typeof t.date !== "string" ||
        typeof t.time !== "string" ||
        typeof t.owner !== "string" ||
        !stages.includes(t.stage) ||
        !Array.isArray(t.checklists) ||
        !t.checklists.every(
          (c) =>
            c &&
            typeof c.entity === "string" &&
            Array.isArray(c.items) &&
            c.items.every(
              (i) =>
                i &&
                typeof i.id === "string" &&
                typeof i.text === "string" &&
                typeof i.done === "boolean",
            ),
        )
      )
        throw new Error("Backup inválido: atividades incompletas.");
      taskIds.add(t.id);
      for (const field of [
        "type",
        "problem",
        "impact",
        "nextAction",
        "nextOwner",
        "blockedBy",
        "ticketUrl",
        "evidence",
        "criterion",
        "description",
        "executedWork",
        "ticket",
        "ticketStatus",
        "priority",
      ]) {
        if (t[field] !== undefined && typeof t[field] !== "string")
          throw new Error("Backup inválido: contexto da atividade.");
      }
      if (t.completedAt != null && typeof t.completedAt !== "string")
        throw new Error("Backup inválido: data de conclusão.");
      if (
        t.validation != null &&
        (typeof t.validation.by !== "string" ||
          typeof t.validation.evidence !== "string" ||
          typeof t.validation.at !== "string" ||
          Number.isNaN(Date.parse(t.validation.at)))
      )
        throw new Error("Backup inválido: registro de validação.");
      if (
        t.attachments !== undefined &&
        (!Array.isArray(t.attachments) ||
          !t.attachments.every(
            (a) =>
              a &&
              typeof a.id === "string" &&
              typeof a.name === "string" &&
              typeof a.data === "string" &&
              a.data.length <= 1500000 &&
              /^data:(image\/(png|jpeg|webp)|application\/pdf|text\/plain);base64,[A-Za-z0-9+/=]+$/.test(
                a.data,
              ),
          ))
      )
        throw new Error("Backup inválido: anexos.");
    }
    if (
      !p.trainings.every(
        (t) =>
          t &&
          typeof t.id === "string" &&
          typeof t.title === "string" &&
          typeof t.date === "string" &&
          typeof t.time === "string" &&
          typeof t.status === "string",
      ) ||
      !p.logs.every(
        (l) =>
          l &&
          typeof l.id === "string" &&
          typeof l.title === "string" &&
          typeof l.action === "string" &&
          typeof l.at === "string" &&
          !Number.isNaN(Date.parse(l.at)) &&
          (l.criterion === undefined || typeof l.criterion === "string") &&
          (l.executedWork === undefined ||
            typeof l.executedWork === "string") &&
          (l.validation == null ||
            (typeof l.validation.by === "string" &&
              typeof l.validation.evidence === "string" &&
              typeof l.validation.at === "string" &&
              !Number.isNaN(Date.parse(l.validation.at)))),
      )
    )
      throw new Error("Backup inválido: agenda ou histórico incompleto.");
  }
  return migrateWorkspace({
    ...value,
    ...(value.projectOrder !== undefined
      ? {
          projectOrder: [...new Set(value.projectOrder)].filter((id) =>
            ids.has(id),
          ),
        }
      : {}),
    selectedId: ids.has(value.selectedId)
      ? value.selectedId
      : value.projects.find((p) => p.status !== "closed")?.id || "",
  });
}

// Homologação da migração é independente das atividades do quadro.
export const HOMOLOGATION_STATUS = {
  pending: "A conferir",
  issue: "Divergência",
  ok: "OK",
};
const migrationData = {
  "Compras e Contratos":
    "Comparar processos, contratos, fornecedores e valores migrados",
  Almoxarifado: "Comparar materiais, entradas, saídas e saldos de estoque",
  Patrimônio: "Comparar bens, valores, baixas e depreciações",
  Frota: "Comparar veículos, abastecimentos, manutenções e históricos",
  "Fiscalização de contrato":
    "Comparar fiscais, vínculos, ocorrências e medições de contratos",
  Elicita: "Comparar licitações, participantes, itens e resultados migrados",
};
export const homologationId = (module, entity) =>
  JSON.stringify([module, entity]);
export function newHomologationEntry(module, entity) {
  return {
    id: homologationId(module, entity),
    module,
    entity,
    included: false,
    status: "pending",
    notes: "",
    evidence: "",
    validatedBy: "",
    validatedAt: "",
    taskId: "",
    checks: [
      {
        id: "cadastros",
        text: "Conferir os cadastros com o sistema anterior",
        done: false,
      },
      { id: "dados", text: migrationData[module], done: false },
      {
        id: "relatorios",
        text: "Comparar totais e relatórios de referência entre os sistemas",
        done: false,
      },
    ],
  };
}
export function homologationMatrix(project) {
  const saved = new Map(
    (project.homologation?.entries || []).map((e) => [e.id, e]),
  );
  return MODULES.flatMap((module) =>
    [...new Set(project.entities)].map(
      (entity) =>
        saved.get(homologationId(module, entity)) ||
        newHomologationEntry(module, entity),
    ),
  );
}
export function homologationProgress(project) {
  const entries = homologationMatrix(project).filter((e) => e.included);
  const done = entries.filter((e) => e.status === "ok").length;
  const ready = entries.length > 0 && done === entries.length;
  const release = project.homologation?.release;
  // A edição/remoção de uma entidade também invalida uma liberação anterior.
  const released =
    ready &&
    !!release &&
    JSON.stringify(entries.map((e) => e.id).sort()) ===
      JSON.stringify(release.scope.slice().sort());
  return {
    total: entries.length,
    done,
    issues: entries.filter((e) => e.status === "issue").length,
    ready,
    released,
    percent: entries.length ? Math.round((done / entries.length) * 100) : 0,
  };
}
export function configureHomologation(
  project,
  selections,
  now = new Date().toISOString(),
) {
  const matrix = homologationMatrix(project);
  const currentIds = new Set(matrix.map((e) => e.id));
  const chosen = new Set(selections);
  if (selections.some((id) => !currentIds.has(id)))
    throw new Error("Selecione módulos e entidades deste projeto.");
  const changed = matrix.some((e) => e.included !== chosen.has(e.id));
  if (!changed) return project;
  const entries = matrix.map((e) =>
    e.included === chosen.has(e.id)
      ? e
      : {
          ...e,
          included: chosen.has(e.id),
          status: "pending",
          validatedBy: "",
          validatedAt: "",
        },
  );
  return {
    ...project,
    homologation: {
      entries: [
        ...(project.homologation?.entries || []).filter(
          (e) => !currentIds.has(e.id),
        ),
        ...entries,
      ],
      release: null,
    },
    logs: [
      {
        id: uid(),
        title: "Escopo da homologação",
        action: `atualizado: ${chosen.size} conferência(s) de módulos por entidade`,
        at: now,
      },
      ...project.logs,
    ],
  };
}
export function saveHomologationEntry(
  project,
  draft,
  createIssue = false,
  now = new Date().toISOString(),
) {
  const original = homologationMatrix(project).find((e) => e.id === draft.id);
  if (!original?.included)
    throw new Error("Esta combinação não está no escopo da migração.");
  if (
    !Object.hasOwn(HOMOLOGATION_STATUS, draft.status) ||
    !validHomologationEntry(draft, false)
  )
    throw new Error("Conferência inválida.");
  if (
    draft.status === "ok" &&
    (!draft.checks.length ||
      draft.checks.some((c) => !c.done) ||
      !draft.validatedBy.trim() ||
      !draft.evidence.trim())
  )
    throw new Error(
      "Para dar OK, conclua a conferência e informe quem validou e a referência comparada.",
    );
  let entry = {
    ...draft,
    module: original.module,
    entity: original.entity,
    included: true,
    validatedBy: draft.status === "ok" ? draft.validatedBy.trim() : "",
    validatedAt: draft.status === "ok" ? now : "",
    taskId: original.taskId,
  };
  if (createIssue && draft.status === "issue" && !draft.notes.trim())
    throw new Error("Descreva a divergência antes de criar a pendência.");
  let updated = project;
  if (
    createIssue &&
    draft.status === "issue" &&
    !project.tasks.some((t) => t.id === entry.taskId)
  ) {
    const task = {
      ...newActivity(),
      title: `Corrigir migração de ${entry.module} — ${entry.entity}`,
      module: entry.module,
      type: "pendencia",
      priority: "alta",
      problem: draft.notes,
      nextAction:
        "Corrigir a divergência e repetir a conferência dos dados migrados.",
      description: `Origem: homologação da migração · ${entry.entity}`,
      homologationEntryId: entry.id,
    };
    updated = saveActivity(project, task, now);
    entry.taskId = task.id;
  }
  return {
    ...updated,
    homologation: {
      ...project.homologation,
      release: null,
      entries: [
        ...(project.homologation?.entries || []).filter(
          (e) => e.id !== entry.id,
        ),
        entry,
      ],
    },
    logs: [
      {
        id: uid(),
        title: `Homologação · ${entry.module} · ${entry.entity}`,
        action:
          entry.status === "ok"
            ? "OK registrado"
            : entry.status === "issue"
              ? "divergência registrada"
              : "conferência reaberta",
        at: now,
        ...(entry.status === "ok"
          ? {
              validation: {
                by: entry.validatedBy,
                at: now,
                evidence: entry.evidence,
              },
              criterion: entry.checks.map((c) => c.text).join("; "),
            }
          : {}),
      },
      ...updated.logs,
    ],
  };
}
export function releaseHomologation(
  project,
  by,
  now = new Date().toISOString(),
) {
  const progress = homologationProgress(project);
  if (!progress.ready)
    throw new Error(
      "Dê OK em todos os módulos e entidades previstos antes de liberar.",
    );
  if (!by?.trim())
    throw new Error("Informe quem está liberando a homologação.");
  if (progress.released) return project;
  const entries = homologationMatrix(project).filter((e) => e.included);
  const release = { by: by.trim(), at: now, scope: entries.map((e) => e.id) };
  return {
    ...project,
    homologation: { ...project.homologation, release },
    logs: [
      {
        id: uid(),
        title: `Homologação de ${project.name}`,
        action: "liberada",
        at: now,
        validation: {
          by: release.by,
          at: now,
          evidence: entries
            .map((e) => `${e.module} · ${e.entity}: ${e.evidence}`)
            .join("\n"),
        },
        criterion: `Todas as ${entries.length} conferências do escopo com OK`,
      },
      ...project.logs,
    ],
  };
}
function validHomologationEntry(e, checkApproval = true) {
  return (
    e &&
    MODULES.includes(e.module) &&
    typeof e.entity === "string" &&
    e.id === homologationId(e.module, e.entity) &&
    typeof e.included === "boolean" &&
    Object.hasOwn(HOMOLOGATION_STATUS, e.status) &&
    ["notes", "evidence", "validatedBy", "validatedAt", "taskId"].every(
      (k) => typeof e[k] === "string",
    ) &&
    Array.isArray(e.checks) &&
    e.checks.every(
      (c) =>
        c &&
        typeof c.id === "string" &&
        typeof c.text === "string" &&
        !!c.text.trim() &&
        typeof c.done === "boolean",
    ) &&
    new Set(e.checks.map((c) => c.id)).size === e.checks.length &&
    (!checkApproval ||
      e.status !== "ok" ||
      (e.checks.length > 0 &&
        e.checks.every((c) => c.done) &&
        !!e.evidence.trim() &&
        !!e.validatedBy.trim())) &&
    (!e.validatedAt || !Number.isNaN(Date.parse(e.validatedAt)))
  );
}
export function validateHomologation(value) {
  if (
    !value ||
    !Array.isArray(value.entries) ||
    !value.entries.every(
      (e) => validHomologationEntry(e) && (e.status !== "ok" || e.validatedAt),
    ) ||
    new Set(value.entries.map((e) => e.id)).size !== value.entries.length ||
    (value.release != null &&
      (typeof value.release.by !== "string" ||
        !value.release.by.trim() ||
        typeof value.release.at !== "string" ||
        Number.isNaN(Date.parse(value.release.at)) ||
        !Array.isArray(value.release.scope) ||
        !value.release.scope.length ||
        !value.release.scope.every(
          (id) =>
            typeof id === "string" &&
            value.entries.some(
              (e) => e.id === id && e.included && e.status === "ok",
            ),
        )))
  )
    throw new Error("Backup inválido: homologação da migração.");
}

export function updateProjectEntities(previous, next) {
  if (
    !next.homologation ||
    JSON.stringify([...new Set(previous.entities)].sort()) ===
      JSON.stringify([...new Set(next.entities)].sort())
  )
    return next;
  return { ...next, homologation: { ...next.homologation, release: null } };
}

export function createEmptyWorkspace() {
  return { version: 2, selectedId: "", projects: [] };
}
export const isProjectClosed = (project) => project.status === "closed";
export function setProjectClosed(
  workspace,
  id,
  closed,
  now = new Date().toISOString(),
) {
  const project = workspace.projects.find((p) => p.id === id);
  if (!project || isProjectClosed(project) === closed) return workspace;
  const projects = workspace.projects.map((p) =>
    p.id === id
      ? {
          ...p,
          status: closed ? "closed" : "active",
          closedAt: closed ? now : null,
          logs: [
            {
              id: uid(),
              title: p.name,
              action: closed ? "projeto encerrado" : "projeto reaberto",
              at: now,
            },
            ...p.logs,
          ],
        }
      : p,
  );
  return {
    ...workspace,
    projects,
    selectedId:
      closed && workspace.selectedId === id
        ? projects.find((p) => !isProjectClosed(p))?.id || ""
        : workspace.selectedId,
  };
}
export function deleteProject(workspace, id) {
  if (!workspace.projects.some((p) => p.id === id)) return workspace;
  const projects = workspace.projects.filter((p) => p.id !== id);
  const boardViews = { ...workspace.boardViews },
    boardOrders = { ...workspace.boardOrders },
    boardCollapsed = { ...workspace.boardCollapsed };
  delete boardViews[id];
  delete boardOrders[id];
  delete boardCollapsed[id];
  return {
    ...workspace,
    projects,
    boardViews,
    boardOrders,
    boardCollapsed,
    ...(Array.isArray(workspace.projectOrder)
      ? {
          projectOrder: workspace.projectOrder.filter(
            (projectId) => projectId !== id,
          ),
        }
      : {}),
    selectedId:
      workspace.selectedId === id
        ? projects.find((p) => !isProjectClosed(p))?.id || ""
        : workspace.selectedId,
  };
}
export function clearWorkspace(workspace) {
  return {
    ...createEmptyWorkspace(),
    ...(workspace.appearance ? { appearance: workspace.appearance } : {}),
    ...(Array.isArray(workspace.personalAgenda)
      ? { personalAgenda: workspace.personalAgenda }
      : {}),
  };
}
