import React, {
  useEffect,
  useLayoutEffect,
  useId,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  Bell,
  Building2,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Download,
  Eye,
  EyeOff,
  Ellipsis,
  ExternalLink,
  FileCheck2,
  GraduationCap,
  Grip,
  LayoutDashboard,
  ListChecks,
  LoaderCircle,
  MapPin,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Ticket,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import {
  STAGES,
  MODULES,
  CATEGORIES,
  PRIORITIES,
  sortActivities,
  cardSummary,
  uid,
  localDate,
  nextDate,
  checklistProgress,
  moveTask,
  matchesTask,
  createEmptyWorkspace,
  isProjectClosed,
  setProjectClosed,
  deleteProject,
  clearWorkspace,
  validateBackup,
  newActivity,
  saveActivity,
  isValidated,
  updateProjectEntities,
} from "./domain";
import {
  APPOINTMENT_TYPES,
  appointmentType,
  appointmentLabel,
  appointmentEnd,
  appointmentOccursOn,
  appointmentHasUpcomingDays,
  appointmentTimeOn,
  appointmentDuration,
  appointmentRange,
  validateAppointment,
} from "./appointments";
import "@fontsource-variable/dm-sans";
import "@fontsource-variable/manrope";
import {
  ProjectsHome,
  ViewSwitcher,
  ActivitiesList,
  ActivitiesTable,
  ActivitiesCalendar,
  ValidationBadge,
  ModuleBadge,
} from "./WorkflowViews";
import { HandoffFields } from "./HandoffFields";
import "./styles.css";
import "./workflow.css";
import "./appearance.css";
import "./homologation.css";
import "./pwa.css";
import "./projects.css";
import "./app-usability.css";
import "./board-height.css";
import { CardMenu } from "./CardMenu";
import {
  ProjectNavigation,
  ProjectMenu,
  ProjectSwitcher,
} from "./ProjectControls";
import { projectColor, PROJECT_COLORS } from "./project-identity";
import { orderedProjects, reorderProjects } from "./project-order";
import { PersonalAgenda, PersonalEventModal } from "./PersonalAgenda";
import { BrandLogo } from "./BrandLogo";
import "./project-controls.css";
import { TeamHost, TeamSettings, useTeam } from "./Team";
import { same } from "./team-domain";
import { friendlyTeamError } from "./team-service";
import { usePwa, PwaControls, InstallModal } from "./PwaControls";
import { stampChanges } from "./operations.js";
import { publicBackup, preserveOmittedData } from "./privacy.js";
import { AuditHistory } from "./AuditHistory.jsx";
import { Operations } from "./Operations.jsx";
import "./operations.css";
import { Homologation } from "./Homologation";
import { BoardScroller } from "./BoardScroller";
import { ProfileSettings, applyAppearance } from "./ProfileSettings";
import { version as appVersion } from "../package.json";

const STORAGE = "implanta.workspace.v1";
const formatDate = (value, options = { day: "2-digit", month: "short" }) =>
  value
    ? new Date(value.includes("T") ? value : `${value}T12:00:00`)
        .toLocaleDateString("pt-BR", options)
        .replace(".", "")
    : "Sem data";
const priorityLabel = {
  alta: "Alta prioridade",
  normal: "Normal",
  baixa: "Baixa prioridade",
};
const stageIcons = {
  todo: ListChecks,
  progress: Clock3,
  waiting: Users,
  homologacao: FileCheck2,
  concluido: CheckCheck,
};
function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE);
    return saved ? validateBackup(JSON.parse(saved)) : createEmptyWorkspace();
  } catch {
    return createEmptyWorkspace();
  }
}
function App() {
  const team = useTeam();
  const [data, applyData] = useState(() =>
    team.online ? team.workspace : loadState(),
  );
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const pwa = usePwa();
  const [homologationEditing, setHomologationEditing] = useState(false);
  const [operationsEditing, setOperationsEditing] = useState(false);
  const [view, setView] = useState("municipalities");
  const [projectFilter, setProjectFilter] = useState("active");
  const [modal, setModal] = useState(null);
  const [search, setSearch] = useState("");
  const [module, setModule] = useState("");
  const [priority, setPriority] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [toast, setToast] = useState("");
  const [sidebar, setSidebar] = useState(false);
  const [dragging, setDragging] = useState(null);
  const fileRef = useRef();
  const cardPositions = useRef(new Map());
  const [dropTarget, setDropTarget] = useState(null);
  const [cardMenu, setCardMenu] = useState(null);
  const [projectMenu, setProjectMenu] = useState(null);
  useEffect(() => {
    team.setEditing?.(
      !!modal || homologationEditing || operationsEditing || saving,
    );
  }, [modal, homologationEditing, operationsEditing, saving]);
  useEffect(() => {
    if (!team.online || !team.workspace) return;
    if (
      data.selectedId &&
      !team.workspace.projects.some((p) => p.id === data.selectedId) &&
      view !== "personalAgenda" &&
      view !== "operations"
    ) {
      setModal(null);
      setView("municipalities");
      setHomologationEditing(false);
    }
    applyData(team.workspace);
  }, [team.workspace]);
  useLayoutEffect(() => {
    applyAppearance(data.appearance);
  }, [data.appearance]);
  const captureCards = () => {
    cardPositions.current = new Map(
      [...document.querySelectorAll("[data-task-id]")].map((el) => [
        el.dataset.taskId,
        el.getBoundingClientRect(),
      ]),
    );
  };
  useLayoutEffect(() => {
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
      document.querySelectorAll("[data-task-id]").forEach((el) => {
        const before = cardPositions.current.get(el.dataset.taskId);
        const after = el.getBoundingClientRect();
        if (
          before &&
          (Math.abs(before.x - after.x) > 1 || Math.abs(before.y - after.y) > 1)
        )
          el.animate(
            [
              {
                transform: `translate(${before.x - after.x}px, ${before.y - after.y}px) rotate(-1deg)`,
              },
              { transform: "translate(0,0) rotate(0deg)" },
            ],
            { duration: 260, easing: "cubic-bezier(.2,.8,.2,1)" },
          );
      });
    }
    cardPositions.current.clear();
  }, [data]);
  const project =
    data.projects.find((p) => p.id === data.selectedId) ||
    data.projects.find((p) => !isProjectClosed(p)) ||
    null;
  const projectId = project?.id || "";
  const projectTasks = project?.tasks || [];
  const projectTrainings = project?.trainings || [];
  const canManage = !team.online || !!team.profile?.admin;
  const canEdit = !team.online || team.canEdit(projectId);
  const collapsedStages = Array.isArray(data.boardCollapsed?.[projectId])
    ? data.boardCollapsed[projectId]
    : [];
  const setCollapsedStages = (stages) =>
    setData((d) => ({
      ...d,
      boardCollapsed: { ...d.boardCollapsed, [projectId]: stages },
    }));
  const openProjectMenu = (event, selected) => {
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    setCardMenu(null);
    setProjectMenu({
      projectId: selected.id,
      x: event.clientX || bounds.left + 20,
      y: event.clientY || bounds.top + 25,
    });
  };
  const openCardMenu = (event, task) => {
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    setCardMenu({
      taskId: task.id,
      x: event.clientX || bounds.left + 20,
      y: event.clientY || bounds.top + 25,
    });
  };
  const taskOrder = data.boardOrders?.[projectId] || "manual";
  const tasks = sortActivities(
    projectTasks.filter(
      (t) =>
        matchesTask(t, search, module, priority) &&
        (!typeFilter || t.type === typeFilter),
    ),
    taskOrder,
  );
  const boardView = ["kanban", "list", "table", "calendar"].includes(
    data.boardViews?.[projectId],
  )
    ? data.boardViews[projectId]
    : "kanban";
  const setBoardView = (value) =>
    setData((d) => ({
      ...d,
      boardViews: { ...d.boardViews, [projectId]: value },
    }));
  const done = projectTasks.filter(
    (t) => t.stage === "concluido" && isValidated(t),
  ).length;
  const progress = projectTasks.length
    ? Math.round((done / projectTasks.length) * 100)
    : 0;
  const today = localDate();
  const todayEvents = [
    ...projectTasks.filter((t) => t.stage !== "concluido" && t.date === today),
    ...projectTrainings
      .filter((t) => appointmentOccursOn(t, today) && t.status !== "Realizado")
      .map((t) => ({
        ...t,
        time: appointmentTimeOn(t, today),
        ongoing: t.date < today,
      })),
  ];
  const openTickets = projectTasks.filter(
    (t) => t.type === "chamado" && t.stage !== "concluido",
  ).length;
  const setData = async (update, options = {}) => {
    if (savingRef.current) {
      setToast("Aguarde a confirmação do salvamento em andamento.");
      return false;
    }
    const raw = typeof update === "function" ? update(data) : update;
    const next = options.import ? raw : stampChanges(data, raw, team.actor);
    try {
      const serialized = JSON.stringify(next);
      if (!team.online && serialized.length > 4 * 1024 * 1024)
        throw new Error("quota");
      if (team.online) {
        for (const p of next.projects) {
          const original = data.projects.find((old) => old.id === p.id);
          if (
            !same(original, p) &&
            !(original ? team.canEdit(p.id) : canManage)
          )
            throw new Error(
              "Você tem acesso somente de leitura a este projeto.",
            );
        }
        savingRef.current = true;
        setSaving(true);
        applyData(await team.commit(data, next, options));
      } else {
        localStorage.setItem(STORAGE, serialized);
        applyData(next);
      }
      return true;
    } catch (error) {
      setToast(
        team.online
          ? friendlyTeamError(error)
          : "Não foi possível salvar. O formulário foi preservado. Reduza os anexos ou exporte um backup antes de liberar espaço no navegador.",
      );
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  const updateProject = (updater) =>
    setData((d) => ({
      ...d,
      projects: d.projects.map((p) =>
        p.id === projectId
          ? typeof updater === "function"
            ? updater(p)
            : updater
          : p,
      ),
    }));
  const changeView = (v) => {
    setCardMenu(null);
    setProjectMenu(null);
    setView(v);
    setSearch("");
    setSidebar(false);
  };
  const move = async (id, stage) => {
    if (!canEdit) {
      setToast("Este projeto está liberado somente para leitura.");
      return;
    }
    const task = projectTasks.find((t) => t.id === id);
    if (!task || task.stage === stage) return;
    if (stage === "concluido") {
      setModal({ type: "task", task: { ...task, stage }, isNew: false });
      return;
    }
    captureCards();
    if (await updateProject((p) => moveTask(p, id, stage)))
      setToast("Situação atualizada. Histórico preservado.");
  };
  const newTask = (stage = "todo", date = "") => {
    if (!canEdit) {
      setToast("Este projeto está liberado somente para leitura.");
      return;
    }
    setModal({ type: "task", task: newActivity(stage, date), isNew: true });
  };
  const saveTask = async (task, isNew) => {
    try {
      captureCards();
      const original = projectTasks.find((t) => t.id === task.id);
      if (
        team.actor &&
        task.stage === "concluido" &&
        (original?.stage !== "concluido" ||
          !same(original?.validation, task.validation) ||
          original?.criterion !== task.criterion)
      )
        task = {
          ...task,
          validation: {
            ...task.validation,
            by: team.actor.name,
            actorId: team.actor.id,
            at: new Date().toISOString(),
            source: "authenticated-client",
          },
        };
      if (await updateProject((p) => saveActivity(p, task))) {
        setModal(null);
        setToast(isNew ? "Atividade criada." : "Alterações salvas.");
      }
    } catch (error) {
      setToast(error.message);
    }
  };
  const exportData = (full = false) => {
    full = full === true;
    if (full && !(team.online && team.profile?.admin)) {
      setToast("CPF completo: somente administradores autenticados.");
      return;
    }
    const exported = full ? data : publicBackup(data);
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(exported, null, 2)], {
        type: "application/json",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `implanta-backup-${today}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setToast(
      "Backup exportado. Revise contatos e textos antes de compartilhar.",
    );
  };
  const importData = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      const imported = validateBackup(JSON.parse(await file.text()));
      setModal({ type: "import", data: imported });
    } catch (e) {
      setToast(e.message || "Não foi possível ler o backup.");
    }
    event.target.value = "";
  };
  const selectProject = async (id) => {
    const selected = await setData((d) => ({ ...d, selectedId: id }));
    setSearch("");
    setModule("");
    setPriority("");
    setTypeFilter("");
    return selected;
  };
  const nextTraining = projectTrainings
    .filter((t) => appointmentHasUpcomingDays(t, today))
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))[0];
  const pageNames = {
    board: "Quadro do município",
    municipalities: "Projetos e municípios",
    homologation: "Homologação da migração",
    agenda: "Minha agenda",
    trainings: "Treinamento/Atendimento",
    history: "Histórico de execução",
    details: "Dados do município",
    personalAgenda: "Agenda geral",
    operations: "Acompanhamento geral",
  };
  useEffect(() => {
    document.title =
      view === "operations"
        ? "Acompanhamento geral · Implanta"
        : view === "personalAgenda"
          ? "Agenda geral · Implanta"
          : view === "municipalities" || !project
            ? "Projetos e municípios · Implanta"
            : `${project.name} · ${pageNames[view]} · Implanta`;
    return () => {
      document.title = "Implanta";
    };
  }, [project?.name, view]);
  return (
    <div
      className={`app-shell ${project && view !== "personalAgenda" ? "has-active-project" : ""} ${saving ? "app-saving" : ""}`}
      style={{ "--project-color": projectColor(project) }}
    >
      {sidebar && (
        <div className="nav-scrim" onClick={() => setSidebar(false)} />
      )}
      <aside className={`sidebar ${sidebar ? "open" : ""}`}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            changeView("municipalities");
          }}
        >
          <BrandLogo />
        </a>
        <ProjectSwitcher
          project={project}
          projects={orderedProjects(data.projects, data.projectOrder)}
          busy={saving}
          onSelect={async (id) => {
            if (!(await selectProject(id))) return false;
            changeView(view === "municipalities" ? "board" : view);
            return true;
          }}
        />
        <div className="nav-label">WORKSPACE</div>
        <nav>
          <NavItem
            icon={Building2}
            text="Início"
            active={view === "municipalities"}
            onClick={() => changeView("municipalities")}
          />
          <NavItem
            icon={LayoutDashboard}
            text="Quadro do município"
            disabled={!project}
            active={view === "board" || view === "details"}
            onClick={() => changeView("board")}
          />
          <NavItem
            icon={FileCheck2}
            text="Homologação"
            disabled={!project}
            active={view === "homologation"}
            onClick={() => changeView("homologation")}
          />
          <NavItem
            icon={CalendarDays}
            text="Minha agenda"
            disabled={!project}
            badge={todayEvents.length || null}
            active={view === "agenda"}
            onClick={() => changeView("agenda")}
          />
          <NavItem
            icon={GraduationCap}
            text="Capacitação e suporte"
            disabled={!project}
            active={view === "trainings"}
            onClick={() => changeView("trainings")}
          />
          <NavItem
            icon={Clock3}
            text="Histórico"
            disabled={!project}
            active={view === "history"}
            onClick={() => changeView("history")}
          />
          <hr className="sidebar-personal-separator" />
          <NavItem
            icon={CalendarDays}
            text="Agenda geral"
            active={view === "personalAgenda"}
            onClick={() => changeView("personalAgenda")}
          />
          <NavItem
            icon={LayoutDashboard}
            text="Acompanhamento geral"
            active={view === "operations"}
            onClick={() => changeView("operations")}
          />
        </nav>
        <div className="sidebar-bottom">
          <div className="nav-label management-label">GERENCIAMENTO</div>
          <button
            className="subtle-nav"
            onClick={() => setModal({ type: "backup" })}
          >
            <Settings2 size={18} /> Dados e backup
          </button>
          <button
            className="subtle-nav"
            onClick={() => setModal({ type: "help" })}
          >
            <CircleHelp size={18} /> Ajuda e fluxo de trabalho
          </button>
          <button
            className="subtle-nav"
            onClick={() => setModal({ type: "team" })}
          >
            <Users size={18} />{" "}
            {team.online ? "Equipe e acessos" : "Trabalho em equipe"}
          </button>
          <PwaControls
            pwa={pwa}
            editing={
              !!modal || homologationEditing || operationsEditing || saving
            }
            onInstall={() => setModal({ type: "install" })}
          />
          <button
            className="profile"
            aria-label="Configurações do perfil"
            onClick={() => setModal({ type: "profile" })}
          >
            <span className="avatar">VC</span>
            <div>
              <strong>{team.profile?.name || "Seu workspace"}</strong>
              <small>
                {team.online ? "Banco da equipe" : "Armazenamento local"}
              </small>
            </div>
            <Settings2 size={17} />
          </button>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="mobile-menu icon-button"
              aria-label="Abrir menu"
              onClick={() => setSidebar(true)}
            >
              <Grip size={20} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>{pageNames[view]}</strong>
          </div>
          <div className="topbar-actions">
            <span className="today-label">
              {formatDate(today, {
                weekday: "short",
                day: "numeric",
                month: "short",
              })}
            </span>
            <button
              className="notification icon-button"
              aria-label="Ver compromissos de hoje"
              onClick={() => changeView("agenda")}
            >
              <Bell size={19} />
              {todayEvents.length > 0 && <i />}
            </button>
            <span className="topbar-divider" />
            <button
              className="avatar small-avatar"
              aria-label="Abrir configurações do perfil"
              onClick={() => setModal({ type: "profile" })}
            >
              VC
            </button>
          </div>
        </header>
        <div className="page-content">
          {team.online &&
            (team.stale ||
              team.error ||
              (project && !canEdit && view !== "personalAgenda")) && (
              <div className="team-sync-bar">
                <Users size={15} />{" "}
                {team.error ||
                  (team.stale
                    ? "Há uma atualização da equipe. Feche a edição para carregá-la; seu rascunho foi mantido."
                    : "Este projeto está liberado somente para leitura.")}
              </div>
            )}
          {view === "operations" ? (
            <Operations
              onEditing={setOperationsEditing}
              data={data}
              saving={saving}
              canEdit={(id) => !team.online || team.canEdit(id)}
              actor={team.actor}
              onChange={setData}
              onOpen={async (id, task) => {
                if (await selectProject(id)) {
                  changeView("board");
                  if (task) setModal({ type: "task", task, isNew: false });
                }
              }}
            />
          ) : view === "personalAgenda" ? (
            <PersonalAgenda
              events={data.personalAgenda || []}
              saving={saving}
              onAdd={(date) => setModal({ type: "personalEvent", date })}
              onEdit={(event) => setModal({ type: "personalEvent", event })}
            />
          ) : view === "municipalities" || !project ? (
            <>
              <ProjectsHome
                canManage={canManage}
                saving={saving}
                onReorder={(source, target) =>
                  setData((workspace) =>
                    reorderProjects(workspace, source, target),
                  )
                }
                onContextMenu={openProjectMenu}
                data={data}
                filter={projectFilter}
                onFilter={setProjectFilter}
                onImport={() => fileRef.current.click()}
                onCloseProject={(id) =>
                  setModal({
                    type: "closeProject",
                    project: data.projects.find((p) => p.id === id),
                  })
                }
                onReopenProject={async (id) => {
                  if (await setData((d) => setProjectClosed(d, id, false))) {
                    setProjectFilter("active");
                    setToast("Projeto reaberto.");
                  }
                }}
                onDeleteProject={(id) =>
                  setModal({
                    type: "deleteProject",
                    project: data.projects.find((p) => p.id === id),
                  })
                }
                onOpen={async (id) => {
                  if (await selectProject(id)) changeView("board");
                }}
                onAdd={() => setModal({ type: "project", isNew: true })}
              />
            </>
          ) : (
            <>
              <div className="page-heading project-heading">
                <div>
                  <div className="eyebrow">
                    <span className="live-dot" />{" "}
                    {isProjectClosed(project)
                      ? "PROJETO ENCERRADO"
                      : "IMPLANTAÇÃO EM ANDAMENTO"}
                  </div>
                  <div className="title-row">
                    <h1>{project.name}</h1>
                    <span className="state-tag">{project.state || "BR"}</span>
                  </div>
                  <p>
                    {view === "board"
                      ? "Tudo o que você precisa para fazer a implantação acontecer."
                      : view === "details"
                        ? "Informações e contatos sempre à mão."
                        : view === "trainings"
                          ? "Capacitação e salas de atendimento remoto em uma agenda própria."
                          : view === "homologation"
                            ? "Conferência e liberação dos dados migrados por módulo e entidade."
                            : view === "history"
                              ? "Um registro de tudo o que foi feito, sem trabalho extra."
                              : "Seus próximos passos, organizados por data."}
                  </p>
                </div>
                <div className="heading-actions">
                  {view === "details" && (
                    <>
                      {isProjectClosed(project) ? (
                        <button
                          disabled={!canManage}
                          className="button secondary"
                          onClick={async () => {
                            if (
                              await setData((d) =>
                                setProjectClosed(d, project.id, false),
                              )
                            ) {
                              setProjectFilter("active");
                              setToast("Projeto reaberto.");
                            }
                          }}
                        >
                          Reabrir projeto
                        </button>
                      ) : (
                        <button
                          disabled={!canManage}
                          className="button secondary"
                          onClick={() =>
                            setModal({ type: "closeProject", project })
                          }
                        >
                          Encerrar projeto
                        </button>
                      )}
                      <button
                        disabled={!canManage}
                        className="button secondary project-delete-button"
                        aria-label="Excluir projeto"
                        onClick={() =>
                          setModal({ type: "deleteProject", project })
                        }
                      >
                        Excluir
                      </button>
                    </>
                  )}
                  <button
                    className="button secondary"
                    onClick={() =>
                      changeView(view === "details" ? "board" : "details")
                    }
                  >
                    <Building2 size={16} />
                    <span>
                      {view === "details" ? "Ver quadro" : "Dados do município"}
                    </span>
                  </button>
                  {view !== "homologation" && (
                    <button
                      disabled={!canEdit}
                      className="button primary"
                      onClick={() =>
                        view === "trainings"
                          ? setModal({ type: "training", isNew: true })
                          : newTask("todo", view === "agenda" ? today : "")
                      }
                    >
                      <Plus size={17} />
                      {view === "trainings"
                        ? "Novo treinamento/atendimento"
                        : "Nova atividade"}
                    </button>
                  )}
                </div>
              </div>
              {project.demo && (
                <div className="demo-note">
                  <span>Você está explorando um projeto de demonstração.</span>
                  <button
                    onClick={() => setModal({ type: "project", isNew: true })}
                  >
                    Cadastrar meu município <ArrowRight size={13} />
                  </button>
                </div>
              )}
              <ProjectNavigation view={view} onChange={changeView} />
              {view === "board" && (
                <>
                  <section className="stats-grid">
                    <StatCard
                      icon={FileCheck2}
                      label="Progresso da implantação"
                      value={`${progress}%`}
                      tone="green"
                      subtitle={`${done} de ${project.tasks.length} atividades validadas`}
                      progress={progress}
                    />
                    <StatCard
                      icon={Clock3}
                      label="Aguardando retorno"
                      value={
                        project.tasks.filter((t) => t.stage === "waiting")
                          .length
                      }
                      tone="amber"
                      subtitle="Dependências com IPM, município ou equipe"
                      onClick={() => {
                        setShowFilters(false);
                        setSearch("");
                        document
                          .getElementById("column-waiting")
                          ?.scrollIntoView({
                            behavior: "smooth",
                            block: "nearest",
                            inline: "center",
                          });
                      }}
                    />
                    <StatCard
                      icon={Ticket}
                      label="Chamados em aberto"
                      value={openTickets}
                      tone="rose"
                      subtitle="Acompanhamento em um só lugar"
                      onClick={() => {
                        setTypeFilter("chamado");
                        setShowFilters(true);
                      }}
                    />
                    <StatCard
                      icon={CalendarDays}
                      label="Compromissos hoje"
                      value={todayEvents.length.toString().padStart(2, "0")}
                      tone="blue"
                      subtitle={
                        todayEvents.some((t) => t.ongoing)
                          ? "Há encontros em andamento"
                          : todayEvents.length
                            ? `Próximo: ${[...todayEvents].sort((a, b) => a.time.localeCompare(b.time))[0].time || "a definir"}`
                            : "Seu dia está livre por aqui"
                      }
                      onClick={() => changeView("agenda")}
                    />
                  </section>
                  <section className="training-banner">
                    <div className="training-icon">
                      <GraduationCap size={23} />
                    </div>
                    <div>
                      <strong>
                        {nextTraining
                          ? `${appointmentOccursOn(nextTraining, today) ? "Hoje" : "Próximo encontro"} · ${appointmentLabel(nextTraining)}`
                          : "Treinamento/Atendimento em um espaço próprio"}
                      </strong>
                      <span>
                        {nextTraining ? (
                          <>
                            {nextTraining.title}
                            <i />
                            {nextTraining.entity}
                            <i />
                            {appointmentRange(nextTraining)}
                          </>
                        ) : (
                          "Organize capacitações e salas de atendimento por período."
                        )}
                      </span>
                    </div>
                    <button onClick={() => changeView("trainings")}>
                      Ver agenda <ArrowRight size={16} />
                    </button>
                  </section>
                  <div className="view-toolbar">
                    <ViewSwitcher value={boardView} onChange={setBoardView} />
                  </div>
                  <div className="filters-bar">
                    <label className="search-input">
                      <Search size={17} />
                      <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Buscar uma atividade..."
                        aria-label="Buscar uma atividade"
                      />
                      {search && (
                        <button
                          onClick={() => setSearch("")}
                          aria-label="Limpar busca"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </label>
                    <div className="filter-actions">
                      <select
                        aria-label="Filtrar por módulo"
                        value={module}
                        onChange={(e) => setModule(e.target.value)}
                      >
                        <option value="">Todos os módulos</option>
                        {[
                          ...new Set([
                            ...MODULES,
                            ...project.tasks
                              .map((t) => t.module)
                              .filter(Boolean),
                          ]),
                        ].map((m) => (
                          <option key={m}>{m}</option>
                        ))}
                      </select>
                      <button
                        className={`button filter-button ${showFilters ? "selected" : ""}`}
                        onClick={() => setShowFilters(!showFilters)}
                      >
                        <SlidersHorizontal size={15} /> Filtros
                        {(priority || typeFilter) && (
                          <span className="filter-dot" />
                        )}
                      </button>
                      <select
                        aria-label="Ordenar cartões"
                        value={taskOrder}
                        onChange={(e) => {
                          captureCards();
                          setData((d) => ({
                            ...d,
                            boardOrders: {
                              ...d.boardOrders,
                              [project.id]: e.target.value,
                            },
                          }));
                        }}
                      >
                        <option value="manual">Ordem de criação</option>
                        <option value="priority">
                          Prioridade: alta primeiro
                        </option>
                      </select>
                      {["kanban", "list"].includes(boardView) && (
                        <button
                          className="button secondary"
                          onClick={() =>
                            setCollapsedStages(
                              collapsedStages.length === STAGES.length
                                ? []
                                : STAGES.map((s) => s.id),
                            )
                          }
                        >
                          {collapsedStages.length === STAGES.length
                            ? "Expandir fases"
                            : "Recolher fases"}
                        </button>
                      )}
                      <span className="avatar-stack">
                        <span>VC</span>
                        <span>
                          <Users size={13} />
                        </span>
                      </span>
                    </div>
                  </div>
                  {showFilters && (
                    <div className="expanded-filters">
                      <span>Categoria</span>
                      <select
                        value={typeFilter}
                        onChange={(e) => setTypeFilter(e.target.value)}
                        aria-label="Filtrar por categoria"
                      >
                        <option value="">Todos</option>
                        {Object.entries(CATEGORIES).map(([id, label]) => (
                          <option key={id} value={id}>
                            {label}
                          </option>
                        ))}
                      </select>
                      <span>Prioridade</span>
                      <select
                        value={priority}
                        onChange={(e) => setPriority(e.target.value)}
                        aria-label="Filtrar por prioridade"
                      >
                        <option value="">Todas</option>
                        <option value="alta">Alta</option>
                        <option value="normal">Normal</option>
                        <option value="baixa">Baixa</option>
                      </select>
                      <button
                        onClick={() => {
                          setPriority("");
                          setModule("");
                          setSearch("");
                          setTypeFilter("");
                        }}
                      >
                        Limpar filtros
                      </button>
                      <small>{tasks.length} atividades encontradas</small>
                    </div>
                  )}
                  {boardView === "kanban" && (
                    <>
                      <BoardScroller
                        columns={STAGES.map((s) =>
                          collapsedStages.includes(s.id)
                            ? "minmax(215px, .65fr)"
                            : "minmax(255px, 1fr)",
                        ).join(" ")}
                      >
                        {STAGES.map((stage) => {
                          const items = tasks.filter(
                            (t) => t.stage === stage.id,
                          );
                          const Icon = stageIcons[stage.id];
                          const collapsed = collapsedStages.includes(stage.id);
                          return (
                            <div
                              id={`column-${stage.id}`}
                              className={`kanban-column column-${stage.id} ${collapsed ? "collapsed-column" : ""} ${dragging && dropTarget === stage.id ? "drop-target" : ""}`}
                              key={stage.id}
                              onDragOver={(e) => {
                                e.preventDefault();
                                e.dataTransfer.dropEffect = "move";
                                setDropTarget(stage.id);
                              }}
                              onDrop={(e) => {
                                e.preventDefault();
                                const id = e.dataTransfer.getData("text/plain");
                                if (project.tasks.some((t) => t.id === id))
                                  move(id, stage.id);
                                setDragging(null);
                                setDropTarget(null);
                              }}
                            >
                              <div className="column-heading">
                                <h3>
                                  <button
                                    className="column-collapse column-title-toggle"
                                    aria-label={`${collapsed ? "Expandir" : "Recolher"} fase ${stage.label}`}
                                    aria-expanded={!collapsed}
                                    onClick={() =>
                                      setCollapsedStages(
                                        collapsed
                                          ? collapsedStages.filter(
                                              (s) => s !== stage.id,
                                            )
                                          : [...collapsedStages, stage.id],
                                      )
                                    }
                                  >
                                    <span
                                      className="stage-dot"
                                      style={{ background: stage.color }}
                                    />
                                    <span>{stage.label}</span>
                                    <span className="column-count">
                                      {items.length}
                                    </span>
                                    {collapsed ? (
                                      <ChevronRight size={16} />
                                    ) : (
                                      <ChevronDown size={16} />
                                    )}
                                  </button>
                                </h3>
                                <button
                                  disabled={!canEdit}
                                  aria-label={`Adicionar em ${stage.label}`}
                                  onClick={() => newTask(stage.id)}
                                >
                                  <Plus size={16} />
                                </button>
                              </div>
                              {!collapsed && (
                                <p className="column-subtitle">
                                  {
                                    {
                                      todo: "Identificado, ainda não iniciado",
                                      progress: "Trabalho sendo executado",
                                      waiting:
                                        "Dependências da IPM ou da equipe",
                                      homologacao:
                                        "Correções e dados para validar",
                                      concluido: "Validado e com evidência",
                                    }[stage.id]
                                  }
                                </p>
                              )}
                              {collapsed ? (
                                <div className="column-overview">
                                  <span>Resumo da fase</span>
                                  <dl>
                                    <div>
                                      <dt>Atividades</dt>
                                      <dd>{items.length}</dd>
                                    </div>
                                    <div>
                                      <dt>Prioridade alta</dt>
                                      <dd>
                                        {
                                          items.filter(
                                            (t) => t.priority === "alta",
                                          ).length
                                        }
                                      </dd>
                                    </div>
                                    <div>
                                      <dt>
                                        {stage.id === "concluido"
                                          ? "Validadas"
                                          : "Em atraso"}
                                      </dt>
                                      <dd>
                                        {
                                          items.filter((t) =>
                                            stage.id === "concluido"
                                              ? isValidated(t)
                                              : t.date && t.date < today,
                                          ).length
                                        }
                                      </dd>
                                    </div>
                                    <div>
                                      <dt>Chamados</dt>
                                      <dd>
                                        {
                                          items.filter(
                                            (t) => t.type === "chamado",
                                          ).length
                                        }
                                      </dd>
                                    </div>
                                  </dl>
                                </div>
                              ) : (
                                <div
                                  className="column-cards"
                                  role="region"
                                  aria-label={`Cartões em ${stage.label}`}
                                  tabIndex={0}
                                >
                                  {items.map((t) => (
                                    <TaskCard
                                      readOnly={!canEdit}
                                      task={t}
                                      key={t.id}
                                      dragging={dragging === t.id}
                                      onDrag={() => setDragging(t.id)}
                                      onDragEnd={() => {
                                        setDragging(null);
                                        setDropTarget(null);
                                      }}
                                      onOpen={() =>
                                        setModal({
                                          type: "task",
                                          task: t,
                                          isNew: false,
                                        })
                                      }
                                      onContextMenu={(e) => openCardMenu(e, t)}
                                    />
                                  ))}
                                  {items.length === 0 && (
                                    <div className="empty-column">
                                      <Icon size={23} />
                                      <span>
                                        {search || module || priority
                                          ? "Nenhuma atividade com esses filtros"
                                          : "Espaço para os próximos passos"}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              )}
                              {!collapsed && (
                                <button
                                  disabled={!canEdit}
                                  className="add-card"
                                  onClick={() => newTask(stage.id)}
                                >
                                  <Plus size={15} /> Adicionar atividade
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </BoardScroller>
                    </>
                  )}
                  {boardView === "list" && (
                    <ActivitiesList
                      readOnly={!canEdit}
                      onContextMenu={openCardMenu}
                      tasks={tasks}
                      collapsedStages={collapsedStages}
                      onToggleStage={(id) =>
                        setCollapsedStages(
                          collapsedStages.includes(id)
                            ? collapsedStages.filter((s) => s !== id)
                            : [...collapsedStages, id],
                        )
                      }
                      onOpen={(task) =>
                        setModal({ type: "task", task, isNew: false })
                      }
                      onMove={move}
                      onAdd={newTask}
                    />
                  )}
                  {boardView === "table" && (
                    <ActivitiesTable
                      readOnly={!canEdit}
                      onContextMenu={openCardMenu}
                      priorityOrder={taskOrder === "priority"}
                      tasks={tasks}
                      onOpen={(task) =>
                        setModal({ type: "task", task, isNew: false })
                      }
                      onMove={move}
                    />
                  )}
                  {boardView === "calendar" && (
                    <ActivitiesCalendar
                      readOnly={!canEdit}
                      onContextMenu={openCardMenu}
                      tasks={tasks}
                      trainings={project.trainings}
                      onOpen={(task) =>
                        setModal({ type: "task", task, isNew: false })
                      }
                      onTraining={(training) =>
                        setModal({ type: "training", training, isNew: false })
                      }
                      onAdd={newTask}
                    />
                  )}
                  <div className="board-footer">
                    <span>
                      <Grip size={14} /> Abra uma atividade para ver o contexto.
                      No quadro, arraste para mudar a situação.
                    </span>
                    <button onClick={() => setModal({ type: "help" })}>
                      Como funciona <CircleHelp size={13} />
                    </button>
                  </div>
                </>
              )}
              {view === "homologation" && (
                <Homologation
                  readOnly={!canEdit}
                  key={project.id}
                  project={project}
                  Modal={Modal}
                  Field={Field}
                  onUpdate={updateProject}
                  onEditing={setHomologationEditing}
                  onError={setToast}
                  onTask={(id) => {
                    const task = project.tasks.find((t) => t.id === id);
                    if (task) setModal({ type: "task", task, isNew: false });
                  }}
                  onEditProject={() =>
                    setModal({ type: "project", isNew: false })
                  }
                />
              )}
              {view === "agenda" && (
                <Agenda
                  readOnly={!canEdit}
                  project={project}
                  onTask={(task) =>
                    setModal({ type: "task", task, isNew: false })
                  }
                  onTraining={(training) =>
                    setModal({ type: "training", training, isNew: false })
                  }
                  onAdd={() => newTask("todo", today)}
                />
              )}
              {view === "trainings" && (
                <Trainings
                  readOnly={!canEdit}
                  project={project}
                  onOpen={(training) =>
                    setModal({ type: "training", training, isNew: false })
                  }
                  onAdd={() => setModal({ type: "training", isNew: true })}
                />
              )}
              {view === "history" && (
                <History
                  project={project}
                  onOpen={(task) =>
                    setModal({ type: "task", task, isNew: false })
                  }
                />
              )}
              {view === "details" && (
                <ProjectDetails
                  readOnly={!canEdit}
                  project={project}
                  onEdit={() => setModal({ type: "project", isNew: false })}
                />
              )}
            </>
          )}
          <footer className="page-footer">
            <span>Implanta · v{appVersion}</span>
            <span>
              <ShieldCheck size={13} />{" "}
              {team.online
                ? view === "personalAgenda"
                  ? "Agenda pessoal salva na sua conta"
                  : "Dados salvos no banco da equipe"
                : "Dados salvos neste navegador"}
            </span>
          </footer>
        </div>
      </main>
      <input
        type="file"
        accept="application/json,.json"
        ref={fileRef}
        hidden
        onChange={importData}
      />
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          <span>{toast}</span>
          <button onClick={() => setToast("")} aria-label="Fechar notificação">
            <X size={16} />
          </button>
        </div>
      )}
      {["closeProject", "deleteProject", "clearWorkspace"].includes(
        modal?.type,
      ) && (
        <ProjectActionModal
          Modal={Modal}
          Field={Field}
          action={modal.type}
          project={modal.project}
          onClose={() => setModal(null)}
          onExport={exportData}
          onConfirm={async () => {
            const action = modal.type;
            if (
              await setData((d) =>
                action === "closeProject"
                  ? setProjectClosed(d, modal.project.id, true)
                  : action === "deleteProject"
                    ? deleteProject(d, modal.project.id)
                    : clearWorkspace(d),
              )
            ) {
              setModal(null);
              changeView("municipalities");
              setProjectFilter("active");
              setToast(
                action === "closeProject"
                  ? "Projeto encerrado. Histórico preservado."
                  : action === "deleteProject"
                    ? "Projeto excluído."
                    : "Workspace limpo.",
              );
            }
          }}
        />
      )}
      {modal?.type === "personalEvent" && (
        <PersonalEventModal
          Modal={Modal}
          event={modal.event}
          date={modal.date}
          saving={saving}
          onClose={() => setModal(null)}
          onSave={async (event) => {
            if (
              await setData((current) => ({
                ...current,
                personalAgenda: [
                  ...(current.personalAgenda || []).filter(
                    (entry) => entry.id !== event.id,
                  ),
                  event,
                ],
              }))
            ) {
              setModal(null);
              setToast("Compromisso salvo na sua agenda geral.");
            }
          }}
          onDelete={async (id) => {
            if (
              await setData((current) => ({
                ...current,
                personalAgenda: (current.personalAgenda || []).filter(
                  (entry) => entry.id !== id,
                ),
              }))
            ) {
              setModal(null);
              setToast("Compromisso excluído da sua agenda geral.");
            }
          }}
        />
      )}
      {modal?.type === "team" && (
        <TeamSettings
          Modal={Modal}
          onClose={() => setModal(null)}
          projects={data.projects}
          activeProjectId={projectId}
        />
      )}
      {saving && (
        <div className="team-saving" role="status">
          <LoaderCircle size={17} className="spin" /> Salvando no banco…
        </div>
      )}
      {modal?.type === "install" && (
        <InstallModal Modal={Modal} pwa={pwa} onClose={() => setModal(null)} />
      )}
      {modal?.type === "profile" && (
        <ProfileSettings
          Modal={Modal}
          appearance={data.appearance}
          email={team.profile?.email}
          onSignOut={team.online ? team.signOut : undefined}
          onClose={() => setModal(null)}
          onSave={async (appearance) => {
            if (await setData((d) => ({ ...d, appearance }))) {
              setModal(null);
              setToast("Aparência salva.");
            }
          }}
        />
      )}
      {projectMenu &&
        !modal &&
        data.projects.some((p) => p.id === projectMenu.projectId) &&
        (() => {
          const selected = data.projects.find(
            (p) => p.id === projectMenu.projectId,
          );
          return (
            <ProjectMenu
              anchor={projectMenu}
              project={selected}
              canManage={canManage}
              canEdit={!team.online || team.canEdit(selected.id)}
              onClose={() => setProjectMenu(null)}
              onArea={async (area) => {
                if (await selectProject(selected.id)) changeView(area);
              }}
              onEdit={async () => {
                if (await selectProject(selected.id)) {
                  changeView("details");
                  setModal({ type: "project", isNew: false });
                }
              }}
              onCloseProject={() =>
                setModal({ type: "closeProject", project: selected })
              }
              onDelete={() =>
                setModal({ type: "deleteProject", project: selected })
              }
              onReopen={async () => {
                if (
                  await setData((d) => setProjectClosed(d, selected.id, false))
                ) {
                  setProjectFilter("active");
                  setToast("Projeto reaberto.");
                }
              }}
            />
          );
        })()}
      {cardMenu &&
        projectTasks.some((t) => t.id === cardMenu.taskId) &&
        !modal && (
          <CardMenu
            readOnly={!canEdit}
            anchor={cardMenu}
            task={projectTasks.find((t) => t.id === cardMenu.taskId)}
            onClose={() => setCardMenu(null)}
            onEdit={(task) => setModal({ type: "task", task, isNew: false })}
            onMove={move}
            onPriority={(task, priority) =>
              saveTask({ ...task, priority }, false)
            }
          />
        )}
      {modal?.type === "task" && (
        <TaskModal
          readOnly={!canEdit}
          task={modal.task}
          isNew={modal.isNew}
          entities={project.entities}
          onClose={() => setModal(null)}
          onSave={(t) => saveTask(t, modal.isNew)}
          onDelete={async () => {
            if (
              await updateProject((p) => ({
                ...p,
                tasks: p.tasks.filter((t) => t.id !== modal.task.id),
                logs: [
                  {
                    id: uid(),
                    title: modal.task.title,
                    action: "excluída",
                    at: new Date().toISOString(),
                  },
                  ...p.logs,
                ],
              }))
            ) {
              setModal(null);
              setToast("Atividade excluída. Registro mantido no histórico.");
            }
          }}
        />
      )}
      {modal?.type === "project" && (
        <ProjectModal
          readOnly={modal.isNew ? !canManage : !canEdit}
          project={modal.isNew ? null : project}
          onClose={() => setModal(null)}
          onSave={async (p) => {
            const saved = modal.isNew
              ? await setData((d) => ({
                  ...d,
                  selectedId: p.id,
                  projects: [...d.projects, p],
                }))
              : await updateProject(updateProjectEntities(project, p));
            if (saved) {
              if (modal.isNew) setView("board");
              setModal(null);
              setToast("Município salvo.");
            }
          }}
        />
      )}
      {modal?.type === "training" && (
        <TrainingModal
          readOnly={!canEdit}
          training={modal.training}
          entities={project.entities}
          onClose={() => setModal(null)}
          onSave={async (t) => {
            if (
              await updateProject((p) => ({
                ...p,
                trainings: modal.isNew
                  ? [...p.trainings, t]
                  : p.trainings.map((old) => (old.id === t.id ? t : old)),
                logs: [
                  {
                    id: uid(),
                    title: `${appointmentLabel(t)}: ${t.title}`,
                    appointment: structuredClone(t),
                    action:
                      t.status === "Realizado"
                        ? "realizado"
                        : modal.isNew
                          ? "agendado"
                          : "atualizado",
                    at: new Date().toISOString(),
                  },
                  ...p.logs,
                ],
              }))
            ) {
              setModal(null);
              setToast("Treinamento/atendimento salvo.");
            }
          }}
          onDelete={async () => {
            if (
              await updateProject((p) => ({
                ...p,
                trainings: p.trainings.filter(
                  (t) => t.id !== modal.training.id,
                ),
                logs: [
                  {
                    id: uid(),
                    title: `${appointmentLabel(modal.training)}: ${modal.training.title}`,
                    appointment: structuredClone(modal.training),
                    action: "excluído",
                    at: new Date().toISOString(),
                  },
                  ...p.logs,
                ],
              }))
            )
              setModal(null);
          }}
        />
      )}
      {modal?.type === "backup" && (
        <Modal
          title="Seus dados, sob seu controle"
          subtitle="Backup de todos os municípios e atividades."
          onClose={() => setModal(null)}
        >
          <div className="info-box">
            <ShieldCheck size={22} />
            <p>
              {team.online
                ? "Os dados ficam no banco da equipe e são compartilhados conforme as permissões de cada projeto. Você também pode exportar um backup."
                : "Os dados ficam neste navegador. Para usar em outro computador ou evitar perda ao limpar o navegador, exporte um backup."}{" "}
              A exportação comum omite CPF e anexos e mascara padrões de CPF em
              textos. Contatos e outros dados pessoais ainda exigem revisão
              antes de compartilhar.
            </p>
          </div>
          <div className="backup-options">
            <button onClick={exportData}>
              <Download size={24} />
              <strong>Exportar backup</strong>
              <span>JSON sem CPF e sem anexos</span>
              <ArrowUpRight size={17} />
            </button>
            {team.online && team.profile?.admin && (
              <button onClick={() => exportData(true)}>
                <ShieldCheck size={24} />
                <strong>Backup completo restrito</strong>
                <span>Inclui CPF e anexos · guardar em local protegido</span>
              </button>
            )}
            <button
              disabled={!canManage}
              onClick={() => fileRef.current.click()}
            >
              <Upload size={24} />
              <strong>Restaurar backup</strong>
              <span>Importar um arquivo do Implanta</span>
              <ArrowUpRight size={17} />
            </button>
          </div>
          <button
            className="text-danger workspace-clear-button"
            disabled={team.online || !data.projects.length}
            onClick={() => setModal({ type: "clearWorkspace" })}
          >
            <Trash2 size={16} />
            Limpar workspace
          </button>
          <p className="muted modal-note">
            {team.online
              ? "O backup inclui os projetos aos quais você tem acesso. A limpeza local fica desativada no banco compartilhado."
              : "Conecte sua equipe para usar login e banco online. Os dados locais continuam neste aparelho."}
          </p>
        </Modal>
      )}
      {modal?.type === "import" && (
        <Modal
          title="Restaurar este backup?"
          subtitle={`${modal.data.projects.length} município(s) encontrado(s).`}
          onClose={() => setModal(null)}
        >
          <p className="dialog-copy">
            {team.online
              ? "A importação cria ou atualiza estes projetos no banco da equipe, sem excluir os outros. Exporte um backup antes se precisar preservar a versão anterior."
              : "A restauração substitui os dados atuais deste navegador. Exporte os dados atuais antes de continuar, caso queira preservá-los."}
          </p>
          <div className="modal-actions">
            <button className="button secondary" onClick={exportData}>
              <Download size={16} /> Exportar atuais
            </button>
            <button
              className="button primary"
              onClick={async () => {
                const imported = team.online
                  ? {
                      ...data,
                      ...modal.data,
                      projects: [
                        ...data.projects.filter(
                          (p) =>
                            !modal.data.projects.some((n) => n.id === p.id),
                        ),
                        ...modal.data.projects,
                      ],
                    }
                  : modal.data;
                const restored =
                  modal.data.personalAgenda === undefined && data.personalAgenda
                    ? { ...imported, personalAgenda: data.personalAgenda }
                    : imported;
                if (
                  await setData(preserveOmittedData(restored, data), {
                    import: true,
                  })
                ) {
                  setModal(null);
                  changeView("municipalities");
                  setToast("Backup restaurado.");
                }
              }}
            >
              Restaurar dados
            </button>
          </div>
        </Modal>
      )}
      {modal?.type === "help" && (
        <Modal
          title="Um fluxo que acompanha seu trabalho"
          subtitle="Organização sem etapas obrigatórias."
          onClose={() => setModal(null)}
        >
          <div className="help-steps">
            {[
              [
                "Uma tela inicial para todos os projetos",
                "Abra um município ou crie uma implantação. Dentro do projeto, escolha Quadro, Lista, Tabela ou Calendário; os dados são os mesmos.",
              ],
              [
                "Treinamento e atendimento em separado",
                "Cadastre capacitações e salas de atendimento remoto com início e término, inclusive em vários dias. Aparecem na Minha agenda e no Calendário durante todo o período.",
              ],
              [
                "Situação e tipo separados",
                "Mova entre A fazer, Em andamento, Aguardando retorno, Em homologação e Concluídos. Módulos e chamados são etiquetas; prazos ficam no cartão.",
              ],
              [
                "Passagem e validação",
                "Descreva problema, impacto, próxima ação, quem age agora, evidências e critério de conclusão. Para concluir, registre quem validou, quando e com qual evidência. O checklist sozinho não conclui o trabalho.",
              ],
            ].map(([title, text], i) => (
              <div key={title}>
                <span>{i + 1}</span>
                <section>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </section>
              </div>
            ))}
          </div>
          <button
            className="button primary full-button"
            onClick={() => setModal(null)}
          >
            Vamos avançar <ArrowRight size={16} />
          </button>
        </Modal>
      )}
    </div>
  );
}

function NavItem({ icon: Icon, text, active, badge, onClick, disabled }) {
  return (
    <button
      disabled={disabled}
      className={`nav-item ${active ? "active" : ""}`}
      onClick={onClick}
    >
      <Icon size={19} />
      <span>{text}</span>
      {badge && <b>{badge}</b>}
    </button>
  );
}
function StatCard({
  icon: Icon,
  label,
  value,
  tone,
  subtitle,
  progress,
  onClick,
}) {
  return (
    <div
      className={`stat-card ${onClick ? "clickable" : ""}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => {
        if (onClick && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <div className="stat-label">
        <span>{label}</span>
        <span className={`stat-icon ${tone}`}>
          <Icon size={18} />
        </span>
      </div>
      <div className="stat-value">
        {value}
        {onClick && <ArrowUpRight size={17} />}
      </div>
      {progress !== undefined && (
        <div className="progress-track">
          <i style={{ width: `${progress}%` }} />
        </div>
      )}
      <p>{subtitle}</p>
    </div>
  );
}
function TaskCard({
  task,
  onOpen,
  onDrag,
  onDragEnd,
  dragging,
  onContextMenu,
  readOnly = false,
}) {
  const checklist = checklistProgress(task);
  const overdue =
    task.date && task.date < localDate() && task.stage !== "concluido";
  return (
    <div className="task-card-shell">
      <button
        className={`task-card ${dragging ? "dragging" : ""} ${task.stage === "concluido" ? "completed-card" : ""}`}
        data-task-id={task.id}
        draggable={!readOnly}
        onDragStart={(e) => {
          e.dataTransfer.setData("text/plain", task.id);
          e.dataTransfer.effectAllowed = "move";
          onDrag();
        }}
        onDragEnd={onDragEnd}
        onClick={onOpen}
        onContextMenu={onContextMenu}
        onKeyDown={(e) => {
          if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10"))
            onContextMenu(e);
        }}
      >
        <div className="task-tag-row">
          <ModuleBadge task={task} />
          {task.stage === "concluido" && (
            <Check className="done-icon" size={15} />
          )}
        </div>
        <h4>{cardSummary(task)}</h4>
        <span className="ticket-type-label">
          {CATEGORIES[task.type] || "Tarefa"}
        </span>
        {task.nextAction ? (
          <p className="card-next-action">
            <ArrowRight size={12} />
            <span>{task.nextAction}</span>
          </p>
        ) : (
          task.stage !== "concluido" && (
            <p className="card-next-action context-missing">
              Próxima ação não definida
            </p>
          )
        )}
        {task.stage === "waiting" && (
          <span className="blocked-by">
            Aguardando: {task.blockedBy || "a definir"}
          </span>
        )}
        <ValidationBadge task={task} />
        {task.type === "chamado" && (
          <span className="ticket-status">
            <span />
            {task.ticketStatus || "Aguardando retorno"}
          </span>
        )}
        {checklist.total > 0 && (
          <div className="task-checklist">
            <div>
              <ListChecks size={14} />
              <span>
                {checklist.done}/{checklist.total}
              </span>
              <span>
                {task.checklists.length}{" "}
                {task.checklists.length === 1 ? "entidade" : "entidades"}
              </span>
            </div>
            <div className="mini-progress">
              <i
                style={{
                  width: `${(checklist.done / checklist.total) * 100}%`,
                }}
              />
            </div>
          </div>
        )}
        <div className="task-bottom">
          <span className={`task-date ${overdue ? "overdue" : ""}`}>
            {task.stage === "concluido" ? (
              <>
                <CheckCheck size={13} />
                {formatDate(task.completedAt)}
              </>
            ) : task.date ? (
              <>
                <CalendarDays size={13} />
                {formatDate(task.date)}
                {task.time && ` · ${task.time}`}
              </>
            ) : (
              <>
                <Clock3 size={13} />
                Sem prazo
              </>
            )}
          </span>
          <span className="card-owner">{task.owner || "Sem responsável"}</span>
        </div>
      </button>
      <button
        className="card-shortcuts icon-button"
        aria-label="Atalhos da atividade"
        aria-haspopup="menu"
        onClick={onContextMenu}
      >
        <MoreHorizontal size={17} />
      </button>
    </div>
  );
}
function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
  headerAction,
}) {
  const ref = useRef();
  useLayoutEffect(() => {
    const previous = document.activeElement;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const firstField = [
      ...ref.current.querySelectorAll(".modal-body input, .modal-body select"),
    ].find((element) => !element.disabled && element.offsetParent !== null);
    (firstField || ref.current.querySelector("button"))?.focus({
      preventScroll: true,
    });
    const key = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const focusables = [
          ...ref.current.querySelectorAll(
            "button, input, select, textarea, a[href]",
          ),
        ].filter((n) => !n.disabled && n.offsetParent !== null);
        const first = focusables[0],
          last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = oldOverflow;
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        ref={ref}
        className={`modal ${wide ? "wide-modal" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <header className="modal-header">
          <div>
            <h2 id="modal-title">{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          {headerAction}
          <button className="icon-button" aria-label="Fechar" onClick={onClose}>
            <X size={21} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </section>
    </div>
  );
}
function Field({ label, children, hint, full }) {
  const id = useId();
  return (
    <div className={`field ${full ? "full-field" : ""}`}>
      <label htmlFor={id}>{label}</label>
      {React.Children.map(children, (child, index) =>
        index === 0 && React.isValidElement(child)
          ? React.cloneElement(child, {
              id,
              "aria-describedby": hint ? `${id}-hint` : undefined,
            })
          : child,
      )}
      {hint && <small id={`${id}-hint`}>{hint}</small>}
    </div>
  );
}
function TaskModal({
  readOnly = false,
  task,
  isNew,
  entities,
  onClose,
  onSave,
  onDelete,
}) {
  const formId = useId();
  const { actor } = useTeam();
  const [draft, setDraft] = useState(() => structuredClone(task));
  const [entity, setEntity] = useState(entities[0] || "");
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [checkText, setCheckText] = useState({});
  const [uploading, setUploading] = useState(false);
  const patch = (key, value) => setDraft((d) => ({ ...d, [key]: value }));
  const addChecklist = () => {
    const name = entity.trim();
    if (!name || draft.checklists.some((c) => c.entity === name)) return;
    patch("checklists", [
      ...draft.checklists,
      {
        entity: name,
        items: [
          "Validar cadastros e dados migrados",
          "Executar rotina com o responsável",
          "Confirmar aceite da entidade",
        ].map((text) => ({ id: uid(), text, done: false })),
      },
    ]);
  };
  const updateList = (index, callback) =>
    setDraft((d) => ({
      ...d,
      checklists: d.checklists.map((c, i) => (i === index ? callback(c) : c)),
    }));
  return (
    <Modal
      title={isNew ? "Nova atividade" : "Detalhes da atividade"}
      subtitle="Deixe o contexto pronto para quem vai continuar o trabalho."
      onClose={onClose}
      headerAction={
        <button
          type="submit"
          form={formId}
          disabled={uploading || readOnly}
          className="button primary task-save-top"
          aria-label={
            isNew ? "Criar atividade no topo" : "Salvar atividade no topo"
          }
        >
          <Check size={16} /> {isNew ? "Criar" : "Salvar"}
        </button>
      }
      wide
    >
      <form
        id={formId}
        onSubmit={(e) => {
          e.preventDefault();
          const activity = { ...draft, title: draft.title.trim() };
          if (
            actor &&
            draft.stage === "concluido" &&
            (task.stage !== "concluido" || !draft.validation?.by)
          )
            activity.validation = {
              ...draft.validation,
              by: actor.name,
              actorId: actor.id,
              at: new Date().toISOString(),
            };
          onSave(activity);
        }}
      >
        <fieldset disabled={readOnly} className="readonly-fields">
          <div className="form-grid">
            <Field label="Título da atividade *" full>
              <input
                required
                pattern=".*[^ ].*"
                maxLength={180}
                value={draft.title}
                onChange={(e) => patch("title", e.target.value)}
                placeholder="O que precisa ser feito?"
              />
            </Field>
            <Field label="Situação">
              <select
                value={draft.stage}
                onChange={(e) => patch("stage", e.target.value)}
              >
                {STAGES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Módulo">
              <select
                value={draft.module}
                onChange={(e) => patch("module", e.target.value)}
              >
                <option value="">Selecione o módulo</option>
                {draft.module && !MODULES.includes(draft.module) && (
                  <option>{draft.module}</option>
                )}
                {MODULES.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </Field>
            <Field label="Responsável">
              <input
                value={draft.owner}
                onChange={(e) => patch("owner", e.target.value)}
                placeholder="Nome do responsável"
              />
            </Field>
            <Field label="Prioridade">
              <select
                value={draft.priority}
                onChange={(e) => patch("priority", e.target.value)}
              >
                {Object.entries(priorityLabel).map(([id, text]) => (
                  <option key={id} value={id}>
                    {text}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Prazo / data">
              <input
                type="date"
                value={draft.date}
                onChange={(e) => patch("date", e.target.value)}
              />
            </Field>
            <Field label="Horário">
              <input
                type="time"
                value={draft.time}
                onChange={(e) => patch("time", e.target.value)}
              />
            </Field>
            <Field label="Categoria">
              <select
                value={draft.type}
                onChange={(e) => patch("type", e.target.value)}
              >
                {Object.entries(CATEGORIES).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            {draft.stage === "waiting" && (
              <Field label="Aguardando retorno de">
                <input
                  list="dependencies"
                  value={draft.blockedBy}
                  onChange={(e) => patch("blockedBy", e.target.value)}
                  placeholder="IPM, prefeitura ou colega"
                />
                <datalist id="dependencies">
                  <option>IPM</option>
                  <option>Prefeitura</option>
                  <option>Equipe interna</option>
                </datalist>
              </Field>
            )}
            {draft.type === "chamado" && (
              <Field label="Número do chamado">
                <input
                  value={draft.ticket}
                  onChange={(e) => patch("ticket", e.target.value)}
                  placeholder="Ex.: 872797"
                />
              </Field>
            )}
            {draft.type === "chamado" && (
              <Field label="Situação na fábrica">
                <select
                  value={draft.ticketStatus || "Aguardando retorno"}
                  onChange={(e) => patch("ticketStatus", e.target.value)}
                >
                  {[
                    "Não informado",
                    "Aguardando retorno",
                    "Em análise",
                    "Em desenvolvimento",
                    "Disponível para validar",
                  ].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="Descrição / notas adicionais" full>
              <textarea
                rows="3"
                value={draft.description}
                onChange={(e) => patch("description", e.target.value)}
                placeholder="Contexto, resultado esperado ou informações úteis..."
              />
            </Field>
          </div>
          <div className="checklist-section">
            <div className="section-heading">
              <h3>
                <ListChecks size={18} /> Checklists por entidade
              </h3>
              <span>Sem limite de entidades</span>
            </div>
            <div className="checklist-add">
              <input
                list="project-entities"
                value={entity}
                onChange={(e) => setEntity(e.target.value)}
                aria-label="Entidade do checklist"
                placeholder="Selecione ou escreva uma entidade"
              />
              <datalist id="project-entities">
                {entities.map((e) => (
                  <option key={e} value={e} />
                ))}
              </datalist>
              <button
                type="button"
                className="button secondary"
                onClick={addChecklist}
              >
                <Plus size={15} /> Adicionar
              </button>
            </div>
            {draft.checklists.map((c, ci) => (
              <div className="entity-checklist" key={c.entity}>
                <header>
                  <Building2 size={16} />
                  <strong>{c.entity}</strong>
                  <span>
                    {c.items.filter((i) => i.done).length}/{c.items.length}
                  </span>
                  <button
                    type="button"
                    aria-label={`Remover checklist de ${c.entity}`}
                    onClick={() =>
                      patch(
                        "checklists",
                        draft.checklists.filter((_, i) => i !== ci),
                      )
                    }
                  >
                    <X size={15} />
                  </button>
                </header>
                {c.items.map((item) => (
                  <div className="checklist-item" key={item.id}>
                    <label>
                      <input
                        type="checkbox"
                        checked={item.done}
                        onChange={(e) =>
                          updateList(ci, (list) => ({
                            ...list,
                            items: list.items.map((i) =>
                              i.id === item.id
                                ? { ...i, done: e.target.checked }
                                : i,
                            ),
                          }))
                        }
                      />
                      <span className={item.done ? "checked" : ""}>
                        {item.text}
                      </span>
                    </label>
                    <button
                      type="button"
                      aria-label="Remover item"
                      onClick={() =>
                        updateList(ci, (list) => ({
                          ...list,
                          items: list.items.filter((i) => i.id !== item.id),
                        }))
                      }
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}
                <div className="new-checklist-item">
                  <input
                    aria-label={`Novo item em ${c.entity}`}
                    placeholder="Adicionar item ao checklist..."
                    value={checkText[ci] || ""}
                    onChange={(e) =>
                      setCheckText((v) => ({ ...v, [ci]: e.target.value }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (checkText[ci]?.trim()) {
                          updateList(ci, (list) => ({
                            ...list,
                            items: [
                              ...list.items,
                              {
                                id: uid(),
                                text: checkText[ci].trim(),
                                done: false,
                              },
                            ],
                          }));
                          setCheckText((v) => ({ ...v, [ci]: "" }));
                        }
                      }
                    }}
                  />
                  <button
                    type="button"
                    aria-label="Adicionar item"
                    onClick={() => {
                      if (checkText[ci]?.trim()) {
                        updateList(ci, (list) => ({
                          ...list,
                          items: [
                            ...list.items,
                            {
                              id: uid(),
                              text: checkText[ci].trim(),
                              done: false,
                            },
                          ],
                        }));
                        setCheckText((v) => ({ ...v, [ci]: "" }));
                      }
                    }}
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="executed-work-section">
            <Field label="Atividades executadas" full>
              <textarea
                rows="4"
                value={draft.executedWork || ""}
                onChange={(e) => patch("executedWork", e.target.value)}
                placeholder="Descreva o que foi feito, os resultados e as datas para aproveitar no boletim."
              />
            </Field>
          </div>
          <HandoffFields
            draft={draft}
            patch={patch}
            Field={Field}
            onBusy={setUploading}
          />
          {deleteConfirm && (
            <div className="delete-confirm">
              <span>Excluir esta atividade? O histórico será preservado.</span>
              <button type="button" onClick={onDelete}>
                Sim, excluir
              </button>
              <button type="button" onClick={() => setDeleteConfirm(false)}>
                Cancelar
              </button>
            </div>
          )}
          <div className="modal-actions">
            {!isNew && (
              <button
                type="button"
                className="text-danger"
                onClick={() => setDeleteConfirm(true)}
              >
                <Trash2 size={15} /> Excluir
              </button>
            )}
            <div className="action-spacer" />
            <button
              type="button"
              className="button secondary"
              onClick={onClose}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={uploading || readOnly}
              className="button primary"
            >
              <Check size={16} />
              {isNew ? "Criar atividade" : "Salvar alterações"}
            </button>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
function ProjectModal({ readOnly = false, project, onClose, onSave }) {
  const team = useTeam();
  const cpfAllowed =
    !team.online ||
    !!team.profile?.admin ||
    (project && team.canEdit(project.id));
  const [draft, setDraft] = useState(
    project || {
      id: uid(),
      name: "",
      state: "",
      dream: "",
      fiscal: "",
      cpf: "",
      fiscalEmail: "",
      contact: "",
      contactEmail: "",
      entities: [],
      tasks: [],
      trainings: [],
      logs: [],
      status: "active",
      closedAt: null,
      demo: false,
    },
  );
  const [entitiesText, setEntitiesText] = useState(
    project?.entities.join("\n") || "Prefeitura",
  );
  const patch = (key, value) => setDraft((d) => ({ ...d, [key]: value }));
  return (
    <Modal
      title={project ? "Editar município" : "Novo município"}
      subtitle="Um projeto organizado começa com as informações certas."
      onClose={onClose}
      wide
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave({
            ...draft,
            color: projectColor(draft),
            name: draft.name.trim(),
            entities: [
              ...new Set(
                entitiesText
                  .split("\n")
                  .map((s) => s.trim())
                  .filter(Boolean),
              ),
            ],
          });
        }}
      >
        <fieldset disabled={readOnly} className="readonly-fields">
          <div className="form-grid">
            <Field label="Nome do município *" full>
              <input
                required
                pattern=".*[^ ].*"
                maxLength={80}
                value={draft.name}
                onChange={(e) => patch("name", e.target.value)}
                placeholder="Ex.: Quatro Barras"
              />
            </Field>
            <Field
              label="Cor do projeto"
              full
              hint="Identifica este município no cabeçalho e na troca de projetos. Independente da cor do seu perfil."
            >
              <div className="color-picker">
                <input
                  type="color"
                  aria-label="Cor do projeto"
                  value={projectColor(draft)}
                  onChange={(event) => patch("color", event.target.value)}
                />
                <span>{projectColor(draft).toUpperCase()}</span>
              </div>
              <div className="color-presets" aria-label="Cores do projeto">
                {PROJECT_COLORS.map((color) => (
                  <button
                    type="button"
                    key={color}
                    style={{ background: color }}
                    aria-label={`Cor do projeto ${color}`}
                    aria-pressed={projectColor(draft) === color}
                    onClick={() => patch("color", color)}
                  />
                ))}
              </div>
            </Field>
            <Field label="UF">
              <select
                value={draft.state}
                onChange={(e) => patch("state", e.target.value)}
              >
                <option value="">Selecione</option>
                {"AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO"
                  .split(" ")
                  .map((s) => (
                    <option key={s}>{s}</option>
                  ))}
              </select>
            </Field>
            <Field label="Código no Dream">
              <input
                value={draft.dream}
                onChange={(e) => patch("dream", e.target.value)}
                placeholder="Código do município"
              />
            </Field>
            <div className="form-divider full-field">Fiscal do contrato</div>
            <Field label="Nome do fiscal">
              <input
                value={draft.fiscal}
                onChange={(e) => patch("fiscal", e.target.value)}
              />
            </Field>
            <Field label="CPF do fiscal">
              <input
                value={cpfAllowed ? draft.cpf : ""}
                disabled={!cpfAllowed}
                placeholder={
                  cpfAllowed
                    ? "000.000.000-00"
                    : "Acesso restrito a administradores e editores"
                }
                onChange={(e) => patch("cpf", e.target.value)}
                maxLength={14}
                inputMode="numeric"
              />
            </Field>
            <Field label="E-mail do fiscal" full>
              <input
                type="email"
                value={draft.fiscalEmail}
                onChange={(e) => patch("fiscalEmail", e.target.value)}
              />
            </Field>
            <div className="form-divider full-field">Contato para chamados</div>
            <Field label="Responsável para chamados">
              <input
                value={draft.contact}
                onChange={(e) => patch("contact", e.target.value)}
              />
            </Field>
            <Field label="E-mail do responsável">
              <input
                type="email"
                value={draft.contactEmail}
                onChange={(e) => patch("contactEmail", e.target.value)}
              />
            </Field>
            <Field
              label="Entidades do projeto"
              full
              hint="Uma entidade por linha. Você poderá criar um checklist específico para cada uma."
            >
              <textarea
                rows="3"
                value={entitiesText}
                onChange={(e) => setEntitiesText(e.target.value)}
                placeholder="Prefeitura\nFundo de Saúde\nCâmara Municipal"
              />
            </Field>
          </div>
          <div className="modal-actions">
            <button
              type="button"
              className="button secondary"
              onClick={onClose}
            >
              Cancelar
            </button>
            <button className="button primary" type="submit">
              <Check size={16} /> Salvar município
            </button>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
function TrainingModal({
  readOnly = false,
  training,
  entities,
  onClose,
  onSave,
  onDelete,
}) {
  const [draft, setDraft] = useState(() =>
    training
      ? {
          ...training,
          type: appointmentType(training),
          ...appointmentEnd(training),
          meetingUrl: training.meetingUrl || "",
        }
      : {
          id: uid(),
          type: "treinamento",
          title: "",
          entity: entities[0] || "",
          date: nextDate(1),
          time: "09:00",
          endDate: nextDate(1),
          endTime: "11:00",
          owner: "Você",
          status: "Agendado",
          notes: "",
          meetingUrl: "",
        },
  );
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState("");
  const patch = (key, value) => {
    setError("");
    setDraft((d) => ({ ...d, [key]: value }));
  };
  return (
    <Modal
      title={
        training
          ? "Editar treinamento/atendimento"
          : "Novo treinamento/atendimento"
      }
      subtitle="Capacitações e salas remotas com data e hora de início e término."
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          try {
            const saved = validateAppointment(
              {
                ...draft,
                title: draft.title.trim(),
                meetingUrl: draft.meetingUrl.trim(),
              },
              true,
            );
            onSave({ ...saved, duration: appointmentDuration(saved) });
          } catch (err) {
            setError(err.message);
          }
        }}
      >
        <fieldset disabled={readOnly} className="readonly-fields">
          <div className="form-grid">
            <Field label="Tipo de encontro" full>
              <select
                value={draft.type}
                onChange={(e) => patch("type", e.target.value)}
              >
                {Object.entries(APPOINTMENT_TYPES).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Tema / módulo *" full>
              <input
                required
                pattern=".*[^ ].*"
                value={draft.title}
                onChange={(e) => patch("title", e.target.value)}
                placeholder={
                  draft.type === "atendimento"
                    ? "Ex.: Sala de atendimento de Suprimentos"
                    : "Ex.: Treinamento de Compras e contratos"
                }
              />
            </Field>
            <Field label="Entidade">
              <input
                list="training-entities"
                value={draft.entity}
                onChange={(e) => patch("entity", e.target.value)}
              />
              <datalist id="training-entities">
                {entities.map((e) => (
                  <option key={e}>{e}</option>
                ))}
              </datalist>
            </Field>
            <Field label="Instrutor / responsável">
              <input
                value={draft.owner}
                onChange={(e) => patch("owner", e.target.value)}
              />
            </Field>
            <Field label="Data de início *">
              <input
                type="date"
                required
                value={draft.date}
                onChange={(e) => {
                  const date = e.target.value;
                  setError("");
                  setDraft((d) => ({
                    ...d,
                    date,
                    endDate:
                      d.endDate === d.date || d.endDate < date
                        ? date
                        : d.endDate,
                  }));
                }}
              />
            </Field>
            <Field label="Horário de início *">
              <input
                type="time"
                required
                value={draft.time}
                onChange={(e) => patch("time", e.target.value)}
              />
            </Field>
            <Field label="Data de término *">
              <input
                type="date"
                required
                min={draft.date}
                value={draft.endDate}
                onChange={(e) => patch("endDate", e.target.value)}
              />
            </Field>
            <Field label="Horário de término *">
              <input
                type="time"
                required
                value={draft.endTime}
                onChange={(e) => patch("endTime", e.target.value)}
              />
            </Field>
            <Field label="Situação">
              <select
                value={draft.status}
                onChange={(e) => patch("status", e.target.value)}
              >
                <option>Agendado</option>
                <option>Realizado</option>
                <option>Reagendar</option>
              </select>
            </Field>
            <Field label="Duração">
              <output className="appointment-duration">
                {appointmentDuration(draft)}
              </output>
            </Field>
            <Field label="Link da sala / reunião" full>
              <input
                type="url"
                value={draft.meetingUrl}
                onChange={(e) => patch("meetingUrl", e.target.value)}
                placeholder="https://teams.microsoft.com/..."
              />
              {draft.meetingUrl &&
                (() => {
                  try {
                    validateAppointment({
                      ...draft,
                      endDate: undefined,
                      endTime: undefined,
                    });
                    return (
                      <a
                        className="meeting-link"
                        href={draft.meetingUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <ExternalLink size={14} /> Abrir sala
                      </a>
                    );
                  } catch {
                    return null;
                  }
                })()}
            </Field>
            <Field label="Notas / link da reunião" full>
              <textarea
                value={draft.notes}
                rows="3"
                onChange={(e) => patch("notes", e.target.value)}
                placeholder="Participantes, pauta e orientações de atendimento..."
              />
            </Field>
          </div>
          <p className="appointment-period-hint">
            A sala fica agendada do início ao término e aparece em cada dia do
            período no calendário.
          </p>
          {error && (
            <p className="team-error" role="alert">
              {error}
            </p>
          )}
          {confirm && (
            <div className="delete-confirm">
              <span>Excluir este treinamento/atendimento?</span>
              <button type="button" onClick={onDelete}>
                Sim, excluir
              </button>
              <button type="button" onClick={() => setConfirm(false)}>
                Cancelar
              </button>
            </div>
          )}
          <div className="modal-actions">
            {training && (
              <button
                type="button"
                className="text-danger"
                onClick={() => setConfirm(true)}
              >
                <Trash2 size={15} /> Excluir
              </button>
            )}
            <div className="action-spacer" />
            <button
              type="button"
              className="button secondary"
              onClick={onClose}
            >
              Cancelar
            </button>
            <button className="button primary" type="submit">
              Salvar treinamento/atendimento
            </button>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
function Agenda({ readOnly = false, project, onTask, onTraining, onAdd }) {
  const [range, setRange] = useState("upcoming");
  const today = localDate();
  const events = [
    ...project.tasks
      .filter((t) => t.stage !== "concluido" && t.date)
      .map((t) => ({ ...t, kind: "activity" })),
    ...project.trainings.map((t) => ({ ...t, kind: "training" })),
  ]
    .filter(
      (t) =>
        range === "all" ||
        (range === "today"
          ? t.kind === "training"
            ? appointmentOccursOn(t, today)
            : t.date === today
          : t.kind === "training"
            ? appointmentHasUpcomingDays(t, today)
            : t.date >= today),
    )
    .map((t) => ({
      ...t,
      agendaDate:
        range !== "all" && t.kind === "training" && t.date < today
          ? today
          : t.date,
    }))
    .sort((a, b) =>
      (a.agendaDate + appointmentTimeOn(a, a.agendaDate)).localeCompare(
        b.agendaDate + appointmentTimeOn(b, b.agendaDate),
      ),
    );
  const dates = [...new Set(events.map((t) => t.agendaDate))];
  return (
    <section className="content-panel">
      <div className="panel-heading">
        <h2>
          <CalendarDays size={20} /> Agenda da implantação
        </h2>
        <div className="segmented">
          {[
            ["upcoming", "Próximos"],
            ["today", "Hoje"],
            ["all", "Todos"],
          ].map(([id, text]) => (
            <button
              key={id}
              className={range === id ? "active" : ""}
              onClick={() => setRange(id)}
            >
              {text}
            </button>
          ))}
        </div>
      </div>
      <p className="panel-description">
        Compromissos, prazos, treinamentos e atendimentos reunidos. Abra um item
        para atualizar.
      </p>
      {dates.map((date) => (
        <div className="agenda-group" key={date}>
          <h3>
            {date === today
              ? "Hoje"
              : formatDate(date, {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })}
            <span>{formatDate(date)}</span>
          </h3>
          {events
            .filter((t) => t.agendaDate === date)
            .map((t) => (
              <button
                className="agenda-row"
                key={t.id}
                onClick={() =>
                  t.kind === "training"
                    ? onTraining(project.trainings.find((x) => x.id === t.id))
                    : onTask(project.tasks.find((x) => x.id === t.id))
                }
              >
                <span className="event-time">
                  {t.kind === "training" && t.date < date
                    ? "Em período"
                    : t.time || "Sem hora"}
                  <small>
                    {t.kind === "training"
                      ? appointmentDuration(t)
                      : "Atividade"}
                  </small>
                </span>
                <span
                  className={`event-icon ${t.kind === "training" ? "lavender" : "blue"}`}
                >
                  {t.kind === "training" ? (
                    <GraduationCap size={20} />
                  ) : (
                    <CalendarDays size={20} />
                  )}
                </span>
                <div>
                  <strong>{t.title}</strong>
                  <p>
                    {t.kind === "training"
                      ? `${appointmentLabel(t)} · ${t.entity || "Todas as entidades"}`
                      : `${t.module} · ${STAGES.find((s) => s.id === t.stage).label}`}
                  </p>
                  {t.kind === "training" && (
                    <span className="appointment-range">
                      {appointmentRange(t)}
                    </span>
                  )}
                </div>
                <span className="event-owner">
                  {t.owner || "Sem responsável"}
                </span>
                <ChevronRight size={18} />
              </button>
            ))}
        </div>
      ))}
      {!events.length && (
        <Empty
          icon={CalendarDays}
          title="Espaço livre na agenda"
          description="Marque um compromisso ou adicione uma data às atividades."
          button="Agendar atividade"
          onClick={readOnly ? undefined : onAdd}
        />
      )}
    </section>
  );
}
function Trainings({ readOnly = false, project, onOpen, onAdd }) {
  const [filter, setFilter] = useState("all");
  const items = project.trainings
    .filter((t) => filter === "all" || t.status === filter)
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  return (
    <section className="content-panel">
      <div className="panel-heading">
        <h2>
          <GraduationCap size={21} /> Treinamento/Atendimento
        </h2>
        <select
          aria-label="Filtrar treinamentos/atendimentos"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">Todas as situações</option>
          <option>Agendado</option>
          <option>Realizado</option>
          <option>Reagendar</option>
        </select>
      </div>
      <div className="info-banner">
        <GraduationCap size={19} />
        <p>
          Cadastre capacitações e salas de atendimento remoto. Defina início,
          término e link da sala. O período aparece também na agenda e no
          calendário.
        </p>
      </div>
      <div className="training-grid">
        {items.map((t) => (
          <button
            key={t.id}
            className="training-card"
            onClick={() => onOpen(t)}
          >
            <div>
              <span
                className={`status-pill ${t.status === "Realizado" ? "green" : t.status === "Reagendar" ? "amber" : "blue"}`}
              >
                {t.status}
              </span>
              <ArrowUpRight size={18} />
            </div>
            <span className="appointment-type">{appointmentLabel(t)}</span>
            <h3>{t.title}</h3>
            <p>
              <Building2 size={14} />
              {t.entity || "Entidade não informada"}
            </p>
            <footer>
              <span>
                <CalendarDays size={15} />
                {appointmentRange(t)}
              </span>
              <span>
                <Clock3 size={15} />
                {appointmentDuration(t)}
              </span>
            </footer>
          </button>
        ))}
      </div>
      {!items.length && (
        <Empty
          icon={GraduationCap}
          title="Treinamento e atendimento bem organizados"
          description="Cadastre capacitações e salas de atendimento por período."
          button="Novo treinamento/atendimento"
          onClick={readOnly ? undefined : onAdd}
        />
      )}
    </section>
  );
}
function History({ project, onOpen }) {
  const [query, setQuery] = useState("");
  const logs = project.logs.filter((l) =>
    l.title.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <section className="content-panel">
      <div className="panel-heading">
        <h2>
          <Clock3 size={20} /> Histórico de execução{" "}
          <span className="count-badge">{project.logs.length}</span>
        </h2>
        <label className="search-input">
          <Search size={16} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar no histórico..."
            aria-label="Buscar no histórico"
          />
        </label>
      </div>
      <AuditHistory project={project} />
      <div className="timeline">
        {logs.map((l) => {
          const task = project.tasks.find((t) => t.id === l.taskId);
          return (
            <div className="timeline-item" key={l.id}>
              <div
                className={`timeline-icon ${l.action.includes("concluída") || l.action === "realizado" ? "green" : "neutral"}`}
              >
                {l.action.includes("concluída") || l.action === "realizado" ? (
                  <Check size={17} />
                ) : (
                  <Clock3 size={17} />
                )}
              </div>
              <div>
                <strong>{l.title}</strong>
                <p>{l.action.charAt(0).toUpperCase() + l.action.slice(1)}</p>
                <small>
                  {l.actorName
                    ? `Por ${l.actorName}`
                    : "Autoria histórica não verificada"}
                  {l.source === "local"
                    ? " · dispositivo local"
                    : l.source === "imported-unverified"
                      ? " · importado; autoria histórica não verificada"
                      : ""}
                </small>
                {l.appointment && typeof l.appointment.date === "string" && (
                  <p className="appointment-range">
                    {appointmentRange(l.appointment)} · {l.appointment.status}
                  </p>
                )}
                {l.validation && (
                  <div className="history-validation">
                    <strong>
                      Validado por {l.validation.by} ·{" "}
                      {formatDate(l.validation.at)}
                    </strong>
                    <span>Critério: {l.criterion}</span>
                    <span>Evidência: {l.validation.evidence}</span>
                  </div>
                )}
                {l.executedWork && (
                  <p className="history-executed-work">
                    <strong>Atividades executadas</strong>
                    {l.executedWork}
                  </p>
                )}
              </div>
              <time>
                {formatDate(l.at)}
                <span>
                  {new Date(l.at).toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </time>
              {task && (
                <button
                  aria-label="Abrir atividade do histórico"
                  onClick={() => onOpen(task)}
                >
                  <ArrowUpRight size={18} />
                </button>
              )}
            </div>
          );
        })}
      </div>
      {!logs.length && (
        <Empty
          icon={Clock3}
          title={
            query ? "Nenhum registro encontrado" : "Seu trabalho vira histórico"
          }
          description="As movimentações e atualizações serão registradas automaticamente aqui."
        />
      )}
    </section>
  );
}
function ProjectDetails({ readOnly = false, project, onEdit }) {
  const team = useTeam();
  const cpfAllowed =
    !team.online ||
    !!team.profile?.admin ||
    (project && team.canEdit(project.id));
  const [showCpf, setShowCpf] = useState(false);
  useEffect(() => setShowCpf(false), [project.id, project.cpf]);
  const info = (label, value, email = false) => (
    <div className="detail-field">
      <span>{label}</span>
      {value ? (
        email ? (
          <a href={`mailto:${value}`}>
            {value}
            <ArrowUpRight size={13} />
          </a>
        ) : (
          <strong>{value}</strong>
        )
      ) : (
        <strong className="not-informed">Não informado</strong>
      )}
    </div>
  );
  return (
    <section className="content-panel">
      <div className="panel-heading">
        <h2>
          <Building2 size={21} /> Informações do município
        </h2>
        <button
          className="button secondary"
          disabled={readOnly}
          onClick={onEdit}
        >
          <Settings2 size={16} /> Editar dados
        </button>
      </div>
      <div className="details-grid">
        <section>
          <h3>
            <MapPin size={18} /> Identificação
          </h3>
          {info("Município", project.name)}
          {info("UF", project.state)}
          {info("Código no Dream", project.dream)}
        </section>
        <section>
          <h3>
            <ShieldCheck size={18} /> Fiscal do contrato
          </h3>
          {info("Nome", project.fiscal)}
          <div className="detail-field">
            <span>CPF</span>
            {!cpfAllowed ? (
              <strong className="not-informed">
                Acesso restrito a administradores e editores
              </strong>
            ) : project.cpf ? (
              <div className="cpf-display">
                <strong>
                  {showCpf ? project.cpf : project.cpf.replace(/\d/g, "*")}
                </strong>
                <button
                  className="icon-button"
                  aria-label={
                    showCpf ? "Ocultar CPF do fiscal" : "Mostrar CPF do fiscal"
                  }
                  aria-pressed={showCpf}
                  onClick={() => setShowCpf((s) => !s)}
                >
                  {showCpf ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            ) : (
              <strong className="not-informed">Não informado</strong>
            )}
          </div>
          {info("E-mail", project.fiscalEmail, true)}
        </section>
        <section>
          <h3>
            <MessageSquare size={18} /> Contato para chamados
          </h3>
          {info("Responsável", project.contact)}
          {info("E-mail", project.contactEmail, true)}
        </section>
      </div>
      <div className="entity-section">
        <h3>
          <Building2 size={18} /> Entidades do projeto{" "}
          <span className="count-badge">{project.entities.length}</span>
        </h3>
        <div>
          {project.entities.length ? (
            project.entities.map((e) => (
              <span className="entity-pill" key={e}>
                <Building2 size={15} />
                {e}
              </span>
            ))
          ) : (
            <p className="muted">Adicione as entidades em Editar dados.</p>
          )}
        </div>
        <p>
          Os checklists de homologação podem ser criados separadamente para cada
          entidade.
        </p>
      </div>
    </section>
  );
}
function Empty({ icon: Icon, title, description, button, onClick }) {
  return (
    <div className="empty-state">
      <span>
        <Icon size={30} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {button && (
        <button className="button primary" onClick={onClick}>
          <Plus size={16} />
          {button}
        </button>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")).render(
  <TeamHost>
    <App />
  </TeamHost>,
);

function ProjectActionModal({
  Modal,
  Field,
  action,
  project,
  onClose,
  onExport,
  onConfirm,
}) {
  const [confirmation, setConfirmation] = useState("");
  const closing = action === "closeProject";
  const clearing = action === "clearWorkspace";
  const expected = clearing ? "LIMPAR" : project?.name;
  return (
    <Modal
      title={
        closing
          ? "Encerrar projeto?"
          : clearing
            ? "Limpar este workspace?"
            : "Excluir projeto?"
      }
      subtitle={
        clearing
          ? "Somente os dados deste navegador/aparelho serão removidos."
          : project.name
      }
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (closing || confirmation === expected) onConfirm();
        }}
      >
        <p className="dialog-copy">
          {closing
            ? "O projeto sai dos ativos e fica em Encerrados, com tarefas, homologação e histórico preservados. Você poderá reabri-lo."
            : clearing
              ? "Todos os projetos, tarefas, treinamentos/atendimentos, homologações e históricos deste aparelho serão excluídos. Sua agenda geral e suas preferências de aparência serão mantidas."
              : "O projeto e todas as suas tarefas, homologações, treinamentos/atendimentos e históricos serão excluídos deste aparelho."}
        </p>
        {!closing && (
          <>
            <button
              type="button"
              className="button secondary"
              onClick={onExport}
            >
              <Download size={16} />
              Exportar backup antes de excluir
            </button>
            <Field
              label={
                clearing
                  ? "Digite LIMPAR para confirmar"
                  : "Digite o nome do projeto para confirmar"
              }
            >
              <input
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                autoComplete="off"
              />
            </Field>
          </>
        )}
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="submit"
            className={closing ? "button primary" : "button danger"}
            disabled={!closing && confirmation !== expected}
          >
            {closing
              ? "Confirmar encerramento"
              : clearing
                ? "Confirmar limpeza"
                : "Confirmar exclusão"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
