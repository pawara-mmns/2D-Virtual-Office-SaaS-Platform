"use client";

import { useEffect, useRef, useState } from "react";
import { mountOffice } from "../engine/lifecycle";

export default function OfficeCanvas() {
  const host = useRef<HTMLDivElement>(null);
  const controls = useRef<ReturnType<typeof mountOffice> | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  useEffect(() => {
    if (!host.current) return;
    const element = host.current;
    let active = true;
    const fail = () => { if (active) setStatus("error"); };
    const timeout = window.setTimeout(fail, 15000);
    const controller = mountOffice(async () => {
      const { createOfficeGame } = await import("../engine/create-game");
      return () => createOfficeGame(element, {
        onReady() { window.clearTimeout(timeout); if (active) setStatus("ready"); },
        onError: fail,
      });
    }, fail);
    controls.current = controller;
    return () => { active = false; window.clearTimeout(timeout); controls.current = null; void controller.dispose(); };
  }, [attempt]);
  return <section aria-label="Interactive office" className="mt-6 overflow-hidden rounded-md border border-line bg-white">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
      <p id="office-instructions" className="text-xs leading-6 text-muted">Click or Tab into the office to move. <kbd>W A S D</kbd> or arrow keys. Tab to leave the canvas.</p>
      <div role="group" aria-label="Office zoom" className="flex gap-2">
        <button className="office-control" disabled={status !== "ready"} onClick={() => controls.current?.zoomBy(-1)} aria-label="Zoom out">−</button>
        <button className="office-control" disabled={status !== "ready"} onClick={() => controls.current?.resetZoom()}>Reset zoom</button>
        <button className="office-control" disabled={status !== "ready"} onClick={() => controls.current?.zoomBy(1)} aria-label="Zoom in">+</button>
      </div>
    </div>
    <div className="relative bg-ink">
      <div ref={host} tabIndex={0} role="region" aria-label="Pixel-art office. Keyboard movement area" aria-describedby="office-instructions"
        className="office-stage outline-offset-[-4px] focus-visible:outline-4 focus-visible:outline-forest" />
      {status !== "ready" && <div className="absolute inset-0 flex items-center justify-center bg-surface p-8 text-center">
        {status === "loading" ? <p role="status" className="text-sm text-muted">Preparing your office…</p> : <div><h2 className="font-semibold">Office unavailable</h2><p role="alert" className="mt-3 max-w-sm text-sm leading-7 text-muted">The office engine or artwork could not load. Check your connection and browser graphics support, then try again.</p><button className="auth-button mt-5" onClick={() => { setStatus("loading"); setAttempt((value) => value + 1); }}>Try again</button></div>}
      </div>}
    </div>
    <div className="flex flex-wrap justify-between gap-2 border-t border-line px-5 py-3 text-xs leading-6 text-muted"><p>Development · Meeting room · Lounge · Reception</p><p>Single-player office · Keyboard required</p></div>
  </section>;
}
