"use client";

import { useEffect, useLayoutEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { HudIcon } from "./hud-icon";

export type OfficePanelControl = {
  open: boolean;
  onOpenChange(open: boolean): void;
  container: HTMLElement | null;
};

// Nonmodal throughout: office navigation and voice stay available. The office
// owns panel selection; a stable portal keeps the editor inside the work area.
export function OfficeDisclosure({ label, children, onOpen, panel, icon, material = "regular" }: {
  label: string; children: ReactNode; onOpen?(): void; panel?: OfficePanelControl;
  icon?: ReactNode; material?: "regular" | "elevated";
}) {
  const [localOpen, setLocalOpen] = useState(false);
  const open = panel?.open ?? localOpen;
  const change = panel?.onOpenChange ?? setLocalOpen;
  const trigger = useRef<HTMLButtonElement>(null);
  const content = useRef<HTMLElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const readingTop = useRef(0);
  const id = useId();
  useLayoutEffect(() => {
    if (open && body.current) body.current.scrollTop = readingTop.current;
  }, [open]);
  useEffect(() => {
    if (open) content.current?.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !content.current?.contains(event.target) && !trigger.current?.contains(event.target)) change(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open, change]);
  const close = () => { change(false); trigger.current?.focus({ preventScroll: true }); };
  const contents = <section ref={content} id={id} hidden={!open} inert={!open} aria-label={label} className="office-panel office-disclosure-panel" data-glass-surface="" data-glass-variant={material}
    onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); } }}>
    <header className="office-panel-header"><h2>{label}</h2><button type="button" className="office-control office-panel-close" aria-label={`Close ${label}`} onClick={close}><HudIcon name="close" /><span>Close</span></button></header>
    <div ref={body} className="office-panel-body" onScroll={() => { if (open && body.current) readingTop.current = body.current.scrollTop; }}>{children}</div>
  </section>;
  return <div className="office-disclosure" data-open={open}>
    <button ref={trigger} type="button" className="office-control" aria-expanded={open} aria-controls={id}
      onKeyDown={(event) => { if (event.key === "Escape" && open) { event.preventDefault(); close(); } }}
      onClick={() => { if (!open) onOpen?.(); change(!open); }}>{icon}<span className="hud-control-label">{label}</span></button>
    {panel ? panel.container && createPortal(contents, panel.container) : contents}
  </div>;
}
