import { avatarBaseFrame, safeAvatarKey } from "../avatars/presets";
import type { Participant } from "../../../../../packages/shared/src/protocol.ts";
export function Participants({ participants }: { participants: Participant[] }) {
  return <details className="mt-4 border-t border-line pt-4 text-sm">
    <summary className="cursor-pointer font-medium">Participants ({participants.filter((person) => person.connected).length} online)</summary>
    {!participants.length ? <p className="mt-3 text-muted">No connected participants.</p> : <ul className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">{participants.map((person) => <li key={person.sessionId} className="flex items-center gap-3">
      <span aria-hidden="true" className="pixel-art shrink-0" style={{ width: 32, height: 32, backgroundImage: "url('/office/avatar.png')", backgroundPosition: `0 -${Math.floor(avatarBaseFrame(safeAvatarKey(person.avatarKey))/3)*32}px` }} />
      <div className="min-w-0"><p className="truncate font-medium">{person.displayName}</p><p className="text-xs leading-5 text-muted">{person.connected ? `Online · ${person.availability === "BUSY" ? "Busy" : person.availability === "DO_NOT_DISTURB" ? "Do not disturb" : "Available"}` : "Offline · reconnecting"}</p></div>
    </li>)}</ul>}
  </details>;
}
