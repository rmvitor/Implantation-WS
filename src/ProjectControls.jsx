import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Building2,
  CalendarDays,
  Clock3,
  FileCheck2,
  GraduationCap,
  LayoutDashboard,
  Pencil,
  Trash2,
  CheckCheck,
} from "lucide-react";
import { isProjectClosed } from "./domain";

const AREAS = [
  { id: "board", label: "Atividades", icon: LayoutDashboard },
  { id: "homologation", label: "Homologação", icon: FileCheck2 },
  { id: "agenda", label: "Agenda", icon: CalendarDays },
  { id: "trainings", label: "Capacitação", icon: GraduationCap },
  { id: "history", label: "Histórico", icon: Clock3 },
];

export function ProjectNavigation({ view, onChange }) {
  const tabs = useRef();
  useLayoutEffect(() => {
    const container = tabs.current;
    const active = container.querySelector('[aria-current="page"]');
    if (!active) return;
    const bounds = container.getBoundingClientRect();
    const item = active.getBoundingClientRect();
    if (item.left < bounds.left)
      container.scrollLeft += item.left - bounds.left;
    else if (item.right > bounds.right)
      container.scrollLeft += item.right - bounds.right;
  }, [view]);
  return (
    <div
      className="board-toolbar project-navigation"
      role="navigation"
      aria-label="Navegação do projeto"
    >
      <div className="board-tabs" ref={tabs}>
        {AREAS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={view === id ? "active" : ""}
            aria-current={view === id ? "page" : undefined}
            onClick={() => onChange(id)}
          >
            <Icon size={16} />
            <span>{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function ProjectMenu({
  anchor,
  project,
  canEdit,
  canManage,
  onClose,
  onArea,
  onEdit,
  onCloseProject,
  onReopen,
  onDelete,
}) {
  const ref = useRef();
  const [position, setPosition] = useState({ left: anchor.x, top: anchor.y });
  useLayoutEffect(() => {
    const el = ref.current;
    setPosition({
      left: Math.max(8, Math.min(anchor.x, innerWidth - el.offsetWidth - 8)),
      top: Math.max(8, Math.min(anchor.y, innerHeight - el.offsetHeight - 8)),
    });
  }, [anchor]);
  useEffect(() => {
    const previous = document.activeElement;
    ref.current
      .querySelector("button:not(:disabled)")
      ?.focus({ preventScroll: true });
    const dismiss = (e) => {
      if (!ref.current.contains(e.target)) onClose();
    };
    const key = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    const close = () => onClose();
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", key);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", key);
      window.removeEventListener("resize", close);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [onClose]);
  const act = (fn) => {
    onClose();
    fn();
  };
  return (
    <div
      ref={ref}
      className="card-context-menu project-context-menu"
      role="menu"
      aria-label="Ações do projeto"
      style={position}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
        e.preventDefault();
        const items = [
            ...ref.current.querySelectorAll("button:not(:disabled)"),
          ],
          index = items.indexOf(document.activeElement);
        const next =
          e.key === "Home"
            ? 0
            : e.key === "End"
              ? items.length - 1
              : (index + (e.key === "ArrowDown" ? 1 : -1) + items.length) %
                items.length;
        items[next]?.focus();
      }}
    >
      <strong className="context-menu-title">{project.name}</strong>
      {AREAS.map(({ id, label, icon: Icon }) => (
        <button key={id} role="menuitem" onClick={() => act(() => onArea(id))}>
          <Icon size={15} />
          {id === "board" ? "Abrir atividades" : label}
        </button>
      ))}
      <button role="menuitem" onClick={() => act(() => onArea("details"))}>
        <Building2 size={15} />
        Dados do município
      </button>
      <button role="menuitem" disabled={!canEdit} onClick={() => act(onEdit)}>
        <Pencil size={15} />
        Editar dados
      </button>
      <div className="context-menu-group">
        <button
          role="menuitem"
          disabled={!canManage}
          onClick={() =>
            act(isProjectClosed(project) ? onReopen : onCloseProject)
          }
        >
          <CheckCheck size={15} />
          {isProjectClosed(project) ? "Reabrir projeto" : "Encerrar projeto"}
        </button>
        <button
          role="menuitem"
          className="text-danger"
          disabled={!canManage}
          onClick={() => act(onDelete)}
        >
          <Trash2 size={15} />
          Excluir projeto
        </button>
      </div>
    </div>
  );
}
