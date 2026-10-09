import {
  localDate,
  newActivity,
  uid,
  isValidated,
  homologationProgress,
} from "./domain.js";
import { same } from "./team-domain.js";

export const DEFAULT_ACTION_LIMITS = { nearDays: 1, staleDays: 5 };
export function actionLimits(value = {}) {
  const limit = (n, fallback) =>
    Number.isInteger(n) && n >= 0 && n <= 365 ? n : fallback;
  return {
    nearDays: limit(value.nearDays, 1),
    staleDays: limit(value.staleDays, 5),
  };
}
export function lastTaskUpdate(project, task) {
  return (
    [
      task.updatedAt,
      ...project.logs.filter((l) => l.taskId === task.id).map((l) => l.at),
    ]
      .filter((v) => v && !Number.isNaN(Date.parse(v)))
      .sort()
      .at(-1) || null
  );
}
export function actionNow(projects, limits, now = new Date()) {
  const { nearDays, staleDays } = actionLimits(limits);
  const today = localDate(now),
    end = new Date(now);
  end.setDate(end.getDate() + nearDays);
  const horizon = localDate(end),
    result = [];
  for (const project of projects.filter((p) => p.status !== "closed"))
    for (const task of project.tasks) {
      if (task.stage === "concluido") continue;
      const reasons = [];
      if (task.date && task.date < today) reasons.push("Atrasada");
      else if (task.date && task.date <= horizon) reasons.push("Prazo próximo");
      const updated = lastTaskUpdate(project, task);
      if (task.type === "chamado" && task.stage === "waiting") {
        if (!updated) reasons.push("Sem atualização registrada");
        else if (now.getTime() - Date.parse(updated) >= staleDays * 86400000)
          reasons.push("Chamado parado");
      }
      if (reasons.length) result.push({ project, task, reasons, updated });
    }
  return result.sort((a, b) =>
    (a.task.date || "9999").localeCompare(b.task.date || "9999"),
  );
}
export function portfolio(projects, limits, now = new Date()) {
  const actions = actionNow(projects, limits, now);
  return projects.map((project) => ({
    project,
    done: project.tasks.filter((t) => t.stage === "concluido" && isValidated(t))
      .length,
    total: project.tasks.length,
    homologation: homologationProgress(project),
    actions: actions.filter((a) => a.project.id === project.id).length,
    handover: [...(project.handovers || [])].sort((a, b) =>
      b.at.localeCompare(a.at),
    )[0],
  }));
}
export function instantiateTemplate(template, entities = []) {
  const task = {
    ...newActivity(),
    ...structuredClone(template.activity),
    id: uid(),
    stage: "todo",
    validation: null,
    completedAt: null,
    date: "",
    time: "",
    ticket: "",
    ticketUrl: "",
    attachments: [],
  };
  task.checklists = entities.map((entity) => ({
    entity,
    items: (template.checks || []).map((text) => ({
      id: uid(),
      text,
      done: false,
    })),
  }));
  return task;
}
export function weeklyBulletin(projects, from, to, limits) {
  const inPeriod = (value) =>
    typeof value === "string" &&
    value.slice(0, 10) >= from &&
    value.slice(0, 10) <= to;
  const lines = [`Boletim de implantação · ${from} a ${to}`, ""];
  for (const p of projects) {
    lines.push(
      `## ${p.name}${p.status === "closed" ? " (encerrado)" : ""}`,
      "Avanços:",
    );
    const progress = p.logs.filter((l) => inPeriod(l.at));
    lines.push(
      ...(progress.length
        ? progress.map(
            (l) =>
              `- ${l.title}: ${l.action}${l.actorName ? ` (${l.actorName})` : ""}`,
          )
        : ["- Nenhum avanço registrado no período."]),
    );
    lines.push("Pendências:");
    const open = p.tasks.filter((t) => t.stage !== "concluido");
    lines.push(
      ...(open.length
        ? open.map(
            (t) =>
              `- ${t.title}${t.date ? ` · prazo ${t.date}` : ""}${t.owner ? ` · ${t.owner}` : ""}`,
          )
        : ["- Nenhuma atividade aberta."]),
    );
    const handover = [...(p.handovers || [])].sort((a, b) =>
      b.at.localeCompare(a.at),
    )[0];
    lines.push("Riscos registrados:", handover?.risks || "- Não informados.");
    const signals = actionNow([p], limits).filter((a) =>
      a.reasons.some((r) => ["Atrasada", "Chamado parado"].includes(r)),
    );
    if (signals.length)
      lines.push(
        "Sinais para avaliar:",
        ...signals.map((a) => `- ${a.task.title}: ${a.reasons.join(", ")}`),
      );
    lines.push(
      "Próximos passos:",
      ...(handover?.nextStep
        ? [
            `- ${handover.nextStep}${handover.responsible ? ` · ${handover.responsible}` : ""}`,
          ]
        : open
            .filter((t) => t.nextAction)
            .map(
              (t) =>
                `- ${t.nextAction}${t.nextOwner ? ` · ${t.nextOwner}` : ""}`,
            )),
      "",
    );
  }
  return lines.join("\n");
}

// Client attribution is useful in the legacy protocol, but only v2 SQL stamps
// trusted server time and authenticated identity. Imported history stays intact.
export function stampChanges(
  base,
  next,
  actor,
  now = new Date().toISOString(),
) {
  return {
    ...next,
    projects: next.projects.map((p) => {
      const old = base.projects.find((b) => b.id === p.id);
      if (!old) return p;
      const identity = actor
        ? {
            actorId: actor.id,
            actorName: actor.name,
            source: "authenticated-client",
          }
        : { source: "local" };
      const tasks = p.tasks.map((t) => {
        const previous = old.tasks.find((x) => x.id === t.id);
        if (same(previous, t)) return t;
        return { ...t, updatedAt: now, updatedBy: actor?.id || null };
      });
      const logs = p.logs.map((l) =>
        old.logs.some((x) => x.id === l.id)
          ? l
          : { ...l, at: now, ...identity },
      );
      if (
        !same(old, p) &&
        !logs.some((l) => !old.logs.some((x) => x.id === l.id))
      )
        logs.unshift({
          id: uid(),
          title: p.name,
          action: "dados do município ou passagem atualizados",
          at: now,
          ...identity,
        });
      return { ...p, tasks, logs };
    }),
  };
}
