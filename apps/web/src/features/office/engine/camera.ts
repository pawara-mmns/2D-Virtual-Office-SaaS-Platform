import type { OfficeSnapshot, PlayerSnapshot } from "../../../../../../packages/shared/src/protocol.ts";

export type CameraCommand = { type: "overview" } | { type: "self" } | { type: "area"; id: string } | { type: "teammate"; sessionId: string };
export type OfficeArea = { id: string; name: string; description: string };
export type NavigationState = {
  mode: "self" | "overview" | "area" | "teammate";
  areaId: string | null;
  fit: boolean;
  zoom: number;
  canZoomIn: boolean;
  canZoomOut: boolean;
  canReturn: boolean;
  areas: OfficeArea[];
  findable: string[];
  hint: string;
};

export function fitOfficeZoom(viewWidth: number, viewHeight: number, mapWidth: number, mapHeight: number) {
  if (![viewWidth, viewHeight, mapWidth, mapHeight].every((n) => Number.isFinite(n) && n > 0)) throw new Error("Invalid camera dimensions");
  const fit = Math.min(viewWidth / mapWidth, viewHeight / mapHeight);
  // Whole rendered tile sizes; nearest-neighbor overview scaling may be below
  // 1x. Never round upward and crop a map edge. Normal view levels are integers.
  return fit < 1 / 32 ? fit : Math.floor(fit * 32 + 1e-9) / 32;
}
export function zoomLevels(viewWidth: number, viewHeight: number, mapWidth: number, mapHeight: number) {
  const fit = fitOfficeZoom(viewWidth, viewHeight, mapWidth, mapHeight);
  const maximum = Math.max(4, Math.ceil(fit));
  return [...new Set([fit, ...Array.from({ length: maximum }, (_, i) => i + 1).filter((n) => n >= fit)])];
}
export function officeZoom(requested: number, viewWidth: number, viewHeight: number, mapWidth: number, mapHeight: number) {
  const levels = zoomLevels(viewWidth, viewHeight, mapWidth, mapHeight);
  const value = Number.isFinite(requested) ? requested : 2;
  return levels.reduce((best, level) => Math.abs(level - value) < Math.abs(best - value) ? level : best);
}
// Wheel zoom is continuous; buttons still select the original discrete levels.
export function clampOfficeZoom(requested: number, viewWidth: number, viewHeight: number, mapWidth: number, mapHeight: number) {
  const levels = zoomLevels(viewWidth, viewHeight, mapWidth, mapHeight);
  return Math.max(levels[0]!, Math.min(levels.at(-1)!, Number.isFinite(requested) ? requested : 2));
}
export function nextOfficeZoom(current: number, step: number, levels: readonly number[]) {
  if (!Number.isFinite(step) || !Math.trunc(step)) return current;
  const choices = step > 0 ? levels.filter((value) => value > current) : levels.filter((value) => value < current).toReversed();
  return choices[Math.min(choices.length, Math.abs(Math.trunc(step))) - 1] ?? current;
}
export function isMapPosition(value: { x: unknown; y: unknown } | undefined, width: number, height: number): value is { x: number; y: number } {
  return !!value && typeof value.x === "number" && typeof value.y === "number" && Number.isFinite(value.x) && Number.isFinite(value.y) && value.x >= 0 && value.y >= 0 && value.x <= width && value.y <= height;
}
export function findOfficeTeammate(snapshot: OfficeSnapshot | undefined, officeId: string | undefined, self: string | undefined, target: string, width: number, height: number): PlayerSnapshot | undefined {
  if (!officeId || !self || !snapshot || snapshot.officeId !== officeId || target === self) return;
  const own = snapshot.players.get(self), person = snapshot.players.get(target);
  if (!own?.connected || !person?.connected || !isMapPosition(own, width, height) || !isMapPosition(person, width, height)) return;
  return person;
}
