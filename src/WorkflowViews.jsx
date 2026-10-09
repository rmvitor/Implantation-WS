import React, { useState } from "react";
import { projectColor } from "./project-identity";
import { orderedProjects } from "./project-order";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Building2,
  CalendarDays,
  CheckCheck,
  ChevronRight,
  ChevronDown,
  MoreHorizontal,
  CircleHelp,
  Clock3,
  FileCheck2,
  GraduationCap,
  GripVertical,
  LayoutDashboard,
  List,
  Plus,
  Search,
  Table2,
  Ticket,
  Users,
} from "lucide-react";
import {
  CATEGORIES,
  PRIORITIES,
  sortActivities,
  cardSummary,
  isProjectClosed,
  STAGES,
  MODULES,
  isValidated,
  checklistProgress,
  localDate,
} from "./domain";
import {
  appointmentOccursOn,
  appointmentTimeOn,
  appointmentLabel,
  appointmentRange,
} from "./appointments";

export const formatDate = (
  value,
  options = { day: "2-digit", month: "short" },
) =>
  value
    ? new Date(value.includes("T") ? value : `${value}T12:00:00`)
        .toLocaleDateString("pt-BR", options)
        .replace(".", "")
    : "Sem prazo";
export const stageFor = (task) => STAGES.find((s) => s.id === task.stage);
export function StageBadge({ task }) {
  const stage = stageFor(task);
  return (
    <span className="situation-badge">
      <i style={{ background: stage.color }} />
      {stage.label}
    </span>
  );
}
export function ModuleBadge({ task }) {
  return (
    <span className="activity-tags">
      <span className={`module-tag module-${MODULES.indexOf(task.module)}`}>
        {task.module || "Sem módulo"}
      </span>
      <span className={`priority-tag priority-${task.priority || "normal"}`}>
        {PRIORITIES[task.priority] || "Normal"}
      </span>
    </span>
  );
}
export function handoffGaps(task) {
  return [
    ["Responsável", task.owner],
    ["Prazo", task.date],
    ["Problema", task.problem],
    ["Impacto", task.impact],
    ["Próxima ação", task.nextAction],
    ["Quem age agora", task.nextOwner],
    ["Critério", task.criterion],
    ["Evidência", task.evidence || task.attachments?.length],
  ]
    .filter(([, value]) => !value?.toString().trim())
    .map(([label]) => label);
}
export function ValidationBadge({ task }) {
  return task.stage === "concluido" ? (
    <span className={`validation-badge ${isValidated(task) ? "" : "missing"}`}>
      <FileCheck2 size={12} />
      {isValidated(task)
        ? `Validado por ${task.validation.by}`
        : "Validação não registrada"}
    </span>
  ) : null;
}

