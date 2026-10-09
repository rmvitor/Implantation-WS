import {
  newActivity,
  normalizeModule,
  MODULES,
  newHomologationEntry,
  validateBackup,
  localDate,
} from "../src/domain.js";
const normalize = (text) =>
  String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
const entityName = (name) =>
  ({ camara: "Câmara", previdencia: "Previdência", prefeitura: "Prefeitura" })[
    normalize(name).trim()
  ] || name.trim();
function inferModule(title) {
  const t = normalize(title);
  if (/patrimonio|bens|depreciac|agregac/.test(t)) return "Patrimônio";
  if (/almoxarif|estoque/.test(t)) return "Almoxarifado";
  if (/frota|veiculo|abastecimento/.test(t)) return "Frota";
  if (/fiscais|gestores|fiscalizacao/.test(t))
    return "Fiscalização de contrato";
  if (/elicita|licitac|pregao|\bpe\s*\d|pncp|\barp\b|dispensa/.test(t))
    return "Elicita";
  if (/compra|contrat|aditiv|apostil|catmat|catser|\bdfd\b|minuta/.test(t))
    return "Compras e Contratos";
  return "";
}
function cardDate(card, actions) {
  if (card.due && !Number.isNaN(Date.parse(card.due))) {
    const date = new Date(card.due);
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date);
    const v = Object.fromEntries(parts.map((p) => [p.type, p.value]));
    return {
      date: `${v.year}-${v.month}-${v.day}`,
      time: `${v.hour}:${v.minute}`,
    };
  }
  const match = card.name.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\b/);
  if (!match) return { date: "", time: "" };
  const created = actions.find(
    (a) => a.type === "createCard" && a.data?.card?.id === card.id,
  )?.date;
  const sourceYear = created
    ? new Date(created).getUTCFullYear()
    : new Date(parseInt(card.id.slice(0, 8), 16) * 1000).getUTCFullYear();
  const year = Number(match[3] || sourceYear);
  const date = `${year}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  if (
    !Number.isFinite(year) ||
    localDate(new Date(`${date}T12:00:00`)) !== date
  )
    return { date: "", time: "" };
  const hour = card.name.match(/\b(\d{1,2})h(?:([0-5]\d))?\b/);
  return {
    date,
    time:
      hour && Number(hour[1]) < 24
        ? `${hour[1].padStart(2, "0")}:${hour[2] || "00"}`
        : "",
  };
}
function actionText(action) {
  const d = action.data || {};
  switch (action.type) {
    case "createCard":
      return `cartão criado no Trello${d.list?.name ? ` em ${d.list.name}` : ""}`;
    case "updateCard":
      if (d.listAfter)
        return `movido no Trello de ${d.listBefore?.name || "outra lista"} para ${d.listAfter.name}`;
      if (d.old && "closed" in d.old)
        return d.card?.closed
          ? "cartão arquivado no Trello"
          : "cartão desarquivado no Trello";
      if (d.old && "pos" in d.old) return "ordem do cartão alterada no Trello";
      return "cartão atualizado no Trello";
    case "updateCheckItemStateOnCard":
      return `checklist no Trello: ${d.checkItem?.name || "item"} ${d.checkItem?.state === "complete" ? "marcado" : "desmarcado"}`;
    case "addChecklistToCard":
      return `checklist ${d.checklist?.name || ""} adicionado no Trello`;
    case "removeChecklistFromCard":
      return `checklist ${d.checklist?.name || ""} removido no Trello`;
    case "updateChecklist":
      return "checklist atualizado no Trello";
    case "copyBoard":
      return "quadro copiado no Trello";
    case "addToOrganizationBoard":
      return "quadro adicionado ao workspace no Trello";
    default:
      return `registro do Trello: ${action.type}`;
  }
}
export function convertTrello(board) {
  if (
    !board ||
    typeof board.id !== "string" ||
    typeof board.name !== "string" ||
    !Array.isArray(board.cards) ||
    !Array.isArray(board.lists) ||
    !Array.isArray(board.checklists)
  )
    throw new Error("Selecione uma exportação JSON de quadro do Trello.");
  const lists = new Map(board.lists.map((l) => [l.id, l]));
  const checks = new Map(board.checklists.map((c) => [c.id, c]));
  const actions = (board.actions || []).filter(
    (a) => typeof a.date === "string" && !Number.isNaN(Date.parse(a.date)),
  );
  const members = new Map(
    (board.members || []).map((m) => [m.id, m.fullName || m.username || ""]),
  );
  const project = {
    id: `trello-project-${board.id}`,
    name: board.name.trim(),
    state: "",
    dream: "",
    fiscal: "",
    cpf: "",
    fiscalEmail: "",
    contact: "",
    contactEmail: "",
    status: "active",
    closedAt: null,
    entities: [],
    tasks: [],
    trainings: [],
    logs: [],
    homologation: { entries: [], release: null },
    trello: {
      boardId: board.id,
      boardUrl: board.url || board.shortUrl || "",
      boardName: board.name,
      archivedCards: [],
      homologationCards: [],
    },
  };
  const taskIds = new Map();
  const report = {
    sourceCards: board.cards.length,
    archivedCards: 0,
    homologationCards: 0,
    homologationPairs: 0,
    checkedMigrationItems: 0,
    tasks: 0,
    stages: {},
    categories: {},
    unknownModules: [],
    sourceActions: actions.length,
    entities: [],
  };
  const sorted = [...board.cards].sort(
    (a, b) =>
      (lists.get(a.idList)?.pos || 0) - (lists.get(b.idList)?.pos || 0) ||
      (a.pos || 0) - (b.pos || 0),
  );
  for (const card of sorted) {
    const list = lists.get(card.idList);
    const listName = normalize(list?.name);
    const cardChecks = (card.idChecklists || [])
      .map((id) => checks.get(id))
      .filter(Boolean);
    if (card.closed || list?.closed) {
      project.trello.archivedCards.push({
        ...card,
        listName: list?.name || "",
        checklists: cardChecks,
      });
      report.archivedCards++;
      continue;
    }
    const module = normalizeModule(card.name);
    const entityChecks = cardChecks.filter((c) =>
      /^entidades?$/.test(normalize(c.name).trim()),
    );
    if (
      /homolog/.test(listName) &&
      MODULES.includes(module) &&
      entityChecks.length
    ) {
      project.trello.homologationCards.push({
        ...card,
        checklists: cardChecks,
      });
      report.homologationCards++;
      for (const checklist of entityChecks)
        for (const item of checklist.checkItems || []) {
          const entity = entityName(item.name);
          if (!project.entities.includes(entity)) project.entities.push(entity);
          const entry = newHomologationEntry(module, entity);
          entry.included = true;
          entry.checks = [
            {
              id: `trello-check-${item.id}`,
              text: "Conferir e validar os dados migrados desta entidade",
              done: item.state === "complete",
            },
          ];
          entry.notes = `Importado do checklist “${checklist.name}” do cartão “${card.name}”. Item original: ${item.name}. No Trello: ${item.state === "complete" ? "marcado como concluído" : "a conferir"}. O OK formal e a liberação devem ser registrados no Implanta. Origem: ${card.url || card.shortUrl || ""}`;
          entry.trello = {
            cardId: card.id,
            cardUrl: card.url || card.shortUrl || "",
            checklistId: checklist.id,
            itemId: item.id,
            originalEntityName: item.name,
          };
          project.homologation.entries.push(entry);
          if (item.state === "complete") report.checkedMigrationItems++;
        }
      continue;
    }
    const number = card.name.match(/^\s*#?(\d{5,10})\s*[-–—:]\s*/);
    const title = number ? card.name.slice(number[0].length).trim() : card.name;
    const dates = cardDate(card, actions);
    const stage = /concluid|conclu[ií]d|finaliz/.test(listName)
      ? "concluido"
      : /chamado|aguardando/.test(listName)
        ? "waiting"
        : /andamento/.test(listName)
          ? "progress"
          : /homolog/.test(listName)
            ? "homologacao"
            : "todo";
    const category =
      number || /chamado/.test(normalize(title)) || /chamado/.test(listName)
        ? "chamado"
        : /agenda/.test(listName) || dates.date
          ? "agenda"
          : /pend/.test(listName)
            ? "pendencia"
            : "tarefa";
    const priority = (card.labels || []).some((l) =>
      /alto|alta/.test(normalize(l.name)),
    )
      ? "alta"
      : (card.labels || []).some((l) => /baixo|baixa/.test(normalize(l.name)))
        ? "baixa"
        : "normal";
    const task = {
      ...newActivity(stage),
      id: `trello-task-${card.id}`,
      title,
      module: inferModule(card.name),
      type: category,
      priority,
      owner: (card.idMembers || [])
        .map((id) => members.get(id))
        .filter(Boolean)
        .join(", "),
      ...dates,
      ticket: number?.[1] || "",
      ticketStatus: "Não informado",
      description: [
        card.desc || "",
        `Origem Trello: ${card.url || card.shortUrl || ""}`,
        ...(card.attachments || []).map(
          (a) => `Anexo original: ${a.name} — ${a.url}`,
        ),
      ]
        .filter(Boolean)
        .join("\n"),
      checklists: cardChecks.map((c) => ({
        entity: c.name,
        items: (c.checkItems || []).map((i) => ({
          id: `trello-check-${i.id}`,
          text: i.name,
          done: i.state === "complete",
        })),
      })),
      trello: {
        cardId: card.id,
        cardUrl: card.url || card.shortUrl || "",
        originalTitle: card.name,
        listName: list?.name || "",
        labels: card.labels || [],
        attachments: card.attachments || [],
        moduleInferred: !!inferModule(card.name),
      },
    };
    if (stage === "concluido")
      task.completedAt =
        card.dateCompleted ||
        actions.find(
          (a) =>
            a.data?.card?.id === card.id &&
            /concluid/.test(normalize(a.data?.listAfter?.name)),
        )?.date ||
        null;
    project.tasks.push(task);
    taskIds.set(card.id, task.id);
    if (!task.module)
      report.unknownModules.push({ title: card.name, cardId: card.id });
  }
  project.logs = actions
    .map((a) => ({
      id: `trello-log-${a.id}`,
      title: a.data?.card?.name || a.data?.checklist?.name || board.name,
      action: actionText(a),
      at: a.date,
      ...(taskIds.has(a.data?.card?.id)
        ? { taskId: taskIds.get(a.data.card.id) }
        : {}),
      trello: {
        type: a.type,
        author: a.memberCreator?.fullName || "",
        source: a.data,
      },
    }))
    .sort((a, b) => b.at.localeCompare(a.at));
  report.tasks = project.tasks.length;
  report.homologationPairs = project.homologation.entries.length;
  report.entities = project.entities;
  for (const t of project.tasks) {
    report.stages[t.stage] = (report.stages[t.stage] || 0) + 1;
    report.categories[t.type] = (report.categories[t.type] || 0) + 1;
  }
  const workspace = validateBackup({
    version: 2,
    selectedId: project.id,
    projects: [project],
  });
  return { workspace, report };
}
