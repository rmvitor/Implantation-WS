import React, { useEffect, useLayoutEffect, useRef } from "react";

export function BoardScroller({ children, columns }) {
  const ref = useRef();
  const mirror = useRef();
  const mirrorTrack = useRef();
  const synchronized = useRef(new WeakMap());
  const measureFrame = useRef();
  const dragFrame = useRef();
  const dragSpeed = useRef(0);
  const dragColumn = useRef(null);
  const verticalSpeed = useRef(0);
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const syncScroll = (source) => {
    // Native scrolling (including touch inertia) owns the source. Ignore the
    // target's generated scroll event so it cannot rewind the source later.
    const expected = synchronized.current.get(source);
    synchronized.current.delete(source);
    if (expected !== undefined && Math.abs(source.scrollLeft - expected) <= 1)
      return;
    const target = source === ref.current ? mirror.current : ref.current;
    if (target && Math.abs(target.scrollLeft - source.scrollLeft) > 1) {
      target.scrollLeft = source.scrollLeft;
      synchronized.current.set(target, target.scrollLeft);
    }
  };
  const update = () => {
    const el = ref.current;
    if (el) {
      const viewport = window.visualViewport?.height || innerHeight;
      const height = Math.max(
        Math.min(280, viewport - 70),
        Math.min(
          720,
          viewport - Math.max(0, el.getBoundingClientRect().top) - 20,
        ),
      );
      const value = `${Math.round(height)}px`;
      if (el.style.getPropertyValue("--board-height") !== value)
        el.style.setProperty("--board-height", value);
      const max = Math.max(0, el.scrollWidth - el.clientWidth);
      const width = `${max + (mirror.current?.clientWidth || 0)}px`;
      if (mirrorTrack.current.style.width !== width)
        mirrorTrack.current.style.width = width;
      if (
        mirror.current &&
        Math.abs(mirror.current.scrollLeft - el.scrollLeft) > 1
      ) {
        mirror.current.scrollLeft = el.scrollLeft;
        synchronized.current.set(mirror.current, mirror.current.scrollLeft);
      }
    }
  };
  const scheduleMeasure = () => {
    if (measureFrame.current) return;
    measureFrame.current = requestAnimationFrame(() => {
      measureFrame.current = null;
      update();
    });
  };
  const stop = () => {
    cancelAnimationFrame(dragFrame.current);
    dragFrame.current = null;
    dragSpeed.current = 0;
    verticalSpeed.current = 0;
    dragColumn.current = null;
  };
  useEffect(() => {
    const observer = new ResizeObserver(scheduleMeasure);
    observer.observe(ref.current);
    observer.observe(mirror.current);
    update();
    window.addEventListener("resize", scheduleMeasure);
    window.addEventListener("scroll", scheduleMeasure, { passive: true });
    window.visualViewport?.addEventListener("resize", scheduleMeasure);
    const onWheel = (e) => {
      if (e.ctrlKey || e.deltaX || !e.deltaY) return;
      const source = e.currentTarget;
      // On card lists a normal wheel still scrolls vertically. Shift+wheel,
      // column headings and the top bar navigate horizontally with a mouse.
      if (
        source === ref.current && !e.shiftKey &&
        e.target.closest?.(".column-cards, .column-overview")
      ) return;
      const unit = e.deltaMode === 1 ? 16
        : e.deltaMode === 2 ? source.clientWidth : 1;
      const before = source.scrollLeft;
      source.scrollLeft += e.deltaY * unit;
      if (source.scrollLeft !== before) e.preventDefault();
    };
    ref.current.addEventListener("wheel", onWheel, { passive: false });
    mirror.current.addEventListener("wheel", onWheel, { passive: false });
    const board = ref.current;
    const top = mirror.current;
    window.addEventListener("drop", stop);
    window.addEventListener("dragend", stop);
    window.addEventListener("blur", stop);
    return () => {
      observer.disconnect();
      stop();
      cancelAnimationFrame(measureFrame.current);
      board.removeEventListener("wheel", onWheel);
      top.removeEventListener("wheel", onWheel);
      window.removeEventListener("resize", scheduleMeasure);
      window.removeEventListener("scroll", scheduleMeasure);
      window.visualViewport?.removeEventListener("resize", scheduleMeasure);
      window.removeEventListener("drop", stop);
      window.removeEventListener("dragend", stop);
      window.removeEventListener("blur", stop);
    };
  }, []);
  useLayoutEffect(update, [children]);
  const step = (direction) =>
    ref.current.scrollBy({
      left: direction * 270,
      behavior: reduced() ? "instant" : "smooth",
    });
  const onDragOver = (e) => {
    const bounds = ref.current.getBoundingClientRect();
    dragSpeed.current =
      e.clientX < bounds.left + 45 ? -8 : e.clientX > bounds.right - 45 ? 8 : 0;
    dragColumn.current =
      e.target.closest?.(".kanban-column")?.querySelector(".column-cards") ||
      null;
    const cards = dragColumn.current?.getBoundingClientRect();
    verticalSpeed.current =
      cards && e.clientY >= cards.top && e.clientY <= cards.bottom
        ? e.clientY < cards.top + 45
          ? -8
          : e.clientY > cards.bottom - 45
            ? 8
            : 0
        : 0;
    if ((dragSpeed.current || verticalSpeed.current) && !dragFrame.current) {
      const frame = () => {
        ref.current.scrollLeft += dragSpeed.current;
        if (dragColumn.current)
          dragColumn.current.scrollTop += verticalSpeed.current;
        dragFrame.current =
          dragSpeed.current || verticalSpeed.current
            ? requestAnimationFrame(frame)
            : null;
      };
      dragFrame.current = requestAnimationFrame(frame);
    }
  };
  return (
    <div className="board-scroller">
      <div className="board-scroll-toolbar">
        <div
          className="board-scroll-mirror"
          ref={mirror}
          role="region"
          aria-label="Rolar quadro horizontalmente"
          tabIndex={0}
          onScroll={(e) => syncScroll(e.currentTarget)}
          onKeyDown={(e) => {
            if (["Home", "End", "ArrowLeft", "ArrowRight"].includes(e.key)) {
              e.preventDefault();
              if (e.key === "Home" || e.key === "End")
                ref.current.scrollLeft = e.key === "Home" ? 0 : ref.current.scrollWidth;
              else step(e.key === "ArrowLeft" ? -1 : 1);
            }
          }}
        >
          <div ref={mirrorTrack} style={{ height: 1 }} />
        </div>
      </div>
      <section
        className="kanban"
        aria-label="Quadro de implantação"
        tabIndex={0}
        ref={ref}
        style={columns ? { gridTemplateColumns: columns } : undefined}
        onScroll={(e) => {
          if (e.target === e.currentTarget) syncScroll(e.currentTarget);
        }}
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
