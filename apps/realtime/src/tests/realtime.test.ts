import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { matchMaker } from "colyseus";
import { createRealtimeServer } from "../server.ts";
import { AccessDenied, type Authorize, type Authorization } from "../auth/authorize.ts";
import { validateOfficeMap } from "../../../../packages/shared/src/map.ts";
import { mapVersion, AUTH_LEASE_MS } from "../../../../packages/shared/src/protocol.ts";
import type { OfficeState } from "../state/office-state.ts";
import type { Room as SDKRoomType } from "@colyseus/sdk";
import { createRequire } from "node:module";
import { protectReconnectUrl } from "../../../../packages/shared/src/socket-transport.ts";

// Real HTTP/WebSockets and Schema synchronization; synthetic authorization only.
// Never contacts Supabase or represents live-account validation.
const nativeWebSocket = globalThis.WebSocket;
globalThis.WebSocket = undefined as unknown as typeof WebSocket;
const { Client } = await import("@colyseus/sdk");
globalThis.WebSocket = nativeWebSocket;
const require = createRequire(import.meta.url);
const requireSDK = createRequire(require.resolve("@colyseus/sdk"));
const NodeSocket = requireSDK("ws") as typeof WebSocket;
type SDKRoom = SDKRoomType<object, OfficeState>;
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const map = validateOfficeMap(JSON.parse(readFileSync(new URL("../../../web/public/office/studio.json", import.meta.url), "utf8")));
const origin = "http://localhost:3000";
async function until(check: () => boolean, message: string, timeout = 6000) {
  const start = Date.now(); while (!check()) { if (Date.now() - start > timeout) throw new Error(`Timed out: ${message}`); await delay(20); }
}
test("real transport: canonical tenants, authority, presence, capacity, reconnect and revocation", { timeout: 45_000 }, async () => {
  const removed = new Set<number>();
  const authorize: Authorize = async (token, officeId) => {
    const n = typeof token === "string" && /^fixture-\d+$/.test(token) ? Number(token.slice(8)) : 0;
    const allowedOffice = n >= 20 ? id(102) : id(101);
    if (!n || n === 98 || removed.has(n) || officeId !== allowedOffice) throw new AccessDenied();
    return { userId: id(n), organizationId: n >= 20 ? id(202) : id(201), officeId: allowedOffice, token: String(token),
      expiresAt: Date.now() + 60_000, checkedAt: Date.now(), displayName: `Member ${n}`, avatarKey: n === 2 ? "slate" : "fern" };
  };
  const server = createRealtimeServer({ authorize, map, origins: [origin] });
  const rooms: SDKRoom[] = [];
  await server.listen(0, "127.0.0.1");
  const address = server.transport.server!.address(); assert.ok(address && typeof address === "object");
  const url = `http://127.0.0.1:${address.port}`;
  const reserve = (n: number | string, officeId = id(101), overrides: object = {}, requestOrigin = origin) => fetch(`${url}/office/join`, {
    method: "POST", headers: { Origin: requestOrigin, "Content-Type": "application/json", Authorization: `Bearer ${typeof n === "number" ? `fixture-${n}` : n}` },
    body: JSON.stringify({ officeId, mapVersion: mapVersion(map), ...overrides }),
  });
  const join = async (n: number, officeId = id(101)) => {
    const response = await reserve(n, officeId); assert.equal(response.status, 200);
    const client = new Client(url, { headers: { Origin: origin } });
    const room = await client.consumeSeatReservation<OfficeState>(await response.json());
    protectReconnectUrl(room.connection, (address, protocol) => {
      const query = new URL(address).searchParams;
      assert.equal(query.has("reconnectionToken"), false); assert.equal(query.has("_authToken"), false);
      // The ws Node constructor supports headers; production uses native WebSocket.
      const Socket = NodeSocket as unknown as new (address: string, protocol: string, options: { headers: { Origin: string } }) => WebSocket;
      return new Socket(address, protocol, { headers: { Origin: origin } });
    });
    rooms.push(room); await until(() => !!room.state?.players?.get(room.sessionId), "first state"); return room;
  };
  try {
    assert.equal((await reserve(1, id(101), {}, "https://untrusted.example")).status, 403);
    for (const token of ["", "invalid", "fixture-98"]) assert.equal((await reserve(token)).status, 403);
    assert.equal((await reserve(1, id(102))).status, 403);
    assert.equal((await reserve(1, id(101), { userId: id(2) })).status, 400);
    assert.equal((await reserve(1, id(101), { mapVersion: "wrong" })).status, 409);
    for (const method of ["create", "joinOrCreate", "join", "joinById", "reconnect"]) {
      const response = await fetch(`${url}/matchmake/${method}/office`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      assert.ok(!response.ok, `Default ${method} must be disabled`);
    }
    // Concurrent HTTP reservations and real socket joins share exactly one room.
    const [a, b] = await Promise.all([join(1), join(2)]);
    assert.equal(a.roomId, b.roomId);
    await until(() => a.state.players.size === 2 && b.state.players.size === 2, "presence joins");
    assert.equal(a.state.players.get(b.sessionId)!.avatarKey, "slate");
    assert.equal("token" in a.state.players.get(a.sessionId)!, false);
    assert.equal("email" in a.state.players.get(a.sessionId)!, false);
    assert.equal((await reserve(1)).status, 409);
    const c = await join(20, id(102));
    assert.notEqual(c.roomId, a.roomId); assert.equal(c.state.players.size, 1);
    assert.equal([...c.state.players.values()].some((p) => p.userId === id(1)), false);
    const startY = a.state.players.get(a.sessionId)!.y;
    let stateUpdates = 0; a.onStateChange(() => stateUpdates++);
    const began = performance.now();
    a.send("input", { seq: 1, x: 0, y: -1 });
    await until(() => b.state.players.get(a.sessionId)!.y < startY - 1, "remote authoritative movement");
    const latency = performance.now() - began;
    assert.ok(startY - b.state.players.get(a.sessionId)!.y <= 30, "Movement bounded by fixed simulation speed");
    a.send("input", { seq: 0, x: 0, y: 1 });
    await delay(80); assert.ok(a.state.players.get(a.sessionId)!.y < startY, "Stale input ignored");
    a.send("input", { seq: 2, x: 0, y: 0 });
    await delay(100);
    const stableY = a.state.players.get(a.sessionId)!.y;
    await delay(300); assert.equal(a.state.players.get(a.sessionId)!.y, stableY);
    // Reconnection uses current 0.18 onDrop/allowReconnection/onReconnect.
    a.reconnection.minUptime = 0; a.reconnection.maxRetries = 4; a.reconnection.maxDelay = 400;
    let reconnects = 0; a.onReconnect(() => reconnects++);
    a.connection.close(4010);
    await until(() => reconnects === 1, "safe reconnection");
    await until(() => a.state.players.get(a.sessionId)?.connected === true, "reconnected state");
    assert.equal(a.state.players.size, 2); assert.equal(a.state.players.get(a.sessionId)!.y, stableY);
    // Fill the canonical room. Joining an eleventh never spawns another room.
    for (let n = 3; n <= 10; n++) assert.equal((await join(n)).roomId, a.roomId);
    await until(() => a.state.players.size === 10, "capacity");
    assert.equal((await reserve(11)).status, 409);
    assert.equal((await matchMaker.query({ name: "office" })).length, 2);
    // Measure actual server ticks and decoded WebSocket payload bytes with ten
    // players; excludes TLS/TCP framing and is not an internet benchmark.
    const measuredRoom = matchMaker.getLocalRoomById(a.roomId);
    const localMetrics = measuredRoom as unknown as { simulationTicks: number; simulationWorkMs: number };
    const ticksBefore = localMetrics.simulationTicks, workBefore = localMetrics.simulationWorkMs;
    let bytes = 0, packets = 0;
    const onmessage = a.connection.events.onmessage;
    a.connection.events.onmessage = (event: MessageEvent<ArrayBuffer>) => { bytes += event.data.byteLength; packets++; onmessage?.(event); };
    const measureStart = performance.now();
    const movingRooms = rooms.filter((room) => room.roomId === a.roomId);
    const heartbeat = setInterval(() => { for (const room of movingRooms) room.send("input", { seq: ++sequence, x: -1, y: 0 }); }, 100);
    let sequence = 100;
    await delay(1200); clearInterval(heartbeat);
    for (const room of movingRooms) room.send("input", { seq: ++sequence, x: 0, y: 0 });
    a.connection.events.onmessage = onmessage;
    const measuredSeconds = (performance.now() - measureStart) / 1000;
    const tickCount = localMetrics.simulationTicks - ticksBefore;
    assert.ok(tickCount >= 20 && tickCount <= 28, "Measured server cadence is near 20Hz");
    const measured = { seconds: Number(measuredSeconds.toFixed(3)), ticks: tickCount, tickHz: Number((tickCount / measuredSeconds).toFixed(1)),
      meanTickWorkMs: Number(((localMetrics.simulationWorkMs - workBefore) / tickCount).toFixed(3)),
      receivedPayloadBytes: bytes, packets, payloadBytesPerSecondOneObserver: Math.round(bytes / measuredSeconds) };
    // Invalid coordinates/NaN/teleport requests close their connection, no state mutation.
    const invalid = rooms.find((r) => (r.state as OfficeState)?.players?.get(r.sessionId)?.userId === id(10))!;
    invalid.send("input", { seq: 4, x: 99999, y: 0 });
    await until(() => !a.state.players.has(invalid.sessionId), "invalid input disconnect");
    const flooding = rooms.find((room) => room.state?.players.get(room.sessionId)?.userId === id(9))!;
    for (let seq = 1000; seq < 1040; seq++) flooding.send("input", { seq, x: 0, y: 0 });
    await until(() => !a.state.players.has(flooding.sessionId), "excess movement rate disconnected");
    // Server-side removal is enforced without a client voluntarily leaving.
    removed.add(2);
    const local = matchMaker.getLocalRoomById(a.roomId);
    await until(() => !a.state.players.has(b.sessionId), "periodic membership revocation enforcement", 14_900);
    assert.equal((await reserve(2)).status, 403);
    // Reconnect cannot revive a revoked membership.
    removed.add(1); a.connection.close(4010);
    await until(() => !(local.state as OfficeState).players.has(a.sessionId), "revoked reconnection rejection", 14_000);
    // Explicit leave releases a player immediately (rather than counting a stale tab).
    await c.leave(); await until(() => !matchMaker.getLocalRoomById(c.roomId) || !(matchMaker.getLocalRoomById(c.roomId).state as OfficeState).players.has(c.sessionId), "leave cleanup");
    // Hard expiry does not depend on a successful refresh request.
    const leaseClient = local.clients.find((client) => client.auth?.userId === id(8))!;
    (leaseClient.auth as Authorization).checkedAt = Date.now() - AUTH_LEASE_MS;
    await until(() => !(local.state as OfficeState).players.has(leaseClient.sessionId), "hard authorization lease expiry");
    console.info(JSON.stringify({ scope: "isolated real transport, synthetic auth", firstRemoteMovementMs: Math.round(latency), stateUpdatesDuringScenario: stateUpdates, configuredTickHz: 20, twoTenantRooms: true, tenPlayerMeasurement: measured }));
  } finally {
    for (const room of rooms) { room.reconnection.enabled = false; if (room.connection.isOpen) await room.leave(); room.removeAllListeners(); }
    await server.gracefullyShutdown(false);
  }
});
