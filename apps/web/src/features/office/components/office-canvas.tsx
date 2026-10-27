"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { mountOffice } from "../engine/lifecycle";
import { AvatarSettings } from "@/features/avatars/avatar-settings";
import type { AvatarAppearance, AvatarKey } from "@/features/avatars/presets";
import { connectOffice, realtimeUrl } from "../network/connection";
import { createClient } from "@/lib/supabase/client";
import type { OfficeNetwork, Presence, Participant } from "../../../../../../packages/shared/src/protocol.ts";
import { ChatPanel } from "@/features/chat/chat-panel";
import { Participants } from "@/features/chat/participants";
import { createChatEvents } from "@/features/chat/events";
import { isAvailability } from "../../../../../../packages/shared/src/chat.ts";
import { VoiceBar } from "@/features/voice/voice-bar";
import { sameVoiceState, type VoiceZoneState } from "../../../../../../packages/shared/src/voice.ts";

export type OfficeContext = { workspaceName: string; officeName: string; workspaceHref: string };

export default function OfficeCanvas({ appearance, profileWarning, officeId, userId, context }: { appearance: AvatarAppearance; profileWarning?: string; officeId: string; userId?: string; context: OfficeContext }) {
  const host = useRef<HTMLDivElement>(null);
  const controls = useRef<ReturnType<typeof mountOffice> | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [savedKey, setSavedKey] = useState<AvatarKey | null>(null);
  const [savedName, setSavedName] = useState<string | null>(null);
  const network = useRef<OfficeNetwork | null>(null);
  const [presence, setPresence] = useState<Presence>({ status: "connecting", count: 0, notice: "Connecting to your office…" });
  const [panel, setPanel] = useState<"avatar" | "participants" | "chat" | null>(null);
  const [panelHost, setPanelHost] = useState<HTMLDivElement | null>(null);
  const [compact, setCompact] = useState(false);
  const zoomControls = useRef<HTMLDivElement>(null);
  const chatOpen = panel === "chat";
  const [chatEvents] = useState(createChatEvents);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [availabilityError, setAvailabilityError] = useState("");
  const [voice,setVoice] = useState<VoiceZoneState | null>(null);
  const leaveVoice = useCallback(() => network.current?.leaveVoice?.(),[]);
  const chatToggle = useRef<HTMLButtonElement>(null);
  const own = participants.find((person) => person.isSelf);
  const names = useMemo(() => new Map(participants.map((person) => [person.userId, person.displayName])), [participants]);
  const sendChat = useCallback((body: string, id: string) => network.current?.sendChat?.(body, id) ?? false, []);
  const closeChat = useCallback(() => { setPanel(null); chatToggle.current?.focus({ preventScroll: true }); }, []);
  const avatarPanel = useCallback((open: boolean) => setPanel(open ? "avatar" : null), []);
  const participantsPanel = useCallback((open: boolean) => setPanel(open ? "participants" : null), []);
  const avatarKey = savedKey ?? appearance.avatarKey;
  const displayName = savedName ?? appearance.displayName;
  const latestAppearance = useRef<AvatarAppearance>({ ...appearance, avatarKey });
  useEffect(() => {
    const media = window.matchMedia("(max-width: 639px)");
    const update = () => setCompact(media.matches);
    update(); media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!compact || !panel) return;
    const focused = document.activeElement;
    if (focused === document.body || host.current?.contains(focused) || zoomControls.current?.contains(focused)) {
      const surface = panel === "chat" ? document.getElementById("office-chat") : panelHost?.querySelector<HTMLElement>(".office-panel:not([hidden])");
      surface?.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
    }
  }, [compact, panel, panelHost]);
  useEffect(() => {
    const current = { avatarKey, displayName };
    latestAppearance.current = current;
    controls.current?.setAppearance(current);
  }, [avatarKey, displayName]);
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
              onChat: chatEvents.emit,
              onVoice: (value) => { if (active) setVoice((previous) => sameVoiceState(previous,value) ? previous : value); },
              onParticipants: (value) => { if (active) setParticipants(value); },
              onAvailabilityError: (message) => { if (active) setAvailabilityError(message); },
              async getToken() { const { data, error } = await client.auth.getSession(); return error ? null : data.session?.access_token ?? null; },
            });
            network.current = connected; controls.current?.setNetwork(connected);
            authSubscription = client.auth.onAuthStateChange((event) => {
              if (event === "SIGNED_OUT") { leave(); if (active) setPresence({ status: "denied", count: 0, notice: "Your session ended. Return to the workspace and sign in again." }); }
              else if (event === "TOKEN_REFRESHED") authTimer = setTimeout(() => connected.appearanceChanged(), 0);
            }).data.subscription;
          } catch { setPresence({ status: "offline", count: 0, notice: "The office connection is unavailable. Retry, or contact your workspace administrator if it continues." }); }
        },
        onError: fail,
      }, latestAppearance.current, true);
    }, fail);
    controls.current = controller;
    return () => { active = false; window.clearTimeout(timeout); clearTimeout(authTimer); authSubscription?.unsubscribe(); window.removeEventListener("pagehide", leave); network.current?.close(); network.current = null; controls.current = null; void controller.dispose(); };
  }, [attempt, officeId, chatEvents]);
  return <section aria-label="Interactive office" className="office-shell" data-panel={panel ?? "none"}>
    <header className="office-page-header">
      <div className="office-context"><p>{context.workspaceName}</p><h1>{context.officeName}</h1></div>
      <div className="office-connection" data-state={presence.status}>
        <p role="status" aria-live="polite"><span className="font-medium">{presence.status === "online" ? `Connected · ${presence.count} online` : presence.status === "connecting" ? "Connecting" : presence.status === "reconnecting" ? "Reconnecting" : presence.status === "denied" ? "Access denied" : "Disconnected"}</span>{presence.notice !== "Connected." && <> · {presence.notice}</>}</p>
        {presence.status === "offline" && <button className="office-control" onClick={() => { setStatus("loading"); setPresence({ status: "connecting", count: 0, notice: "Connecting to your office…" }); setAttempt((value) => value + 1); }}>Retry connection</button>}
      </div>
      <Link href={context.workspaceHref} className="auth-text-link office-back">Back to workspace</Link>
    </header>
    <nav id="office-controls" tabIndex={-1} aria-label="Office controls" className="office-toolbar">
      <div className="office-panel-controls">
        <AvatarSettings currentKey={avatarKey} displayName={displayName} panel={{ open: panel === "avatar", onOpenChange: avatarPanel, container: panelHost }} onSaved={(key, name) => { setSavedKey(key); if (name) setSavedName(name); network.current?.appearanceChanged(); }} />
        <Participants participants={participants} panel={{ open: panel === "participants", onOpenChange: participantsPanel, container: panelHost }} />
        <button ref={chatToggle} className="office-control" aria-expanded={chatOpen} aria-controls="office-chat" onClick={() => setPanel((value) => value === "chat" ? null : "chat")}>Office Chat</button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="office-availability" className="sr-only">Your availability</label><select id="office-availability" className="office-control" value={own?.availability ?? "AVAILABLE"} disabled={presence.status !== "online" || !own?.connected} onChange={(event) => { setAvailabilityError(""); const value = event.target.value; if (isAvailability(value) && !network.current?.setAvailability?.(value)) setAvailabilityError("Reconnect before changing availability."); }}><option value="AVAILABLE">Available</option><option value="BUSY">Busy</option><option value="DO_NOT_DISTURB">Do not disturb</option></select>
        <div ref={zoomControls} role="group" aria-label="Office zoom" hidden={compact && panel !== null} className="office-zoom">
        <button className="office-control" disabled={status !== "ready"} onClick={() => controls.current?.zoomBy(-1)} aria-label="Zoom out">−</button>
        <button className="office-control" disabled={status !== "ready"} onClick={() => controls.current?.resetZoom()}>Reset zoom</button>
        <button className="office-control" disabled={status !== "ready"} onClick={() => controls.current?.zoomBy(1)} aria-label="Zoom in">+</button>
        </div>
      </div>
    </nav>
    <div className={`office-work-area${chatOpen ? " chat-open" : ""}`}>
    <div inert={compact && panel !== null} className="office-world relative bg-ink">
      <div ref={host} tabIndex={0} role="region" aria-label="Pixel-art office. Keyboard movement area" aria-describedby="office-instructions"
        className="office-stage outline-offset-[-4px] focus-visible:outline-4 focus-visible:outline-forest" />
      {status !== "ready" && <div className="absolute inset-0 flex items-center justify-center bg-surface p-8 text-center">
        {status === "loading" ? <p role="status" className="text-sm text-muted">Preparing your office…</p> : <div><h2 className="font-semibold">Office unavailable</h2><p role="alert" className="mt-3 max-w-sm text-sm leading-7 text-muted">The office engine or artwork could not load. Check your connection and browser graphics support, then try again.</p><button className="auth-button mt-5" onClick={() => { setStatus("loading"); setAttempt((value) => value + 1); }}>Try again</button></div>}
      </div>}
    </div>
    <ChatPanel key={officeId} officeId={officeId} open={chatOpen} onClose={closeChat} events={chatEvents} userId={userId ?? own?.userId} names={names} send={sendChat} />
    <div ref={setPanelHost} className="office-panels" />
    </div>
    {voice?.zone && <VoiceBar key={voice.sessionId} officeId={officeId} state={voice} leave={leaveVoice} />}
    <footer className="office-status">
      <p id="office-instructions" className="office-instructions">Keyboard required: click or Tab into the office, then use WASD or arrows. Tab to leave.</p>
      {availabilityError && <p role="alert" className="ui-notice ui-notice-error">{availabilityError}</p>}
      {profileWarning && <p role="alert" className="ui-notice ui-notice-warning">{profileWarning}</p>}
    </footer>
  </section>;
}
