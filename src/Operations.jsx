import React, { useState, useEffect } from "react";
import {
  MODULES,
  PRIORITIES,
  localDate,
  uid,
  saveActivity,
  newActivity,
} from "./domain.js";
import {
  actionLimits,
  actionNow,
  portfolio,
  weeklyBulletin,
  instantiateTemplate,
} from "./operations.js";
import { publicBackup } from "./privacy.js";

const datetime = (value) =>
  value ? new Date(value).toLocaleString("pt-BR") : "Não registrado";
const textDownload = (text, name) => {
  const url = URL.createObjectURL(
    new Blob([text], { type: "text/plain;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
};
export function Operations({
  onEditing,
  data,
  saving,
  canEdit,
  actor,
  onChange,
  onOpen,
}) {
  const [tab, setTab] = useState("actions");
  const limits = actionLimits(data.actionLimits);
  const [settings, setSettings] = useState(limits);
  const [scope, setScope] = useState("active");
  const projects = data.projects.filter(
    (p) => scope === "all" || p.status !== "closed",
  );
  const [selected, setSelected] = useState(
    data.selectedId || data.projects[0]?.id || "",
  );
  const project = data.projects.find((p) => p.id === selected);
  const blank = {
    currentState: "",
    pending: "",
    nextStep: "",
    responsible: "",
    risks: "",
  };
  const [handover, setHandover] = useState(blank);
  const [notice, setNotice] = useState("");
  const [template, setTemplate] = useState({
    name: "",
    title: "",
    module: "",
    priority: "normal",
    problem: "",
    nextAction: "",
    criterion: "",
    checks: "",
  });
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return localDate(d);
  });
  const [to, setTo] = useState(localDate());
  const [bulletin, setBulletin] = useState("");
  useEffect(() => {
    const dirty =
      Object.values(handover).some(Boolean) ||
      template.name ||
      template.title ||
      bulletin;
    onEditing?.(!!dirty);
    return () => onEditing?.(false);
  }, [handover, template, bulletin, onEditing]);
  const edit = async (update) => {
    if (await onChange(update)) {
      setNotice("Alterações salvas.");
      return true;
    }
    return false;
  };
  const projectPicker = (
    <label>
      Município
      <select
        aria-label="Município para operação"
        value={selected}
        onChange={(e) => {
          setSelected(e.target.value);
          setHandover(blank);
        }}
      >
        {data.projects
          .filter((p) => p.status !== "closed")
          .map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
      </select>
    </label>
  );
  return (
    <section className="operations-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">IMPLANTAÇÕES</span>
          <h1>Acompanhamento geral</h1>
          <p>Somente os municípios liberados à sua conta.</p>
        </div>
      </div>
      <div
        className="operations-tabs"
        role="tablist"
        aria-label="Acompanhamento geral"
      >
        {[
          ["actions", "Ação agora"],
          ["portfolio", "Municípios"],
          ["handover", "Passagem de trabalho"],
          ["bulletin", "Boletim semanal"],
          ["templates", "Modelos"],
        ].map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => {
              setTab(key);
              setNotice("");
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {notice && <p role="status">{notice}</p>}
      {["portfolio", "bulletin"].includes(tab) && (
        <label className="operations-scope">
          Projetos
          <select value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="active">Ativos</option>
            <option value="all">Todos, incluindo encerrados</option>
          </select>
        </label>
      )}
      {tab === "actions" && (
        <>
          <form
            className="operations-settings"
            onSubmit={async (e) => {
              e.preventDefault();
              await edit((d) => ({ ...d, actionLimits: settings }));
            }}
          >
            <label>
              Prazo próximo (dias)
              <input
                type="number"
                min="0"
                max="365"
                required
                value={settings.nearDays}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    nearDays: Number(e.target.value),
                  }))
                }
              />
            </label>
            <label>
              Chamado parado (dias)
              <input
                type="number"
                min="0"
                max="365"
                required
                value={settings.staleDays}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    staleDays: Number(e.target.value),
                  }))
                }
              />
            </label>
            <button className="button secondary" disabled={saving}>
              Salvar limites
            </button>
          </form>
          <p className="muted">
            Prazos em dias corridos, incluindo hoje. Chamados em Aguardando
            retorno sem atualização há {limits.staleDays} dias. Limites da sua
            conta.
          </p>
          <div className="operations-rows">
            {actionNow(data.projects, limits).map(
              ({ project: p, task, reasons, updated }) => (
                <button
                  className="operations-row"
                  key={`${p.id}/${task.id}`}
                  onClick={() => onOpen(p.id, task)}
                >
                  <strong>{task.title}</strong>
                  <span>
                    {p.name} · {task.module || "Sem módulo"}
                  </span>
                  <span>{reasons.join(" · ")}</span>
                  <small>
                    {task.date ? `Prazo: ${task.date} · ` : ""}Última
                    atualização: {datetime(updated)}
                    {task.nextOwner || task.owner
                      ? ` · ${task.nextOwner || task.owner}`
                      : ""}
                  </small>
                </button>
              ),
            )}
          </div>
          {!actionNow(data.projects, limits).length && (
            <p>Nenhuma pendência nesses critérios.</p>
          )}
        </>
      )}
      {tab === "portfolio" && (
        <div className="operations-rows">
          {portfolio(projects, limits).map(
            ({
              project: p,
              done,
              total,
              homologation: h,
              actions,
              handover: pass,
            }) => (
              <article className="operations-row" key={p.id}>
                <button className="project-link" onClick={() => onOpen(p.id)}>
                  <strong>{p.name}</strong>
                  <span>{p.status === "closed" ? "Encerrado" : "Ativo"}</span>
                </button>
                <div className="operations-metrics">
                  <span>
                    Atividades validadas{" "}
                    <b>
                      {done}/{total}
                    </b>
                  </span>
                  <span>
                    Dados migrados com OK{" "}
                    <b>
                      {h.done}/{h.total}
                    </b>
                  </span>
                  <span>
                    Ação agora <b>{actions}</b>
                  </span>
                </div>
                <p>
                  Próximo passo: {pass?.nextStep || "Não informado"}
                  {pass?.responsible ? ` · ${pass.responsible}` : ""}
                </p>
              </article>
            ),
          )}
        </div>
      )}
      {tab === "handover" && (
        <>
          {projectPicker}
          <form
            className="operations-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!project || !canEdit(project.id)) return;
              if (!Object.values(handover).some((v) => v.trim())) {
                setNotice("Preencha ao menos uma informação da passagem.");
                return;
              }
              const record = {
                ...handover,
                id: uid(),
                at: new Date().toISOString(),
                ...(actor
                  ? {
                      actorId: actor.id,
                      actorName: actor.name,
                      source: "authenticated-client",
                    }
                  : { source: "local" }),
              };
              if (
                await edit((d) => ({
                  ...d,
                  projects: d.projects.map((p) =>
                    p.id === project.id
                      ? { ...p, handovers: [record, ...(p.handovers || [])] }
                      : p,
                  ),
                }))
              )
                setHandover(blank);
            }}
          >
            {Object.entries({
              currentState: "Situação atual",
              pending: "Pendências",
              nextStep: "Próximo passo",
              responsible: "Responsável pelo próximo passo",
              risks: "Riscos identificados",
            }).map(([key, label]) => (
              <label key={key}>
                {label}
                <textarea
                  rows="2"
                  value={handover[key]}
                  disabled={!project || !canEdit(project.id)}
                  onChange={(e) =>
                    setHandover((s) => ({ ...s, [key]: e.target.value }))
                  }
                />
              </label>
            ))}
            <button
              className="button primary"
              disabled={saving || !project || !canEdit(project.id)}
            >
              Registrar passagem
            </button>
          </form>
          <div className="operations-rows">
            {(project?.handovers || []).map((h) => (
              <article className="operations-row" key={h.id}>
                <strong>
                  {datetime(h.at)} · {h.actorName || "Registro local/histórico"}
                </strong>
                {Object.entries({
                  currentState: "Situação",
                  pending: "Pendências",
                  nextStep: "Próximo passo",
                  responsible: "Responsável",
                  risks: "Riscos",
                }).map(
                  ([key, label]) =>
                    h[key] && (
                      <p key={key}>
                        <b>{label}:</b> {h[key]}
                      </p>
                    ),
                )}
              </article>
            ))}
          </div>
        </>
      )}
      {tab === "bulletin" && (
        <>
          <form
            className="operations-settings"
            onSubmit={(e) => {
              e.preventDefault();
              if (from > to) {
                setNotice("O início precisa ser anterior ao fim.");
                return;
              }
              setBulletin(
                weeklyBulletin(
                  publicBackup({ projects }).projects,
                  from,
                  to,
                  limits,
                ),
              );
            }}
          >
            <label>
              Início do boletim
              <input
                required
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label>
              Fim do boletim
              <input
                required
                type="date"
                min={from}
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
            <button className="button primary">Gerar boletim</button>
          </form>
          <p className="muted">
            Avanços no período escolhido; pendências, riscos registrados e
            próximos passos na situação atual. Revise antes de compartilhar.
          </p>
          <label>
            Texto do boletim
            <textarea
              className="bulletin-text"
              rows="20"
              value={bulletin}
              onChange={(e) => setBulletin(e.target.value)}
            />
          </label>
          <button
            className="button secondary"
            disabled={!bulletin}
            onClick={() =>
              textDownload(
                publicBackup({ text: bulletin }).text,
                `implanta-boletim-${from}-${to}.md`,
              )
            }
          >
            Baixar boletim
          </button>
        </>
      )}
      {tab === "templates" && (
        <>
          <p className="muted">
            Modelos da sua conta. Defina suas rotinas sem criar etapas
            obrigatórias. A aplicação cria uma nova atividade, sem copiar
            validação, prazos, anexos ou chamados.
          </p>
          <form
            className="operations-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const { checks, name, ...fields } = template;
              const model = {
                id: uid(),
                name: name.trim(),
                activity: { ...newActivity(), ...fields },
                checks: checks
                  .split("\n")
                  .map((v) => v.trim())
                  .filter(Boolean),
              };
              if (
                await edit((d) => ({
                  ...d,
                  taskTemplates: [...(d.taskTemplates || []), model],
                }))
              )
                setTemplate({ ...template, name: "", title: "", checks: "" });
            }}
          >
            <label>
              Nome do modelo
              <input
                required
                pattern=".*[^ ].*"
                value={template.name}
                onChange={(e) =>
                  setTemplate((t) => ({ ...t, name: e.target.value }))
                }
              />
            </label>
            <label>
              Título da tarefa
              <input
                required
                pattern=".*[^ ].*"
                value={template.title}
                onChange={(e) =>
                  setTemplate((t) => ({ ...t, title: e.target.value }))
                }
              />
            </label>
            <label>
              Módulo
              <select
                value={template.module}
                onChange={(e) =>
                  setTemplate((t) => ({ ...t, module: e.target.value }))
                }
              >
                <option value="">Sem módulo</option>
                {MODULES.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </label>
            <label>
              Prioridade
              <select
                value={template.priority}
                onChange={(e) =>
                  setTemplate((t) => ({ ...t, priority: e.target.value }))
                }
              >
                {Object.entries(PRIORITIES).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            {Object.entries({
              problem: "Problema / contexto",
              nextAction: "Próxima ação",
              criterion: "Critério de conclusão",
              checks: "Checklist (um item por linha)",
            }).map(([k, l]) => (
              <label key={k}>
                {l}
                <textarea
                  rows="2"
                  value={template[k]}
                  onChange={(e) =>
                    setTemplate((t) => ({ ...t, [k]: e.target.value }))
                  }
                />
              </label>
            ))}
            <button className="button primary" disabled={saving}>
              Salvar modelo
            </button>
          </form>
          {projectPicker}
          <div className="operations-rows">
            {(data.taskTemplates || []).map((m) => (
              <article className="operations-row" key={m.id}>
                <strong>{m.name}</strong>
                <span>
                  {m.activity.title} · {m.activity.module || "Sem módulo"}
                </span>
                <div className="operations-buttons">
                  <button
                    className="button secondary"
                    disabled={saving || !project || !canEdit(project.id)}
                    onClick={async () => {
                      const task = instantiateTemplate(m, project.entities);
                      await edit((d) => ({
                        ...d,
                        projects: d.projects.map((p) =>
                          p.id === project.id ? saveActivity(p, task) : p,
                        ),
                      }));
                    }}
                  >
                    Aplicar ao município
                  </button>
                  <button
                    className="button secondary text-danger"
                    disabled={saving}
                    onClick={() =>
                      edit((d) => ({
                        ...d,
                        taskTemplates: d.taskTemplates.filter(
                          (t) => t.id !== m.id,
                        ),
                      }))
                    }
                  >
                    Excluir modelo
                  </button>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
