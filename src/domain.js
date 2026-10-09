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
  return `${task.title}${task.ticket ? ` — #${task.ticket}` : ""}`;
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
          task.blockedBy,
          ...(task.checklists || []).map((c) => c.entity),
        ].join(" "),
      ).includes(normalize(query))) &&
    (!module || task.module === module) &&
    (!priority || task.priority === priority)
  );
}
const list = (entity, completed = 0) => ({
  entity,
  items: [
    "Validar cadastros e dados migrados",
    "Executar rotina com o responsável",
    "Confirmar aceite da entidade",
  ].map((text, i) => ({ id: uid(), text, done: i < completed })),
});
const task = (title, module, stage, extra = {}) => ({
  ...newActivity(stage),
  title,
  module: normalizeModule(module),
  owner: "Você",
  ...extra,
});
export function createDemo() {
  return {
    version: 2,
    selectedId: "quatro-barras",
    projects: [
      {
        id: "quatro-barras",
        name: "Quatro Barras",
        state: "PR",
        dream: "1042",
        fiscal: "",
        cpf: "",
        fiscalEmail: "",
        contact: "",
        contactEmail: "",
        entities: ["Prefeitura", "Fundo de Saúde", "Câmara Municipal"],
        demo: true,
        tasks: [
          task("Homologação de Frotas", "Frotas", "homologacao", {
            date: nextDate(2),
            checklists: [list("Prefeitura", 1), list("Fundo de Saúde")],
          }),
          task("Homologação do Almoxarifado", "Almoxarifado", "homologacao", {
            checklists: [list("Prefeitura"), list("Fundo de Saúde")],
          }),
          task("Validar os bens patrimoniais", "Patrimônio", "homologacao", {
            checklists: [list("Prefeitura", 2)],
          }),
          task(
            "Revisar compras e contratos",
            "Compras e contratos",
            "homologacao",
            { checklists: [list("Prefeitura", 3)], priority: "baixa" },
          ),
          task("Validar migração com a equipe", "Patrimônio", "todo", {
            date: localDate(),
            time: "14:00",
            description:
              "Reunião para conferir os dados migrados com a equipe do município.",
          }),
          task("Acompanhar processo licitatório", "Licitações", "todo", {
            date: nextDate(1),
            time: "10:00",
          }),
          task(
            "Relatório de autorização em duas vias",
            "Compras e contratos",
            "todo",
            {
              priority: "alta",
              date: nextDate(1),
              description:
                "Ajustar a impressão para que as duas vias fiquem na mesma página.",
            },
          ),
          task("Conferir entrada com a mesma NF", "Almoxarifado", "progress", {
            nextAction:
              "Conferir as entradas duplicadas no ambiente de testes e registrar o resultado.",
            nextOwner: "Você",
            checklists: [list("Prefeitura", 1)],
          }),
          task(
            "Corrigir baixas e depreciações dos bens migrados",
            "Patrimônio",
            "waiting",
            {
              type: "chamado",
              ticket: "872797",
              priority: "alta",
              ticketStatus: "Em análise",
              blockedBy: "IPM",
              problem:
                "Bens migrados permanecem ativos após a baixa e apresentam depreciação divergente.",
              impact:
                "Impede o fechamento patrimonial e a conferência dos saldos.",
              nextAction:
                "IPM: analisar a correção das baixas. Consultor: validar os saldos após o retorno.",
              nextOwner: "Fábrica IPM",
              evidence:
                "Exemplo fictício: bem 0042, relatório de depreciação de setembro.",
              criterion:
                "Conferir os bens baixados e comparar os saldos do relatório com os dados migrados.",
            },
          ),
          task("PE 36/2026 · maior desconto", "Licitações", "waiting", {
            type: "chamado",
            ticket: "871884",
            blockedBy: "IPM",
            ticketStatus: "Em desenvolvimento",
          }),
          task(
            "Migração de CATMAT e CATSER",
            "Compras e contratos",
            "waiting",
            {
              type: "chamado",
              ticket: "871886",
              blockedBy: "IPM",
              ticketStatus: "Aguardando retorno",
            },
          ),
          task(
            "Roteiro de solicitação e requisição",
            "Almoxarifado",
            "concluido",
            {
              criterion:
                "Executar o roteiro e confirmar o resultado com a equipe.",
              validation: {
                by: "Consultor (exemplo)",
                at: localDate(),
                evidence:
                  "Registro fictício de demonstração: rotina conferida com a equipe.",
              },
              completedAt: new Date().toISOString(),
            },
          ),
          task(
            "Criação dos centros de compras",
            "Compras e contratos",
            "concluido",
            {
              criterion:
                "Executar o roteiro e confirmar o resultado com a equipe.",
              validation: {
                by: "Consultor (exemplo)",
                at: localDate(),
                evidence:
                  "Registro fictício de demonstração: rotina conferida com a equipe.",
              },
              completedAt: new Date().toISOString(),
            },
          ),
        ],
        trainings: [
          {
            id: uid(),
            title: "Compras e contratos",
            entity: "Prefeitura",
            date: nextDate(1),
            time: "09:00",
            duration: "2h",
            owner: "Você",
            status: "Agendado",
            notes: "",
          },
          {
            id: uid(),
            title: "Gestão de patrimônio",
            entity: "Prefeitura",
            date: nextDate(3),
            time: "14:00",
            duration: "2h",
            owner: "Você",
            status: "Agendado",
            notes: "",
          },
        ],
        logs: [
          {
            id: uid(),
            title: "Criação dos centros de compras",
            action: "concluída",
            at: new Date().toISOString(),
          },
          {
            id: uid(),
            title: "Roteiro de solicitação e requisição",
            action: "concluída",
            at: new Date().toISOString(),
          },
        ],
      },
    ],
  };
}
export function validateBackup(value) {
  if (
    !value ||
    ![1, 2].includes(value.version) ||
    !Array.isArray(value.projects) ||
    !value.projects.length
  )
    throw new Error("Selecione um backup do Implanta.");
  const ids = new Set();
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
    selectedId: ids.has(value.selectedId)
      ? value.selectedId
      : value.projects[0].id,
  });
}
