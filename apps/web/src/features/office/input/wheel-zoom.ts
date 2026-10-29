type WheelInput = Pick<WheelEvent, "deltaX" | "deltaY" | "deltaMode" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">;

// One line is a conservative 16 CSS pixels; a page uses the active surface.
// Cap a single event so mice, trackpads and page-mode wheels share a bounded gain.
export function wheelPixels(event: WheelInput, pageHeight: number): number | null {
  if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || !Number.isFinite(event.deltaY) || !Number.isFinite(event.deltaX) || !event.deltaY || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return null;
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? Math.max(1, pageHeight) : event.deltaMode === 0 ? 1 : 0;
  if (!unit || !Number.isFinite(unit)) return null;
  return Math.max(-160, Math.min(160, event.deltaY * unit));
}

export function attachWheelZoom(host: HTMLElement, zoom: (pixels: number) => boolean) {
  const wheel = (event: WheelEvent) => {
    if (event.defaultPrevented || host.closest("[hidden], [inert]")) return;
    if (event.target instanceof Element && event.target.closest("input, textarea, select, button, a, [contenteditable]")) return;
    const pixels = wheelPixels(event, host.clientHeight);
    if (pixels !== null && zoom(pixels)) event.preventDefault();
  };
  host.addEventListener("wheel", wheel, { passive: false });
  return () => host.removeEventListener("wheel", wheel);
}
