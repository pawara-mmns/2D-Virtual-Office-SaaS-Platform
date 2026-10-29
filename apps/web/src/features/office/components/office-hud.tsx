"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import type { Presence } from "../../../../../../packages/shared/src/protocol.ts";

export type OfficeContext = { workspaceName: string; officeName: string; workspaceHref: string };

// Presentation only. The office owns selection, subscriptions, renderer and
// media; responsive CSS never moves or replaces a mounted feature component.
export function OfficeHud({ context, presence, retry, settings, controls, camera, panels, voice, notices }: {
  context: OfficeContext; presence: Presence; retry(): void;
  settings: ReactNode; controls: ReactNode; camera: ReactNode;
  panels: ReactNode; voice: ReactNode; notices: ReactNode;
}) {
  const connection = presence.status === "online" ? `Connected · ${presence.count} online`
    : presence.status === "connecting" ? "Connecting" : presence.status === "reconnecting" ? "Reconnecting"
    : presence.status === "denied" ? "Access denied" : "Disconnected";
  return <div className="office-hud">
    <header className="office-page-header">
      <div className="office-identity">
        <div className="office-context"><p>{context.workspaceName}</p><h1>{context.officeName}</h1></div>
        <div className="office-connection" data-state={presence.status}>
          <p role="status"><span className="office-connection-dot" aria-hidden="true" />{connection}{presence.notice !== "Connected." && <> · {presence.notice}</>}</p>
          {presence.status === "offline" && <button className="office-control" onClick={retry}>Retry connection</button>}
        </div>
      </div>
      <div className="office-hud-actions">
        {settings}
        <Link href={context.workspaceHref} className="office-control office-back" aria-label="Back to workspace">Exit<span className="office-exit-detail">to workspace</span></Link>
      </div>
    </header>
    <div className="office-hud-body">
      <nav id="office-controls" tabIndex={-1} aria-label="Office controls" className="office-toolbar">
        <div className="office-panel-controls">{controls}</div>
      </nav>
      {camera}
      <div className="office-hud-panels">{panels}</div>
    </div>
    <div className="office-hud-bottom">
      {notices}
      <div className="office-voice-dock">{voice}</div>
    </div>
  </div>;
}
