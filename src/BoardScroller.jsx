import React, { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";

export function BoardScroller({ children }) {
  const ref = useRef();
  const dragFrame = useRef();
  const dragSpeed = useRef(0);
  const [scroll, setScroll] = useState({ left: 0, max: 0 });
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const update = () => {
    const el = ref.current;
    if (el)
      setScroll({
        left: el.scrollLeft,
        max: Math.max(0, el.scrollWidth - el.clientWidth),
      });
  };
  const stop = () => {
    cancelAnimationFrame(dragFrame.current);
    dragFrame.current = null;
    dragSpeed.current = 0;
  };
  useEffect(() => {
    const observer = new ResizeObserver(update);
    observer.observe(ref.current);
    update();
    return () => {
      observer.disconnect();
      stop();
    };
  }, []);
  useEffect(update, [children]);
  const step = (direction) =>
    ref.current.scrollBy({
      left: direction * 270,
      behavior: reduced() ? "instant" : "smooth",
    });
  const onDragOver = (e) => {
    const bounds = ref.current.getBoundingClientRect();
    dragSpeed.current =
      e.clientX < bounds.left + 45 ? -8 : e.clientX > bounds.right - 45 ? 8 : 0;
    if (dragSpeed.current && !dragFrame.current) {
      const frame = () => {
        ref.current.scrollLeft += dragSpeed.current;
        dragFrame.current = dragSpeed.current
          ? requestAnimationFrame(frame)
          : null;
      };
      dragFrame.current = requestAnimationFrame(frame);
    }
  };
  return (
    <div className="board-scroller">
      <div className="board-scroll-toolbar">
        <span>Deslize para ver todas as fases</span>
        <button
          className="icon-button"
          aria-label="Rolar quadro para a esquerda"
          disabled={scroll.left <= 1}
          onClick={() => step(-1)}
        >
          <ArrowLeft size={17} />
        </button>
        <input
          type="range"
          aria-label="Rolar quadro horizontalmente"
          min="0"
          max={scroll.max}
          value={Math.min(scroll.left, scroll.max)}
          disabled={!scroll.max}
          onChange={(e) => {
            ref.current.scrollLeft = Number(e.target.value);
          }}
        />
        <button
          className="icon-button"
          aria-label="Rolar quadro para a direita"
          disabled={scroll.left >= scroll.max - 1}
          onClick={() => step(1)}
        >
          <ArrowRight size={17} />
        </button>
      </div>
      <section
        className="kanban"
        aria-label="Quadro de implantação"
        tabIndex={0}
        ref={ref}
        onScroll={update}
        onDragOver={onDragOver}
        onDrop={stop}
        onDragEnd={stop}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) stop();
        }}
        onKeyDown={(e) => {
          if (
            e.target === e.currentTarget &&
            ["ArrowLeft", "ArrowRight"].includes(e.key)
          ) {
            e.preventDefault();
            step(e.key === "ArrowLeft" ? -1 : 1);
          }
        }}
      >
        {children}
      </section>
    </div>
  );
}
