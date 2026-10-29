"use client";
import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from "react";
import Link from "next/link";
import { HudGlass } from "./hud-glass";
import { GlassSurface } from "./glass-surface";
import { HudIcon } from "@/components/hud-icon";
import { avatarPresets, type AvatarKey } from "@/features/avatars/presets";
import type { Presence } from "../../../../../../packages/shared/src/protocol.ts";
export type OfficeContext = { workspaceName: string; officeName: string; workspaceHref: string };

// Layout owns no renderer, transport or media state. Features retain their
// mounted owners while their triggers move into progressively disclosed groups.
export function OfficeHud({ context, presence, displayName, avatarKey, profileToggle, onMenuOpen, reducedEffects, retry, settings, avatar, controls, camera, panels, voice, notices }: {
  context: OfficeContext; presence: Presence; displayName: string; avatarKey: AvatarKey;
  profileToggle: RefObject<HTMLButtonElement | null>; onMenuOpen(): void; retry(): void;
  settings: ReactNode; avatar: ReactNode; controls: ReactNode; camera: ReactNode;
  panels: ReactNode; voice: ReactNode; notices: ReactNode; reducedEffects?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();
  const connection = presence.status === "online" ? "Connected" : presence.status === "connecting" ? "Connecting" : presence.status === "reconnecting" ? "Reconnecting" : presence.status === "denied" ? "Access denied" : "Disconnected";
  const preview = avatarPresets.find(preset => preset.key === avatarKey)!;
  const close = () => { setMenuOpen(false); profileToggle.current?.focus({ preventScroll: true }); };
  useEffect(() => {
    if (!menuOpen) return;
    const dismiss = (event: PointerEvent) => { if (event.target instanceof Node && !menu.current?.contains(event.target) && !profileToggle.current?.contains(event.target)) setMenuOpen(false); };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [menuOpen, profileToggle]);
  return <HudGlass reducedEffects={reducedEffects}>
    <header className="office-page-header">
      <GlassSurface as="nav" id="office-controls" tabIndex={-1} aria-label="Office controls" className="office-toolbar" variant="clear" onClick={() => setMenuOpen(false)}>
        <div className="office-panel-controls"><span className="office-dock-selection" aria-hidden="true" />{controls}</div>
      </GlassSurface>
      <GlassSurface className="office-voice-dock" variant="regular">{voice}</GlassSurface>
      <div className="office-profile" onKeyDown={event => { if (event.key === "Escape" && menuOpen) { event.preventDefault(); event.stopPropagation(); close(); } }}>
        <GlassSurface className="office-identity" variant="regular">
          <button ref={profileToggle} type="button" className="office-profile-trigger office-control" aria-label="Profile and workspace" aria-expanded={menuOpen} aria-controls={id} title={context.workspaceName + " / " + context.officeName}
            onClick={() => { if (!menuOpen) onMenuOpen(); setMenuOpen(!menuOpen); }}
            onKeyDown={event => { if (event.key === "ArrowDown") { event.preventDefault(); onMenuOpen(); setMenuOpen(true); requestAnimationFrame(() => menu.current?.querySelector<HTMLButtonElement>("button")?.focus()); } }}>
            <span aria-hidden="true" className="office-profile-avatar pixel-art" style={{ backgroundImage: "url('/office/avatar.png')", backgroundPosition: `0 -${preview.index * 128}px` }} />
            <span className="office-profile-name">{displayName}</span><span className="office-connection-dot" data-state={presence.status} aria-hidden="true" /><HudIcon name="chevron" />
          </button>
          <div className="office-context sr-only"><p>{context.workspaceName}</p><h1>{context.officeName}</h1></div>
        </GlassSurface>
        <div ref={menu} id={id} role="group" hidden={!menuOpen} inert={!menuOpen} className="office-profile-menu" aria-label="Profile and workspace actions" data-glass-surface="" data-glass-variant="elevated">
          <div className="office-workspace-info"><p>{context.workspaceName}</p><strong>{context.officeName}</strong><span>{connection} / {presence.count} online</span></div>
          <div className="office-profile-actions" onClick={event => { if ((event.target as Element).closest("button[aria-controls]")) setMenuOpen(false); }}>{avatar}{settings}</div>
          <Link href={context.workspaceHref} className="office-control office-back" aria-label="Back to workspace"><HudIcon name="exit" /><span>Exit workspace</span></Link>
        </div>
      </div>
    </header>
    <div className="office-hud-body">{camera}<div className="office-hud-panels">{panels}</div></div>
    <div className="office-hud-bottom">
      <GlassSurface className="office-connection" variant="regular" data-state={presence.status}>
        <p role="status" title={presence.notice}><span className="office-connection-dot" aria-hidden="true" />{connection}</p>
        {presence.status === "offline" && <button className="office-control" onClick={retry}>Retry connection</button>}
        {presence.status !== "online" && presence.status !== "connecting" && <span className="office-connection-detail">{presence.notice}</span>}
      </GlassSurface>
      {notices}
    </div>
  </HudGlass>;
}