export function ProjectsHome({
  canManage = true,
  saving = false,
  onReorder,
  data,
  onOpen,
  onAdd,
  onImport,
  filter,
  onFilter,
  onCloseProject,
  onReopenProject,
  onDeleteProject,
  onContextMenu,
}) {
  const [query, setQuery] = useState("");
  const [sorting, setSorting] = useState(false);
  const [dragged, setDragged] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const [orderMessage, setOrderMessage] = useState("");
  const moveProject = async (source, target) => {
    if (saving || source === target) return;
    setDragged(null);
    setDropTarget(null);
    if (await onReorder(source, target))
      setOrderMessage("Ordem dos projetos salva.");
    else setOrderMessage("Não foi possível salvar a ordem. Tente novamente.");
  };
  const active = data.projects.filter((p) => !isProjectClosed(p));
  const closed = data.projects.filter(isProjectClosed);
  const projects = orderedProjects(
    filter === "closed" ? closed : active,
    data.projectOrder,
  ).filter((p) =>
    `${p.name} ${p.dream} ${p.state}`
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .includes(
        query
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase(),
      ),
  );
  const allTasks = active.flatMap((p) => p.tasks);
  const completed = allTasks.filter(
    (t) => t.stage === "concluido" && isValidated(t),
  ).length;
  return (
    <>
      <div className="page-heading home-heading">
        <div>
          <div className="eyebrow">SEU ESPAÇO DE TRABALHO</div>
          <h1>Projetos e municípios</h1>
          <p>
            Escolha uma implantação. Veja o contexto. Continue de onde a equipe
            parou.
          </p>
        </div>
        <div className="home-heading-actions">
          <button
            className="button secondary"
            disabled={!canManage}
            onClick={onImport}
          >
            Importar dados
          </button>
          <button
            className="button primary"
            disabled={!canManage}
            onClick={onAdd}
          >
            <Plus size={17} /> Novo município
          </button>
        </div>
      </div>
      <section className="home-summary">
        <div>
          <Building2 size={20} />
          <strong>{active.length}</strong>
          <span>projetos ativos</span>
        </div>
        <div>
          <Clock3 size={20} />
          <strong>
            {allTasks.filter((t) => t.stage !== "concluido").length}
          </strong>
          <span>atividades abertas</span>
        </div>
        <div>
          <Users size={20} />
          <strong>
            {allTasks.filter((t) => t.stage === "waiting").length}
          </strong>
          <span>aguardando retorno</span>
        </div>
        <div>
          <CheckCheck size={20} />
          <strong>{completed}</strong>
          <span>conclusões validadas</span>
        </div>
      </section>
      <div
        className="project-status-tabs"
        role="group"
        aria-label="Situação dos projetos"
      >
        <button
          aria-pressed={filter !== "closed"}
          onClick={() => onFilter("active")}
        >
          Ativos <span>{active.length}</span>
        </button>
        <button
          aria-pressed={filter === "closed"}
          onClick={() => onFilter("closed")}
        >
          Encerrados <span>{closed.length}</span>
        </button>
      </div>
      <div className="home-project-toolbar">
        <h2>
          Suas implantações{" "}
          <span className="count-badge">{projects.length}</span>
        </h2>
        <div className="home-project-tools">
          <button
            className="button secondary"
            aria-pressed={sorting}
            disabled={saving || (projects.length < 2 && !sorting)}
            onClick={() => {
              setSorting(!sorting);
              setDragged(null);
              setDropTarget(null);
              setOrderMessage("");
            }}
          >
            {sorting ? <CheckCheck size={16} /> : <GripVertical size={16} />}
            {sorting ? "Concluir ordenação" : "Ordenar projetos"}
          </button>
          <label className="search-input">
            <Search size={16} />
            <input
              placeholder="Buscar município ou código Dream..."
              aria-label="Buscar município"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        </div>
      </div>
      {sorting && (
        <p className="project-order-hint">
          Arraste pelo ícone do card ou use os botões para mover antes ou
          depois. A ordem é salva automaticamente.
        </p>
      )}
      <p className="project-order-status" aria-live="polite">
        {orderMessage}
      </p>
      <div className="municipality-grid">
        {projects.map((p, index) => {
          const done = p.tasks.filter(
            (t) => t.stage === "concluido" && isValidated(t),
          ).length;
          const percent = p.tasks.length
            ? Math.round((done / p.tasks.length) * 100)
            : 0;
          const waiting = p.tasks.filter((t) => t.stage === "waiting").length;
          return (
            <article
              className={`project-home-card ${dragged === p.id ? "project-order-dragging" : ""} ${dropTarget === p.id ? "project-order-target" : ""}`}
              data-project-id={p.id}
              style={{ "--project-color": projectColor(p) }}
              key={p.id}
              onContextMenu={(e) => onContextMenu?.(e, p)}
              onDragOver={(event) => {
                if (!sorting || saving || !dragged || dragged === p.id) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                setDropTarget(p.id);
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget))
                  setDropTarget(null);
              }}
              onDrop={(event) => {
                if (!sorting || saving || !dragged) return;
                event.preventDefault();
                moveProject(dragged, p.id);
              }}
            >
              {sorting && (
                <div
                  className="project-order-controls"
                  role="group"
                  aria-label={`Ordenar ${p.name}`}
                >
                  <button
                    className="project-order-handle"
                    aria-label={`Arrastar projeto ${p.name}`}
                    draggable={!saving}
                    disabled={saving}
                    onDragStart={(event) => {
                      event.dataTransfer.setData("text/plain", p.id);
                      event.dataTransfer.effectAllowed = "move";
                      setDragged(p.id);
                      setOrderMessage("");
                    }}
                    onDragEnd={() => {
                      setDragged(null);
                      setDropTarget(null);
                    }}
                  >
                    <GripVertical size={18} />
                    <span>Mover</span>
                  </button>
                  <button
                    aria-label={`Mover projeto ${p.name} antes`}
                    disabled={saving || index === 0}
                    onClick={() => moveProject(p.id, projects[index - 1].id)}
                  >
                    <ArrowLeft size={16} />
                  </button>
                  <button
                    aria-label={`Mover projeto ${p.name} depois`}
                    disabled={saving || index === projects.length - 1}
                    onClick={() => moveProject(p.id, projects[index + 1].id)}
                  >
                    <ArrowRight size={16} />
                  </button>
                </div>
              )}
              <button
                className="municipality-card"
                onClick={() => onOpen(p.id)}
                onKeyDown={(e) => {
                  if (
                    e.key === "ContextMenu" ||
                    (e.shiftKey && e.key === "F10")
                  )
                    onContextMenu?.(e, p);
                }}
              >
                <div className="municipality-icon">
                  <Building2 size={25} />
                </div>
                <h2>{p.name}</h2>
                <p>
                  {p.state || "UF não informada"} · Dream{" "}
                  {p.dream || "não informado"}
                </p>
                <div className="municipality-meta">
                  <span>{p.entities.length} entidades</span>
                  <span>
                    {p.tasks.length -
                      p.tasks.filter((t) => t.stage === "concluido")
                        .length}{" "}
                    em aberto
                  </span>
                  {waiting > 0 && <span>{waiting} aguardando</span>}
                </div>
                <div className="progress-track">
                  <i style={{ width: `${percent}%` }} />
                </div>
                <footer>
                  <span>Atividades validadas</span>
                  <strong>{percent}%</strong>
                </footer>
                <span className="project-last-action">
                  {p.logs[0]
                    ? `Última atualização: ${formatDate(p.logs[0].at)}`
                    : "Pronto para começar"}
                </span>
                {isProjectClosed(p) && (
                  <span className="project-closed-badge">
                    Encerrado{p.closedAt ? ` em ${formatDate(p.closedAt)}` : ""}
                  </span>
                )}
                {p.demo && (
                  <span className="demo-label">Projeto de demonstração</span>
                )}
              </button>
              <button
                className="icon-button project-menu-trigger"
                aria-label={`Ações do projeto ${p.name}`}
                aria-haspopup="menu"
                onClick={(e) => onContextMenu?.(e, p)}
              >
                <MoreHorizontal size={19} />
              </button>
              <div className="project-card-actions">
                {isProjectClosed(p) ? (
                  <button
                    disabled={!canManage}
                    onClick={() => onReopenProject(p.id)}
                  >
                    Reabrir projeto
                  </button>
                ) : (
                  <button
                    disabled={!canManage}
                    onClick={() => onCloseProject(p.id)}
                  >
                    Encerrar projeto
                  </button>
                )}
                <button
                  className="text-danger"
                  aria-label={`Excluir projeto ${p.name}`}
                  disabled={!canManage}
                  onClick={() => onDeleteProject(p.id)}
                >
                  Excluir
                </button>
              </div>
            </article>
          );
        })}
        {filter !== "closed" && (
          <button
            className="new-project-tile"
            disabled={!canManage}
            onClick={onAdd}
          >
            <span>
              <Plus size={26} />
            </span>
            <strong>Nova implantação</strong>
            <p>
              Cadastre o município, suas entidades
              <br />e organize os próximos passos.
            </p>
          </button>
        )}
      </div>
      {!projects.length && (
        <p className="no-project-result">
          {query
            ? "Nenhum município encontrado para esta busca."
            : filter === "closed"
              ? "Nenhum projeto encerrado."
              : !data.projects.length
                ? "Seu workspace está vazio. Crie um município ou importe seus dados para começar."
                : "Nenhum projeto ativo. Seus projetos concluídos estão em Encerrados."}
        </p>
      )}
      <div className="home-note">
        <Users size={19} />
        <p>
          <strong>Contexto pronto para o próximo colega.</strong> Registre a
          próxima ação, o responsável e as evidências em cada atividade. Para
          transferir os dados entre computadores, use Dados e backup.
        </p>
      </div>
    </>
  );
}

