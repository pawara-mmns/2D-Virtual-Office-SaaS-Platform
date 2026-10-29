import { avatarBaseFrame, safeAvatarKey, avatarDisplayName } from "../avatars/presets";
import { OfficeDisclosure, type OfficePanelControl } from "@/components/office-disclosure";
import type { Participant } from "../../../../../packages/shared/src/protocol.ts";
export function Participants({ participants, panel, findable, onFind }: { participants: Participant[]; panel?: OfficePanelControl; findable?: ReadonlySet<string>; onFind?(sessionId: string): void }) {
  return <OfficeDisclosure label={`Participants (${participants.filter((person) => person.connected).length})`} panel={panel}>
    {!participants.length ? <p className="mt-3 text-sm text-muted">No connected participants.</p> : <ul className="mt-3 space-y-3">{participants.map((person) => <li key={person.sessionId} className="flex items-center gap-3">
      <span aria-hidden="true" className="pixel-art shrink-0" style={{ width: 32, height: 32, backgroundImage: "url('/office/avatar.png')", backgroundPosition: `0 -${Math.floor(avatarBaseFrame(safeAvatarKey(person.avatarKey))/3)*32}px` }} />
      <div className="min-w-0 flex-1"><p className="wrap-anywhere text-sm font-medium">{avatarDisplayName(person.displayName)}{person.isSelf ? " (you)" : ""}</p><p className="text-xs leading-5 text-muted">{person.connected ? `Online · ${person.availability === "BUSY" ? "Busy" : person.availability === "DO_NOT_DISTURB" ? "Do not disturb" : "Available"}` : "Offline · reconnecting"}</p>{onFind && !person.isSelf && !findable?.has(person.sessionId) && <p className="text-xs text-muted">Location unavailable</p>}</div>
      {onFind && !person.isSelf && <button type="button" className="office-control shrink-0" disabled={!person.connected || !findable?.has(person.sessionId)} aria-label={`Find ${avatarDisplayName(person.displayName)} in the office`} onClick={() => onFind(person.sessionId)}>Find</button>}
    </li>)}</ul>}
  </OfficeDisclosure>;
}
