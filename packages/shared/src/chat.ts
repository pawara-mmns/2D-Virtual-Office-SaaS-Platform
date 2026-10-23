import { isId } from "./protocol.ts";
import { avatarDisplayName } from "./avatars.ts";
export const availabilityOptions = ["AVAILABLE", "BUSY", "DO_NOT_DISTURB"] as const;
export type Availability = typeof availabilityOptions[number];
export type ChatMessage = { id: string; channelId: string; senderId: string; senderName: string; body: string; clientMessageId: string; createdAt: string };
export type ChatPage = { messages: ChatMessage[]; olderCursor: string | null };
export type ChatErrorCode = "INVALID" | "RATE_LIMIT" | "UNAVAILABLE" | "DENIED";
export type ChatEvent = { type: "message"; message: ChatMessage } | { type: "error"; clientMessageId: string | null; code: ChatErrorCode } | { type: "connection"; online: boolean };
export type ChatSend = { body: string; clientMessageId: string };
export function isAvailability(value: unknown): value is Availability { return availabilityOptions.includes(value as Availability); }
export function normalizeBody(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 4000) return null;
  const body = value.replace(/\r\n?/g, "\n").trim();
  if (!body || [...body].length > 2000 || new TextEncoder().encode(body).length > 8000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(body)) return null;
  return body;
}
export function parseChatSend(value: unknown): ChatSend | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as ChatSend;
  const body = normalizeBody(data.body);
  return Object.keys(value).length === 2 && body && isId(data.clientMessageId) ? { body, clientMessageId: data.clientMessageId } : null;
}
export function validCursor(value: unknown): value is string { return typeof value === "string" && /^[1-9][0-9]{0,18}$/.test(value) && BigInt(value) <= BigInt("9223372036854775807"); }
export function compareMessages(a: ChatMessage, b: ChatMessage) { return a.id.length - b.id.length || a.id.localeCompare(b.id); }
export function mergeMessages(current: ChatMessage[], incoming: ChatMessage[], newest = true) {
  const unique = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) unique.set(message.id, message);
  const ordered = [...unique.values()].sort(compareMessages);
  return newest ? ordered.slice(-150) : ordered.slice(0, 150);
}
export function decodeMessage(value: unknown): ChatMessage {
  if (!value || typeof value !== "object") throw new Error("Invalid chat response");
  const message = value as ChatMessage;
  if (!validCursor(message.id) || !isId(message.channelId) || !isId(message.senderId) || !isId(message.clientMessageId) ||
    normalizeBody(message.body) !== message.body || typeof message.createdAt !== "string" || !Number.isFinite(Date.parse(message.createdAt))) throw new Error("Invalid chat response");
  const name = avatarDisplayName(message.senderName);
  return { id: message.id, channelId: message.channelId, senderId: message.senderId, senderName: name,
    body: message.body, createdAt: message.createdAt, clientMessageId: message.clientMessageId };
}
export function decodePage(value: unknown): ChatPage {
  if (!Array.isArray(value) || value.length > 31) throw new Error("Invalid chat history");
  const page = value.slice(0, 30).map(decodeMessage).sort(compareMessages);
  return { messages: page, olderCursor: value.length > 30 ? page[0]!.id : null };
}
