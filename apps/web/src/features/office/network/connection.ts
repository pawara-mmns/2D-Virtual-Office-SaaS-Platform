import { Client, type Room, type SeatReservation } from "@colyseus/sdk";
import type { OfficeNetwork, OfficeSnapshot, Presence } from "../../../../../../packages/shared/src/protocol.ts";
import { protectReconnectUrl } from "../../../../../../packages/shared/src/socket-transport.ts";

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
}): OfficeNetwork {
  let room: OfficeRoom | undefined, state: OfficeSnapshot | undefined;
  let closed = false, online = false, seq = 0, previousCount = 0;
  let lastX = 0, lastY = 0, lastSent = 0;
  let disposeTransport: (() => void) | undefined;
  const controller = new AbortController();
  const presence = (status: Presence["status"], notice: string) => {
    if (!closed) options.onPresence({ status, notice, count: online && state ? [...state.players.values()].filter((p) => p.connected).length : 0 });
  };
  const credential = async () => {
    const token = await options.getToken();
    if (!closed && online && room && token) room.send("credential", token);
    else if (!token && !closed) { online = false; void room?.leave(); state = undefined; presence("offline", "Your session ended. Sign in and retry."); }
  };
  const open = async () => {
    try {
      presence("connecting", "Connecting to your office…");
      const token = await options.getToken();
      if (closed) return;
      if (!token) throw new Error();
      // Never set SDK auth.token: it appends the bearer to WebSocket URLs.
      const response = await fetch(`${options.url}/office/join`, {
        method: "POST", credentials: "omit", cache: "no-store",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ officeId: options.officeId, mapVersion: options.mapVersion }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]),
      });
      if (!response.ok) {
        const notice = response.status === 403 ? "Office access denied. Sign in and check your active membership." : response.status === 429 ? "Too many connection attempts. Wait a minute and retry." : "Unable to enter. Close other office tabs, check the server, wait ten seconds and retry.";
        presence("offline", notice); return;
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
        if (closed) return;
        if (next.officeId !== options.officeId || next.mapVersion !== options.mapVersion) { close(); options.onPresence({ status: "offline", count: 0, notice: "Office map changed. Reload this page." }); return; }
        state = next;
        const count = [...next.players.values()].filter((p) => p.connected).length;
        if (count !== previousCount) { const before = previousCount; previousCount = count; presence("online", count > before ? "A participant joined." : "A participant left."); }
      });
      room.onDrop(() => { online = false; presence("reconnecting", "Connection lost. Reconnecting…"); });
      room.onReconnect(() => { online = true; lastSent = 0; presence("online", "Reconnected."); void credential(); });
      room.onLeave(() => { online = false; state = undefined; presence("offline", "Disconnected. Verify your session and membership, then retry."); });
      room.onError(() => { online = false; presence("offline", "Office connection failed. Check access and retry."); });
      presence("online", "Connected.");
    } catch { if (!closed) presence("offline", "Could not connect. Check your session and the realtime server, then retry."); }
  };
  const close = () => {
    if (closed) return;
    closed = true; online = false; state = undefined; controller.abort(); clearInterval(refresh);
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
  };
}
