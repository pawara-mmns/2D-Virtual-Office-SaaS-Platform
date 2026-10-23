"use client";

import { useEffect, useRef, type ReactNode } from "react";

// A non-modal panel: native summary keyboard behavior, no focus trap, and an
// explicit route back to its trigger with Escape. Only one panel stays open.
export function OfficeDisclosure({ label, children, onOpen }: { label: string; children: ReactNode; onOpen?(): void }) {
  const details = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (details.current?.open && event.target instanceof Node && !details.current.contains(event.target)) details.current.open = false;
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, []);
  return <details ref={details} name="office-panels" className="office-disclosure" onToggle={(event) => { if (event.currentTarget.open) { event.currentTarget.querySelector(".office-disclosure-panel")?.scrollTo({ top: 0 }); onOpen?.(); } }}
    onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); if (details.current) { details.current.open = false; details.current.querySelector("summary")?.focus(); } } }}>
    <summary className="office-control cursor-pointer">{label}</summary>
    <div className="office-disclosure-panel"><button type="button" className="office-control float-right mb-2 ml-2" aria-label={`Close ${label}`} onClick={() => { if (details.current) { details.current.open = false; details.current.querySelector("summary")?.focus(); } }}>Close</button>{children}</div>
  </details>;
}
