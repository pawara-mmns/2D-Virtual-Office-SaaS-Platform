"use client";

import { useEffect, useRef, useState } from "react";
import { mountOffice } from "../engine/lifecycle";
import { AvatarSettings } from "@/features/avatars/avatar-settings";
import type { AvatarAppearance, AvatarKey } from "@/features/avatars/presets";
import { connectOffice, realtimeUrl } from "../network/connection";
import { createClient } from "@/lib/supabase/client";
import type { OfficeNetwork, Presence } from "../../../../../../packages/shared/src/protocol.ts";

export default function OfficeCanvas({ appearance, profileWarning, officeId }: { appearance: AvatarAppearance; profileWarning?: string; officeId: string }) {
  const host = useRef<HTMLDivElement>(null);
  const controls = useRef<ReturnType<typeof mountOffice> | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [savedKey, setSavedKey] = useState<AvatarKey | null>(null);
  const network = useRef<OfficeNetwork | null>(null);
  const [presence, setPresence] = useState<Presence>({ status: "connecting", count: 0, notice: "Connecting to your office…" });
  const avatarKey = savedKey ?? appearance.avatarKey;
  const latestAppearance = useRef<AvatarAppearance>({ ...appearance, avatarKey });
  useEffect(() => {
    const current = { avatarKey, displayName: appearance.displayName };
    latestAppearance.current = current;
    controls.current?.setAppearance(current);
  }, [avatarKey, appearance.displayName]);
  useEffect(() => {
    if (!host.current) return;
    const element = host.current;
    let active = true;
    let authSubscription: { unsubscribe(): void } | undefined;
    let authTimer: ReturnType<typeof setTimeout> | undefined;
    const leave = () => {
      network.current?.close();
      if (active) setPresence({ status: "offline", count: 0, notice: "Office disconnected. Retry to enter again." });
    };
    window.addEventListener("pagehide", leave);
    const fail = () => { if (active) setStatus("error"); };
    const timeout = window.setTimeout(fail, 15000);
    const controller = mountOffice(async () => {
      const { createOfficeGame } = await import("../engine/create-game");
      return () => createOfficeGame(element, {
        onReady(version) {
          window.clearTimeout(timeout);
          if (!active) return;
          setStatus("ready");
          try {
            const url = realtimeUrl(process.env.NEXT_PUBLIC_REALTIME_URL);
            const client = createClient();
            const connected = connectOffice({ url, officeId, mapVersion: version!, onPresence: (value) => { if (active) setPresence(value); },
              async getToken() { const { data, error } = await client.auth.getSession(); return error ? null : data.session?.access_token ?? null; },
            });
            network.current = connected; controls.current?.setNetwork(connected);
            authSubscription = client.auth.onAuthStateChange((event) => {
              if (event === "SIGNED_OUT") leave();
              else if (event === "TOKEN_REFRESHED") authTimer = setTimeout(() => connected.appearanceChanged(), 0);
            }).data.subscription;
          } catch { setPresence({ status: "offline", count: 0, notice: "Multiplayer unavailable. Configure NEXT_PUBLIC_REALTIME_URL and start the realtime server, then retry." }); }
        },
        onError: fail,
      }, latestAppearance.current, true);
    }, fail);
    controls.current = controller;
    return () => { active = false; window.clearTimeout(timeout); clearTimeout(authTimer); authSubscription?.unsubscribe(); window.removeEventListener("pagehide", leave); network.current?.close(); network.current = null; controls.current = null; void controller.dispose(); };
  }, [attempt, officeId]);
  return <>
    {profileWarning && <p role="alert" className="mt-4 text-sm leading-6 text-muted">{profileWarning}</p>}
    <AvatarSettings currentKey={avatarKey} onSaved={(key) => { setSavedKey(key); network.current?.appearanceChanged(); }} onReturn={() => host.current?.focus({ preventScroll: true })} />
    <section aria-label="Interactive office" className="mt-6 overflow-hidden rounded-md border border-line bg-white">
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
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3 text-xs leading-6 text-muted">
      <p>{presence.status === "online" ? `${presence.count} online` : presence.status === "connecting" ? "Connecting" : presence.status === "reconnecting" ? "Reconnecting" : "Offline"} · Keyboard required</p>
      <p role="status" aria-live="polite">{presence.notice}</p>
      {presence.status === "offline" && <button className="office-control" onClick={() => { setStatus("loading"); setPresence({ status: "connecting", count: 0, notice: "Connecting to your office…" }); setAttempt((value) => value + 1); }}>Retry connection</button>}
    </div>
  </section></>;
}
