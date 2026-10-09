import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, Pencil } from "lucide-react";
import { STAGES, PRIORITIES } from "./domain";

export function CardMenu({
  anchor,
  task,
  onClose,
  onEdit,
  onMove,
  onPriority,
}) {
  const ref = useRef();
  const [position, setPosition] = useState({ left: anchor.x, top: anchor.y });
  useLayoutEffect(() => {
    const menu = ref.current;
    setPosition({
      left: Math.max(8, Math.min(anchor.x, innerWidth - menu.offsetWidth - 8)),
      top: Math.max(8, Math.min(anchor.y, innerHeight - menu.offsetHeight - 8)),
    });
  }, [anchor]);
  useEffect(() => {
    const previous = document.activeElement;
    ref.current
      .querySelector('[role="menuitem"]')
      ?.focus({ preventScroll: true });
    const dismiss = (e) => {
      if (!ref.current.contains(e.target)) onClose();
    };
    const close = () => onClose();
    const key = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
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
  const act = (action) => {
    onClose();
    action();
  };
  return (
    <div
      ref={ref}
      className="card-context-menu"
      role="menu"
      aria-label="Atalhos da atividade"
      style={position}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
        e.preventDefault();
        const items = [...ref.current.querySelectorAll("button")].filter(
          (b) => !b.disabled,
        );
        const index = items.indexOf(document.activeElement);
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
      <strong className="context-menu-title">{task.title}</strong>
      <button role="menuitem" onClick={() => act(() => onEdit(task))}>
        <Pencil size={15} /> Editar atividade
      </button>
      <div
        className="context-menu-group"
        role="group"
        aria-label="Alterar situação"
      >
        <span>Situação</span>
        {STAGES.map((stage) => (
          <button
            key={stage.id}
            role="menuitemradio"
            aria-checked={task.stage === stage.id}
            onClick={() => act(() => onMove(task.id, stage.id))}
          >
            <i style={{ background: stage.color }} /> {stage.label}
            {task.stage === stage.id && <Check size={14} />}
          </button>
        ))}
      </div>
      <div
        className="context-menu-group"
        role="group"
        aria-label="Alterar prioridade"
      >
        <span>Prioridade</span>
        {Object.entries(PRIORITIES).map(([id, label]) => (
          <button
            key={id}
            role="menuitemradio"
            aria-checked={task.priority === id}
            onClick={() => act(() => onPriority(task, id))}
          >
            {label}
            {task.priority === id && <Check size={14} />}
          </button>
        ))}
      </div>
    </div>
  );
}
