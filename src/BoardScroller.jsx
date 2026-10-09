import React, { useEffect, useRef, useState } from "react";

export function BoardScroller({ children, columns }) {
  const ref = useRef();
  const mirror = useRef();
  const dragFrame = useRef();
  const dragSpeed = useRef(0);
  const [scroll, setScroll] = useState({ left: 0, max: 0, mirrorWidth: 0 });
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const update = () => {
    const el = ref.current;
    if (el) {
      if (
        mirror.current &&
        Math.abs(mirror.current.scrollLeft - el.scrollLeft) > 1
      )
        mirror.current.scrollLeft = el.scrollLeft;
      setScroll({
        left: el.scrollLeft,
        max: Math.max(0, el.scrollWidth - el.clientWidth),
        mirrorWidth: mirror.current?.clientWidth || 0,
      });
    }
  };
  const stop = () => {
    cancelAnimationFrame(dragFrame.current);
    dragFrame.current = null;
    dragSpeed.current = 0;
  };
  useEffect(() => {
    const observer = new ResizeObserver(update);
    observer.observe(ref.current);
    observer.observe(mirror.current);
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
        <div
          className="board-scroll-mirror"
          ref={mirror}
          role="region"
          aria-label="Rolar quadro horizontalmente"
          tabIndex={0}
          onScroll={(e) => {
            if (
              Math.abs(ref.current.scrollLeft - e.currentTarget.scrollLeft) > 1
            )
              ref.current.scrollLeft = e.currentTarget.scrollLeft;
          }}
          onKeyDown={(e) => {
            if (["Home", "End", "ArrowLeft", "ArrowRight"].includes(e.key)) {
              e.preventDefault();
              if (e.key === "Home" || e.key === "End")
                ref.current.scrollLeft = e.key === "Home" ? 0 : scroll.max;
              else step(e.key === "ArrowLeft" ? -1 : 1);
            }
          }}
        >
          <div style={{ width: scroll.max + scroll.mirrorWidth, height: 1 }} />
        </div>
      </div>
      <section
        className="kanban"
        aria-label="Quadro de implantação"
        tabIndex={0}
        ref={ref}
        style={columns ? { gridTemplateColumns: columns } : undefined}
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
