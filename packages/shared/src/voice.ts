import { mapMarkers, TILE_SIZE, type OfficeMap } from "./map.ts";
import { sameBubbleRef, validBubbleRef, type BubbleRef } from './proximity.ts';
export type VoiceZoneState = { sessionId: string; zone: string | null; configured: boolean; participants: number | null; bubble?:BubbleRef };
export type VoiceAdmission = { url: string; token: string };
export function sameVoiceState(a: VoiceZoneState | null, b: VoiceZoneState | null): boolean {
  return a === b || !!a && !!b && a.sessionId === b.sessionId && a.zone === b.zone && a.configured === b.configured && a.participants === b.participants && sameBubbleRef(a.bubble,b.bubble);
}
export const VOICE_TOKEN_SECONDS = 30;
export const VOICE_LEASE_MS = 6000;
export function meetingZone(map: OfficeMap, x: number, y: number): string | null {
  const marker = mapMarkers(map).find((item) => item.name === "MEETING ROOM");
  const layer = map.layers.find((item) => item.type === "objectgroup" && item.name === "VoiceZones");
  if (!marker || layer?.type !== "objectgroup") return null;
  const zone = layer.objects.find((item) => item.type === "voice" && item.name === "Meeting Room");
  if (!zone || !zone.width || !zone.height || ![zone.x,zone.y,zone.width,zone.height].every((n) => Number.isInteger(n) && n % TILE_SIZE === 0) ||
    zone.x < 0 || zone.y < 0 || zone.x+zone.width > map.width*TILE_SIZE || zone.y+zone.height > map.height*TILE_SIZE) return null;
  // Whole 14x10 collision foot-body must be inside the same Tiled rectangle.
  return x-7 >= zone.x && x+7 < zone.x+zone.width && y+6 >= zone.y && y+16 < zone.y+zone.height ? zone.name : null;
}
export type VoiceRequest={officeId:string;sessionId:string}&Partial<BubbleRef>;
export function validVoiceRequest(value: unknown): value is VoiceRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>;
  return (Object.keys(input).sort().join(',')==='officeId,sessionId'||Object.keys(input).sort().join(',')==='bubbleId,generation,officeId,revision,sessionId'&&validBubbleRef({...input})) && typeof input.officeId === "string" && /^[0-9a-f-]{36}$/i.test(input.officeId) &&
    typeof input.sessionId === "string" && /^[A-Za-z0-9_-]{6,64}$/.test(input.sessionId);
}