export const BOARD_VIEWS = [
  { id: "kanban", label: "Quadro", icon: LayoutDashboard },
  { id: "list", label: "Lista", icon: List },
  { id: "table", label: "Tabela", icon: Table2 },
  { id: "calendar", label: "Calendário", icon: CalendarDays },
];
export function ViewSwitcher({ value, onChange }) {
  return (
    <div
      className="view-switcher"
      role="group"
      aria-label="Visualização das atividades"
    >
      {BOARD_VIEWS.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          aria-pressed={value === id}
          className={value === id ? "active" : ""}
          onClick={() => onChange(id)}
        >
          <Icon size={16} />
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}

export function ActivitiesList({
  readOnly = false,
  tasks,
  collapsedStages = [],
  onToggleStage,
  onOpen,
  onMove,
  onAdd,
  onContextMenu,
}) {
  return (
    <section className="activities-list" aria-label="Lista de atividades">
      {STAGES.map((stage) => {
        const items = tasks.filter((t) => t.stage === stage.id);
        const collapsed = collapsedStages.includes(stage.id);
        return (
          <section className="list-stage" key={stage.id}>
            <header>
              <h3>
                <button
                  className="list-stage-toggle"
                  aria-label={`${collapsed ? "Expandir" : "Recolher"} fase ${stage.label}`}
                  aria-expanded={!collapsed}
                  onClick={() => onToggleStage?.(stage.id)}
                >
                  <span
                    className="stage-dot"
                    style={{ background: stage.color }}
                  />
                  <span>{stage.label}</span>
                  <span className="count-badge">{items.length}</span>
                  {collapsed ? (
                    <ChevronRight size={16} />
                  ) : (
                    <ChevronDown size={16} />
                  )}
                </button>
              </h3>
              <button
                className="phase-add-button"
                aria-label={`Adicionar em ${stage.label}`}
                disabled={readOnly}
                onClick={() => onAdd(stage.id)}
              >
                <Plus size={16} />
              </button>
            </header>
            {collapsed ? (
              <div className="column-overview list-phase-overview">
                <span>Resumo da fase</span>
                <dl>
                  {[
                    ["Atividades", items.length],
                    [
                      "Prioridade alta",
                      items.filter((t) => t.priority === "alta").length,
                    ],
                    [
                      stage.id === "concluido" ? "Validadas" : "Em atraso",
                      items.filter((t) =>
                        stage.id === "concluido"
                          ? isValidated(t)
                          : t.date && t.date < localDate(),
                      ).length,
                    ],
                    [
                      "Chamados",
                      items.filter((t) => t.type === "chamado").length,
                    ],
                  ].map(([label, count]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{count}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : (
              items.map((t) => (
                <article
                  className="activity-list-row"
                  key={t.id}
                  onContextMenu={(e) => onContextMenu?.(e, t)}
                >
                  <button
                    className="list-activity-main"
                    onClick={() => onOpen(t)}
                  >
                    <div>
                      <ModuleBadge task={t} />
                      <span className="ticket-type-label">
                        {CATEGORIES[t.type] || "Tarefa"}
                      </span>
                    </div>
                    <h4>{cardSummary(t)}</h4>
                    <p className={t.nextAction ? "" : "context-missing"}>
                      {t.nextAction || "Próxima ação ainda não definida"}
                    </p>
                    <ValidationBadge task={t} />
                  </button>
                  <div className="list-responsibility">
                    <strong>{t.owner || "Sem responsável"}</strong>
                    <span>
                      {t.nextOwner
                        ? `Próxima ação: ${t.nextOwner}`
                        : "Quem age agora: a definir"}
                    </span>
                  </div>
                  <span
                    className={`list-due ${t.date && t.date < localDate() && t.stage !== "concluido" ? "overdue" : ""}`}
                  >
                    <CalendarDays size={14} />
                    {formatDate(t.date)}
                  </span>
                  <select
                    aria-label={`Situação de ${t.title}`}
                    value={t.stage}
                    disabled={readOnly}
                    onChange={(e) => onMove(t.id, e.target.value)}
                  >
                    {STAGES.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  <button
                    className="icon-button"
                    aria-label={`Abrir ${t.title}`}
                    onClick={() => onOpen(t)}
                  >
                    <ChevronRight size={17} />
                  </button>
                </article>
              ))
            )}
            {!collapsed && !items.length && (
              <div className="list-empty">
                Nenhuma atividade nesta situação.
              </div>
            )}
          </section>
        );
      })}
    </section>
  );
}

export function ActivitiesTable({
  readOnly = false,
  tasks,
  onOpen,
  onMove,
  priorityOrder,
  onContextMenu,
}) {
  const [sort, setSort] = useState("date");
  const sorted =
    priorityOrder || sort === "priority"
      ? sortActivities(tasks, "priority")
      : [...tasks].sort((a, b) =>
          sort === "title"
            ? a.title.localeCompare(b.title, "pt-BR")
            : sort === "owner"
              ? a.owner.localeCompare(b.owner, "pt-BR")
              : (a.date || "9999").localeCompare(b.date || "9999"),
        );
  return (
    <section className="activities-table-panel">
      <div className="table-toolbar">
        <span>
          {tasks.length} atividades · clique no título para ver o contexto
          completo
        </span>
        <label>
          Ordenar por{" "}
          <select
            value={priorityOrder ? "priority" : sort}
            disabled={priorityOrder}
            onChange={(e) => setSort(e.target.value)}
            aria-label="Ordenar atividades"
          >
            <option value="priority">Prioridade</option>
            <option value="date">Prazo</option>
            <option value="title">Título</option>
            <option value="owner">Responsável</option>
          </select>
        </label>
      </div>
      <div className="table-scroll">
        <table className="activities-table">
          <thead>
            <tr>
              <th>Atividade / módulo</th>
              <th>Situação</th>
              <th>Responsável / prazo</th>
              <th>Próxima ação</th>
              <th>Validação / checklist</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((t) => {
              const c = checklistProgress(t);
              return (
                <tr key={t.id} onContextMenu={(e) => onContextMenu?.(e, t)}>
                  <td>
                    <button onClick={() => onOpen(t)}>
                      <strong>{cardSummary(t)}</strong>
                      <ModuleBadge task={t} />
                      <span className="ticket-type-label">
                        {CATEGORIES[t.type] || "Tarefa"}
                      </span>
                    </button>
                  </td>
                  <td>
                    <select
                      aria-label={`Situação de ${t.title}`}
                      value={t.stage}
                      disabled={readOnly}
                      onChange={(e) => onMove(t.id, e.target.value)}
                    >
                      {STAGES.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                    {t.stage === "waiting" && (
                      <small className="table-subtext">
                        {t.blockedBy || "Dependência a definir"}
                      </small>
                    )}
                  </td>
                  <td>
                    <strong>{t.owner || "A definir"}</strong>
                    <small className="table-subtext">
                      {formatDate(t.date)}
                      {t.time && ` · ${t.time}`}
                    </small>
                  </td>
                  <td>
                    <span className={t.nextAction ? "" : "context-missing"}>
                      {t.nextAction || "Não registrada"}
                    </span>
                    {t.nextOwner && (
                      <small className="table-subtext">{t.nextOwner}</small>
                    )}
                  </td>
                  <td>
                    {t.stage === "concluido" ? (
                      <ValidationBadge task={t} />
                    ) : c.total ? (
                      <span className="table-subtext">
                        <FileCheck2 size={13} />
                        {c.done}/{c.total} itens · {t.checklists.length}{" "}
                        entidades
                      </span>
                    ) : (
                      <span className="table-subtext">Sem checklist</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!tasks.length && (
        <p className="list-empty">Nenhuma atividade com os filtros atuais.</p>
      )}
    </section>
  );
}

export function ActivitiesCalendar({
  readOnly = false,
  tasks,
  trainings,
  onOpen,
  onTraining,
  onAdd,
  onContextMenu,
}) {
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const first = new Date(month);
  first.setDate(1 - ((first.getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(first);
    date.setDate(first.getDate() + index);
    return date;
  });
  const events = [
    ...tasks.filter((t) => t.date).map((t) => ({ ...t, kind: "activity" })),
    ...trainings.map((t) => ({ ...t, kind: "training" })),
  ];
  const undated = tasks.filter((t) => !t.date);
  return (
    <section className="calendar-panel">
      <header className="calendar-toolbar">
        <div>
          <CalendarDays size={20} />
          <h2>
            {month.toLocaleDateString("pt-BR", {
              month: "long",
              year: "numeric",
            })}
          </h2>
        </div>
        <section>
          <button
            className="button secondary"
            onClick={() =>
              setMonth(
                new Date(new Date().getFullYear(), new Date().getMonth(), 1),
              )
            }
          >
            Hoje
          </button>
          <button
            className="icon-button"
            aria-label="Mês anterior"
            onClick={() =>
              setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
            }
          >
            <ArrowLeft size={17} />
          </button>
          <button
            className="icon-button"
            aria-label="Próximo mês"
            onClick={() =>
              setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))
            }
          >
            <ArrowRight size={17} />
          </button>
        </section>
      </header>
      <div className="calendar-legend">
        <span>
          <i />
          Atividade / prazo
        </span>
        <span>
          <i className="training-legend" />
          Treinamento / atendimento
        </span>
        <small>Os mesmos cartões, organizados por data.</small>
      </div>
      <div className="calendar-scroll">
        <div className="calendar-week">
          {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        <div className="calendar-grid">
          {days.map((date) => {
            const iso = localDate(date);
            const items = events
              .filter((e) =>
                e.kind === "training"
                  ? appointmentOccursOn(e, iso)
                  : e.date === iso,
              )
              .sort((a, b) =>
                appointmentTimeOn(a, iso).localeCompare(
                  appointmentTimeOn(b, iso),
                ),
              );
            return (
              <div
                className={`calendar-day ${date.getMonth() !== month.getMonth() ? "outside-month" : ""} ${iso === localDate() ? "calendar-today" : ""}`}
                key={iso}
                data-date={iso}
              >
                <header>
                  <time dateTime={iso}>{date.getDate()}</time>
                  <button
                    aria-label={`Adicionar atividade em ${iso}`}
                    disabled={readOnly}
                    onClick={() => onAdd("todo", iso)}
                  >
                    <Plus size={13} />
                  </button>
                </header>
                {items.map((t) => (
                  <button
                    key={t.id}
                    className={`calendar-event ${t.kind === "training" ? "training-event" : ""} ${t.stage === "concluido" ? "finished-event" : ""}`}
                    title={
                      t.kind === "training"
                        ? `${appointmentLabel(t)}: ${t.title} · ${appointmentRange(t)}`
                        : `${t.time || ""} ${cardSummary(t)}`
                    }
                    data-appointment-id={
                      t.kind === "training" ? t.id : undefined
                    }
                    onContextMenu={(e) =>
                      t.kind !== "training" && onContextMenu?.(e, t)
                    }
                    onClick={() =>
                      t.kind === "training" ? onTraining(t) : onOpen(t)
                    }
                  >
                    {t.kind === "training" ? (
                      <GraduationCap size={12} />
                    ) : (
                      <span
                        className="stage-dot"
                        style={{ background: stageFor(t).color }}
                      />
                    )}
                    <span>
                      {t.kind === "training" ? (
                        <>
                          <small>
                            {t.date === iso ? t.time : "Continua"} ·{" "}
                            {appointmentLabel(t)}
                          </small>
                          {t.title}
                        </>
                      ) : (
                        <>
                          {t.time && <small>{t.time} </small>}
                          {cardSummary(t)}
                        </>
                      )}
                    </span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </div>
      <details className="undated-activities">
        <summary>{undated.length} atividades sem data</summary>
        <div>
          {undated.map((t) => (
            <button
              key={t.id}
              onClick={() => onOpen(t)}
              onContextMenu={(e) => onContextMenu?.(e, t)}
            >
              <Clock3 size={14} />
              <span>{cardSummary(t)}</span>
              <ModuleBadge task={t} />
              <ChevronRight size={13} />
            </button>
          ))}
        </div>
      </details>
    </section>
  );
}
