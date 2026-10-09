import { same } from "./team-domain.js";

export const RECORD_KINDS = [
  "municipality",
  "activity",
  "ticket",
  "context",
  "handover",
  "training",
  "history",
  "homologation",
  "conference",
  "personal",
];
const contextFields = [
  "problem",
  "impact",
  "nextAction",
  "nextOwner",
  "blockedBy",
  "criterion",
  "evidence",
];
const ticketFields = ["ticket", "ticketUrl", "ticketStatus"];
const managed = ["updatedAt", "updatedBy"];
const pick = (object, fields) =>
  Object.fromEntries(
    fields.filter((f) => Object.hasOwn(object, f)).map((f) => [f, object[f]]),
  );
const omit = (object, fields) =>
  Object.fromEntries(
    Object.entries(object).filter(([f]) => !fields.includes(f)),
  );
export const recordKey = (r) => JSON.stringify([r.project_id, r.kind, r.id]);
export function projectRecords(project, includePersonal = true) {
  const records = [],
    add = (kind, id, data) =>
      records.push({ kind, id, project_id: project.id, data });
  add("municipality", project.id, {
    ...omit(project, [
      "tasks",
      "trainings",
      "logs",
      "handovers",
      "homologation",
      "cpf",
    ]),
    taskOrder: project.tasks.map((t) => t.id),
    trainingOrder: project.trainings.map((t) => t.id),
  });
  if (includePersonal) add("personal", project.id, { cpf: project.cpf || "" });
  for (const task of project.tasks) {
    add(
      "activity",
      task.id,
      omit(task, [...contextFields, ...ticketFields, ...managed]),
    );
    add("context", task.id, pick(task, contextFields));
    if (
      task.type === "chamado" ||
      task.ticket ||
      task.ticketUrl ||
      (task.ticketStatus !== undefined &&
        task.ticketStatus !== "Aguardando retorno")
    )
      add("ticket", task.id, pick(task, ticketFields));
  }
  for (const [kind, list] of [
    ["training", project.trainings],
    ["history", project.logs],
    ["handover", project.handovers || []],
  ])
    for (const item of list) add(kind, item.id, item);
  if (project.homologation) {
    add("homologation", project.id, {
      ...omit(project.homologation, ["entries"]),
      entryOrder: (project.homologation.entries || []).map((e) => e.id),
    });
    for (const entry of project.homologation.entries || [])
      add("conference", entry.id, entry);
  }
  return records;
}
export function assembleRecords(records) {
  const municipalities = records.filter((r) => r.kind === "municipality");
  return municipalities.map((root) => {
    const own = records.filter((r) => r.project_id === root.project_id);
    const get = (kind, id) => own.find((r) => r.kind === kind && r.id === id);
    const list = (kind) => own.filter((r) => r.kind === kind);
    const sort = (items, order = []) =>
      [...items].sort((a, b) => {
        const ai = order.indexOf(a.id),
          bi = order.indexOf(b.id);
        return (ai < 0 ? 1e9 : ai) - (bi < 0 ? 1e9 : bi);
      });
    const h = get("homologation", root.id);
    return {
      ...omit(root.data, ["taskOrder", "trainingOrder"]),
      cpf: get("personal", root.id)?.data.cpf || "",
      tasks: sort(list("activity"), root.data.taskOrder).map((r) => {
        const context = get("context", r.id),
          ticket = get("ticket", r.id);
        const latest = [r, context, ticket]
          .filter((item) => item?.updated_at)
          .sort((a, b) => Date.parse(a.updated_at) - Date.parse(b.updated_at))
          .at(-1);
        return {
          ticket: "",
          ticketUrl: "",
          ticketStatus: "Aguardando retorno",
          ...r.data,
          ...context?.data,
          ...ticket?.data,
          updatedAt: latest?.updated_at || r.data.updatedAt,
          updatedBy: latest?.updated_by || null,
        };
      }),
      trainings: sort(list("training"), root.data.trainingOrder).map(
        (r) => r.data,
      ),
      logs: list("history")
        .map((r) => r.data)
        .sort((a, b) => b.at.localeCompare(a.at)),
      handovers: list("handover")
        .map((r) => r.data)
        .sort((a, b) => b.at.localeCompare(a.at)),
      ...(h
        ? {
            homologation: {
              ...omit(h.data, ["entryOrder"]),
              entries: sort(list("conference"), h.data.entryOrder).map(
                (r) => r.data,
              ),
            },
          }
        : {}),
    };
  });
}
export function recordChanges(
  before,
  after,
  remoteRecords,
  includePersonal = true,
) {
  const old = new Map(
    before
      .flatMap((p) => projectRecords(p, includePersonal))
      .map((r) => [recordKey(r), r]),
  );
  const desired = new Map(
    after
      .flatMap((p) => projectRecords(p, includePersonal))
      .map((r) => [recordKey(r), r]),
  );
  const current = new Map(remoteRecords.map((r) => [recordKey(r), r]));
  const changes = [];
  for (const [key, r] of desired)
    if (!same(old.get(key)?.data, r.data))
      changes.push({ ...r, revision: current.get(key)?.revision ?? 0 });
  const removed = [...old]
    .filter(([key]) => !desired.has(key))
    .map(([key, r]) => ({
      kind: r.kind,
      id: r.id,
      project_id: r.project_id,
      revision: current.get(key)?.revision ?? 0,
    }));
  return { changes, removed };
}
