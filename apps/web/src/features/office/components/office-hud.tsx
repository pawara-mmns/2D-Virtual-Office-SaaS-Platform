"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { HudGlass } from "./hud-glass";
import { GlassSurface } from "./glass-surface";
import { HudIcon } from "@/components/hud-icon";
import type { Presence } from "../../../../../../packages/shared/src/protocol.ts";

export type OfficeContext = { workspaceName: string; officeName: string; workspaceHref: string };

// Presentation only. The office owns selection, subscriptions, renderer and
// media; responsive CSS never moves or replaces a mounted feature component.
export function OfficeHud({ context, presence, reducedEffects, retry, settings, controls, camera, panels, voice, notices }: {
  context: OfficeContext; presence: Presence; retry(): void;
  settings: ReactNode; controls: ReactNode; camera: ReactNode;
  panels: ReactNode; voice: ReactNode; notices: ReactNode;
  reducedEffects?: boolean;
}) {
  const connection = presence.status === "online" ? `Connected · ${presence.count} online`
    : presence.status === "connecting" ? "Connecting" : presence.status === "reconnecting" ? "Reconnecting"
    : presence.status === "denied" ? "Access denied" : "Disconnected";
  return <HudGlass reducedEffects={reducedEffects}>
    <header className="office-page-header">
      <GlassSurface className="office-identity" variant="regular">
        <div className="office-context"><p>{context.workspaceName}</p><h1>{context.officeName}</h1></div>
        <div className="office-connection" data-state={presence.status}>
          <p role="status"><span className="office-connection-dot" aria-hidden="true" />{connection}{presence.notice !== "Connected." && <> · {presence.notice}</>}</p>
          {presence.status === "offline" && <button className="office-control" onClick={retry}>Retry connection</button>}
        </div>
      </GlassSurface>
      <GlassSurface className="office-hud-actions" variant="clear">
        {settings}
        <Link href={context.workspaceHref} className="office-control office-back" aria-label="Back to workspace"><HudIcon name="exit" /><span>Exit<span className="office-exit-detail">to workspace</span></span></Link>
      </GlassSurface>
    </header>
    <div className="office-hud-body">
      <GlassSurface as="nav" id="office-controls" tabIndex={-1} aria-label="Office controls" className="office-toolbar" variant="clear">
        <div className="office-panel-controls"><span className="office-dock-selection" aria-hidden="true" />{controls}</div>
      </GlassSurface>
      {camera}
      <div className="office-hud-panels">{panels}</div>
    </div>
    <div className="office-hud-bottom">
      {notices}
      <GlassSurface className="office-voice-dock" variant="regular">{voice}</GlassSurface>
    </div>
  </HudGlass>;
}
