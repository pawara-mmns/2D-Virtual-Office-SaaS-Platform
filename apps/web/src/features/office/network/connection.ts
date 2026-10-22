import { Client, type Room, type SeatReservation } from "@colyseus/sdk";
import type { OfficeNetwork, OfficeSnapshot, Presence } from "../../../../../../packages/shared/src/protocol.ts";
import { protectReconnectUrl } from "../../../../../../packages/shared/src/socket-transport.ts";
import { decodeMessage, isAvailability, parseChatSend, type ChatEvent } from "../../../../../../packages/shared/src/chat.ts";
import type { Participant } from "../../../../../../packages/shared/src/protocol.ts";
import { sameVoiceState, type VoiceZoneState } from "../../../../../../packages/shared/src/voice.ts";

type OfficeRoom = Room<object, OfficeSnapshot>;
export function realtimeUrl(value: string | undefined, production = process.env.NODE_ENV === "production") {
  if (!value) throw new Error("Realtime is not configured. Set NEXT_PUBLIC_REALTIME_URL and start the realtime server.");
  const url = new URL(value);
  if (url.origin !== value || !["http:", "https:"].includes(url.protocol) || url.username || url.password || production && url.protocol !== "https:") throw new Error("Use an exact realtime HTTP origin; HTTPS in production.");
  return url.origin;
}
export function connectOffice(options: {
  url: string; officeId: string; mapVersion: string;
  getToken(): Promise<string | null>; onPresence(presence: Presence): void;
  onChat?(event: ChatEvent): void;
  onParticipants?(participants: Participant[]): void;
  onAvailabilityError?(message: string): void;
  onVoice?(state: VoiceZoneState | null): void;
}): OfficeNetwork {
  let room: OfficeRoom | undefined, state: OfficeSnapshot | undefined;
  let closed = false, denied = false, online = false, seq = 0, previousCount = 0;
  let lastX = 0, lastY = 0, lastSent = 0;
  let disposeTransport: (() => void) | undefined;
  let participantKey = "", chatReady = false;
  let voiceState: VoiceZoneState | null = null;
  const publishVoice = (value: VoiceZoneState | null) => {
    if (sameVoiceState(voiceState,value)) return;
    voiceState = value ? { sessionId:value.sessionId,zone:value.zone,configured:value.configured,participants:value.participants } : null;
    options.onVoice?.(voiceState);
  };
  const disconnected = () => { chatReady = false; options.onChat?.({ type: "connection", online: false }); options.onParticipants?.([]); publishVoice(null); participantKey = ""; };
  const controller = new AbortController();
  const presence = (status: Presence["status"], notice: string) => {
    if (!closed) options.onPresence({ status, notice, count: online && state ? [...state.players.values()].filter((p) => p.connected).length : 0 });
  };
  const credential = async () => {
    if (closed || denied) return;
    const token = await options.getToken();
    if (!closed && online && room && token) room.send("credential", token);
    else if (!token && !closed) { denied = true; online = false; clearInterval(refresh); if (room) room.reconnection.enabled = false; void room?.leave(); state = undefined; disconnected(); presence("denied", "Your session ended. Return to the workspace and sign in again."); }
  };
  const open = async () => {
    try {
      presence("connecting", "Connecting to your office…");
      const token = await options.getToken();
      if (closed) return;
      if (!token) { denied = true; clearInterval(refresh); presence("denied", "Sign in with a verified account before entering the office."); return; }
      // Never set SDK auth.token: it appends the bearer to WebSocket URLs.
      const response = await fetch(`${options.url}/office/join`, {
        method: "POST", credentials: "omit", cache: "no-store",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ officeId: options.officeId, mapVersion: options.mapVersion }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]),
      });
      if (!response.ok) {
        denied = response.status === 401 || response.status === 403;
        clearInterval(refresh);
        const notice = denied ? "Office access denied. Sign in and check your active membership." : response.status === 429 ? "Too many connection attempts. Wait a minute and retry." : "Unable to enter. Close other office tabs, check the server, wait ten seconds and retry.";
        presence(denied ? "denied" : "offline", notice); return;
      }
      const reservation: SeatReservation = await response.json();
      if (closed) return;
      const client = new Client(options.url, { urlBuilder(url) {
        // Also discard a cached SDK-auth credential from an unrelated prior use
        // of this browser origin. Supabase exclusively owns authentication here.
        url.searchParams.delete("_authToken"); url.searchParams.delete("reconnectionToken");
        return url.toString();
      } });
      const joined = await client.consumeSeatReservation<OfficeSnapshot>(reservation);
      if (closed) { void joined.leave(); return; }
      room = joined;
      disposeTransport = protectReconnectUrl(room.connection);
      room.reconnection.minUptime = 0;
      room.reconnection.maxRetries = 6;
      room.reconnection.maxDelay = 2000;
      room.reconnection.maxEnqueuedMessages = 0;
      online = true;
      room.onStateChange((next) => {
        if (closed || denied) return;
        if (next.officeId !== options.officeId || next.mapVersion !== options.mapVersion) { close(); options.onPresence({ status: "offline", count: 0, notice: "Office map changed. Reload this page." }); return; }
        state = next;
        if (!chatReady && online) { chatReady = true; options.onChat?.({ type: "connection", online: true }); }
        const participants = [...next.players.values()];
        // Positions never enter React. Notify only when participant presentation
        // changes, not on the high-frequency movement patches.
        const key = JSON.stringify(participants.map((p) => [p.sessionId,p.userId,p.displayName,p.avatarKey,p.connected,p.availability]));
        if (key !== participantKey) { participantKey = key; options.onParticipants?.(participants.map((p) => ({ sessionId: p.sessionId, userId: p.userId, displayName: p.displayName, avatarKey: p.avatarKey, connected: p.connected, availability: isAvailability(p.availability) ? p.availability : "AVAILABLE", isSelf: p.sessionId === room?.sessionId }))); }
        const count = [...next.players.values()].filter((p) => p.connected).length;
        if (count !== previousCount) { const before = previousCount; previousCount = count; presence("online", count > before ? "A participant joined." : "A participant left."); }
      });
      room.onMessage("chat.message", (value: unknown) => { if (!closed && online) try { options.onChat?.({ type: "message", message: decodeMessage(value) }); } catch { options.onChat?.({ type: "error", clientMessageId: null, code: "UNAVAILABLE" }); } });
      room.onMessage("chat.error", (value: { code?: unknown; clientMessageId?: unknown }) => {
        if (closed) return;
        const code = value?.code === "INVALID" || value?.code === "RATE_LIMIT" || value?.code === "DENIED" ? value.code : "UNAVAILABLE";
        options.onChat?.({ type: "error", code, clientMessageId: typeof value?.clientMessageId === "string" ? value.clientMessageId : null });
      });
      room.onMessage("availability.error", () => options.onAvailabilityError?.("Availability could not change. Wait a moment, check access and retry."));
      room.onMessage("voice.state", (value: VoiceZoneState) => {
        if (!closed && online && value?.sessionId === room?.sessionId && (value.zone === null || value.zone === "Meeting Room") && typeof value.configured === "boolean" &&
          (value.participants === null || Number.isInteger(value.participants) && value.participants >= 0 && value.participants <= 10)) publishVoice(value);
      });
      room.onDrop(() => { if (closed || denied) return; online = false; disconnected(); presence("reconnecting", "Connection lost. Reconnecting…"); });
      room.onReconnect(() => { if (closed || denied) return; online = true; lastSent = 0; presence("online", "Reconnected."); void credential(); });
      room.onLeave((code) => { if (closed) return; denied ||= code === 4000; online = false; state = undefined; disconnected(); clearInterval(refresh); if (denied && room) room.reconnection.enabled = false; presence(denied ? "denied" : "offline", denied ? "Office access ended. Return to the workspace and check your membership." : "Disconnected. Verify your session and membership, then retry."); });
      room.onError((code) => { if (closed) return; denied ||= code === 401 || code === 403; online = false; disconnected(); if (denied) { clearInterval(refresh); if (room) room.reconnection.enabled = false; } presence(denied ? "denied" : "offline", denied ? "Office access denied. Return to the workspace and check your membership." : "Office connection failed. Check access and retry."); });
      presence("online", "Connected.");
    } catch { if (!closed) presence("offline", "Could not connect. Check your session and the realtime server, then retry."); }
  };
  const close = () => {
    if (closed) return;
    closed = true; online = false; state = undefined; controller.abort(); clearInterval(refresh);
    disconnected();
    if (room) { room.reconnection.enabled = false; void room.leave(); disposeTransport?.(); room.removeAllListeners(); }
  };
  // getSession refreshes expired browser tokens; authorization remains server-side.
  const refresh = setInterval(() => { void credential().catch(() => {}); }, 10_000);
  void open();
  return {
    snapshot: () => online ? state : undefined,
    sessionId: () => room?.sessionId,
    input(x, y) {
      if (!online || !room || closed) return;
      const now = performance.now();
      if (now - lastSent < 50 || x === lastX && y === lastY && now - lastSent < 100) return;
      lastX = x; lastY = y; lastSent = now;
      room.send("input", { seq: seq++, x: Math.sign(x), y: Math.sign(y) });
    },
    appearanceChanged() { void credential().catch(() => {}); },
    close,
    sendChat(body, clientMessageId) { if (closed || !online || !chatReady || !room || !parseChatSend({ body, clientMessageId })) return false; room.send("chat.send", { body, clientMessageId }); return true; },
    setAvailability(status) { if (closed || !online || !room || !isAvailability(status)) return false; room.send("availability.set", { status }); return true; },
    leaveVoice() { if (!closed && online) room?.send("voice.leave"); },
  };
}
