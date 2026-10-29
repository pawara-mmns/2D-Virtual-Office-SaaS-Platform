const surfaces = ".office-identity, .office-map-hud, .office-panel, .office-chat, .office-voice, .office-hud-actions .office-control, .office-panel-controls .office-control, .office-hud-bottom > .ui-notice";

// One delegated owner, one active surface and at most one pending frame.
// Geometry is read on entry/resize, never on each pointer movement/frame.
export function attachHudReflections(root: HTMLElement) {
  let active: HTMLElement | null = null;
  let rect: DOMRect | undefined;
  let frame = 0, x = 50, y = 0, targetX = 50, targetY = 0;
  const paint = () => {
    frame = 0;
    if (!active) return;
    x += (targetX - x) * .24; y += (targetY - y) * .24;
    active.style.setProperty("--glass-x", `${x.toFixed(2)}%`);
    active.style.setProperty("--glass-y", `${y.toFixed(2)}%`);
    if (Math.abs(targetX - x) + Math.abs(targetY - y) > .1) frame = requestAnimationFrame(paint);
  };
  const reset = () => {
    cancelAnimationFrame(frame); frame = 0;
    if (active) {
      active.removeAttribute("data-glass-hover");
      active.style.removeProperty("--glass-x"); active.style.removeProperty("--glass-y");
    }
    observer.disconnect(); active = null; rect = undefined;
  };
  const observer = new ResizeObserver(() => { if (active) rect = active.getBoundingClientRect(); });
  const surface = (target: EventTarget | null) => target instanceof Element ? target.closest<HTMLElement>(surfaces) : null;
  const move = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    const next = surface(event.target);
    if (!next || !root.contains(next)) { reset(); return; }
    if (next !== active) {
      reset(); active = next; rect = next.getBoundingClientRect(); x = 50; y = 0;
      observer.observe(next); next.setAttribute("data-glass-hover", "true");
    }
    if (!rect?.width || !rect.height) return;
    targetX = Math.max(0, Math.min(100, (event.clientX - rect.left) / rect.width * 100));
    targetY = Math.max(0, Math.min(100, (event.clientY - rect.top) / rect.height * 100));
    if (!frame) frame = requestAnimationFrame(paint);
  };
  const leave = (event: PointerEvent) => { if (surface(event.relatedTarget) !== active) reset(); };
  root.addEventListener("pointermove", move, { passive: true });
  root.addEventListener("pointerout", leave, { passive: true });
  root.addEventListener("pointercancel", reset, { passive: true });
  root.addEventListener("scroll", reset, true);
  window.addEventListener("resize", reset, { passive: true });
  window.addEventListener("blur", reset);
  return () => {
    reset(); root.removeEventListener("pointermove", move); root.removeEventListener("pointerout", leave);
    root.removeEventListener("pointercancel", reset); root.removeEventListener("scroll", reset, true);
    window.removeEventListener("resize", reset); window.removeEventListener("blur", reset);
  };
}
