import type { AvatarAppearance, AvatarDirection } from "./avatars.ts";
export const TICK_MS = 50;
export const AUTH_CHECK_MS = 10_000;
export const AUTH_LEASE_MS = 15_000;
export const RECONNECT_SECONDS = 10;
export type MoveInput = { seq: number; x: number; y: number };
export type PlayerSnapshot = AvatarAppearance & {
  sessionId: string; userId: string; x: number; y: number;
  direction: AvatarDirection; isMoving: boolean; connected: boolean;
};
export type OfficeSnapshot = { officeId: string; mapVersion: string; players: Map<string, PlayerSnapshot> };
export type Presence = { status: "connecting" | "online" | "reconnecting" | "offline"; count: number; notice: string };
export type OfficeNetwork = {
  snapshot(): OfficeSnapshot | undefined;
  sessionId(): string | undefined;
  input(x: number, y: number): void;
  appearanceChanged(): void;
  close(): void;
};
export function validInput(value: unknown): value is MoveInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const input = value as MoveInput;
  return Object.keys(value).length === 3 && Number.isSafeInteger(input.seq) && input.seq >= 0 &&
    [-1, 0, 1].includes(input.x) && [-1, 0, 1].includes(input.y);
}
export function isId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
// Stable map fingerprint computed in both runtimes; not an auth primitive.
export function mapVersion(map: { width: number; height: number; layers: unknown[] }) {
  let hash = 2166136261;
  const source = JSON.stringify([map.width, map.height, map.layers]);
  for (let i = 0; i < source.length; i++) hash = Math.imul(hash ^ source.charCodeAt(i), 16777619);
  return `studio-${(hash >>> 0).toString(16)}`;
}
