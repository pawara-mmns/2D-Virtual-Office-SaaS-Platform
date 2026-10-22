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
import { ChatFailure, type ChatStore } from "../chat/store.ts";
import type { ChatMessage } from "../../../../packages/shared/src/chat.ts";
import { createVoiceService } from "../voice/service.ts";
import type { VoiceProvider } from "../voice/provider.ts";
import type { VoiceZoneState } from "../../../../packages/shared/src/voice.ts";

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
  const committed = new Map<string, ChatMessage>();
  let failNext = false, storeCalls = 0;
  const chat: ChatStore = { async send(auth, input) {
    storeCalls++;
    if (failNext) { failNext = false; throw new ChatFailure("UNAVAILABLE"); }
    const key = `${auth.userId}/${input.clientMessageId}`;
    const previous = committed.get(key); if (previous) return { message: previous, inserted: false };
    await delay(15);
    const message: ChatMessage = { id: String(committed.size+1), channelId: auth.officeId, senderId: auth.userId, senderName: auth.displayName,
      body: input.body, clientMessageId: input.clientMessageId, createdAt: new Date().toISOString() };
    committed.set(key, message); return { message, inserted: true };
  } };
  const voiceTokens: {room:string;identity:string}[] = [], voiceRemoved: {identity:string;cutoff:bigint}[] = [];
  const mediaMembers = new Map<string,Set<string>>();
  const voiceProvider: VoiceProvider = { url:"wss://voice-fixture.livekit.cloud",prefix:"fixture_",room:(auth)=>`fixture_${auth.organizationId}_${auth.officeId}`,
    async token(_auth,room,identity){voiceTokens.push({room,identity});return "synthetic-media-token";},
    async rooms(){return [...mediaMembers.keys()];}, async participants(room){return [...(mediaMembers.get(room)??[])];},
    async remove(room,identity,cutoff){voiceRemoved.push({identity,cutoff});mediaMembers.get(room)?.delete(identity);},
  };
  const voice = createVoiceService(authorize,voiceProvider); await voice.poll();
  const voiceStates = new Map<string,VoiceZoneState>();
  const server = createRealtimeServer({ authorize, map, origins: [origin], chat, voice });
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
    room.onMessage("voice.state",(value:VoiceZoneState)=>voiceStates.set(room.sessionId,value));
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
    const requestVoice = (token: string,sessionId: string,officeId=id(101),extra:object={}) => fetch(`${url}/voice/token`,{method:"POST",headers:{Origin:origin,"Content-Type":"application/json",Authorization:`Bearer ${token}`},body:JSON.stringify({officeId,sessionId,...extra})});
    await until(()=>voiceStates.has(a.sessionId),"initial voice zone");
    assert.equal(voiceStates.get(a.sessionId)!.zone,null);
    assert.equal((await requestVoice("fixture-1",a.sessionId)).status,403,"Outside the authoritative zone");
    assert.equal((await requestVoice("fixture-1",a.sessionId,id(101),{zone:"Meeting Room",x:928,y:320})).status,400,"Forged zone/coordinates rejected");
    assert.equal((await requestVoice("invalid",a.sessionId)).status,403);
    assert.equal((await requestVoice("fixture-1",a.sessionId,id(102))).status,403);
    const authoritative = matchMaker.getLocalRoomById(a.roomId).state as OfficeState;
    const original={x:authoritative.players.get(a.sessionId)!.x,y:authoritative.players.get(a.sessionId)!.y};
    // Server-only fixture relocation. No application API accepts coordinates.
    Object.assign(authoritative.players.get(a.sessionId)!,{x:928,y:320});
    await until(()=>voiceStates.get(a.sessionId)?.zone==="Meeting Room","authoritative zone entry");
    assert.equal(voiceStates.get(a.sessionId)!.participants,0,"Online avatars are not media participants");
    assert.equal((await requestVoice("fixture-2",a.sessionId)).status,403,"Another verified account cannot claim a session");
    assert.equal((await requestVoice("fixture-1",a.sessionId)).status,200);
    assert.ok([409,429].includes((await requestVoice("fixture-1",a.sessionId)).status));
    mediaMembers.set(voiceTokens[0]!.room,new Set([voiceTokens[0]!.identity])); await voice.poll();
    await until(()=>voiceStates.get(a.sessionId)?.participants===1,"count from media API fixture");
    Object.assign(authoritative.players.get(a.sessionId)!,original);
    await until(()=>voiceStates.get(a.sessionId)?.zone===null && voiceRemoved.length===1,"server enforced zone exit removal");
    assert.ok(voiceRemoved[0]!.cutoff>BigInt(Math.floor(Date.now()/1000)));
    await voice.poll();
    const aChat: ChatMessage[] = [], bChat: ChatMessage[] = [], cChat: ChatMessage[] = [];
    const chatErrors: { code: string }[] = [], availabilityErrors: { code: string }[] = [];
    a.onMessage("chat.message", (message: ChatMessage) => { assert.ok([...committed.values()].some((saved) => saved.id === message.id), "Only committed messages are acknowledged"); aChat.push(message); });
    b.onMessage("chat.message", (message: ChatMessage) => bChat.push(message));
    c.onMessage("chat.message", (message: ChatMessage) => cChat.push(message));
    a.onMessage("chat.error", (error: { code: string }) => chatErrors.push(error));
    a.onMessage("availability.error", (error: { code: string }) => availabilityErrors.push(error));
    const chatBegan = performance.now();
    a.send("chat.send", { body: "Hello office", clientMessageId: id(301) });
    await until(() => aChat.length === 1 && bChat.length === 1, "committed chat delivery");
    const chatLatencyMs = Math.round(performance.now()-chatBegan);
    assert.equal(cChat.length, 0, "No cross-tenant chat event"); assert.equal(committed.size, 1);
    a.send("chat.send", { body: "Hello office", clientMessageId: id(301) });
    await until(() => aChat.length === 2, "retry acknowledgement"); assert.equal(bChat.length, 1); assert.equal(committed.size, 1);
    const beforeForgery = storeCalls;
    a.send("chat.send", { body: "forged", clientMessageId: id(302), senderId: id(2) });
    await until(() => chatErrors.length === 1, "forged sender rejected"); assert.equal(storeCalls, beforeForgery);
    failNext = true; a.send("chat.send", { body: "database failure", clientMessageId: id(302) });
    await until(() => chatErrors.length === 2, "database failure feedback"); assert.equal(chatErrors.at(-1)!.code, "UNAVAILABLE"); assert.equal(bChat.length, 1);
    a.send("availability.set", { status: "BUSY" });
    await until(() => b.state.players.get(a.sessionId)?.availability === "BUSY", "availability synchronized");
    a.send("availability.set", { status: "OFFLINE" });
    await until(() => availabilityErrors.length === 1, "invalid availability rejected");
    a.send("availability.set", { status: "BUSY", sessionId: b.sessionId });
    await until(() => availabilityErrors.length === 2, "forged availability target rejected");
    assert.equal(b.state.players.get(b.sessionId)!.availability, "AVAILABLE");
    await delay(1050); a.send("availability.set", { status: "DO_NOT_DISTURB" });
    await until(() => b.state.players.get(a.sessionId)?.availability === "DO_NOT_DISTURB", "DND synchronized");
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
    assert.equal(a.state.players.get(a.sessionId)!.availability, "DO_NOT_DISTURB", "reconnect retains availability independently of connection flag");
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
    const removedSender = rooms.find((room) => room.state?.players.get(room.sessionId)?.userId === id(8))!;
    const committedBeforeRemoval = committed.size;
    removed.add(8); removedSender.send("chat.send", { body: "after removal", clientMessageId: id(303) });
    await until(() => !a.state.players.has(removedSender.sessionId), "removed sender denied immediately by fresh check");
    assert.equal(committed.size, committedBeforeRemoval);
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
    const leaseClient = local.clients.find((client) => client.auth?.userId === id(7))!;
    (leaseClient.auth as Authorization).checkedAt = Date.now() - AUTH_LEASE_MS;
    await until(() => !(local.state as OfficeState).players.has(leaseClient.sessionId), "hard authorization lease expiry");
    console.info(JSON.stringify({ scope: "isolated real transport, synthetic auth/chat store", firstRemoteMovementMs: Math.round(latency), committedChatObservedMs: chatLatencyMs, stateUpdatesDuringScenario: stateUpdates, configuredTickHz: 20, twoTenantRooms: true, tenPlayerMeasurement: measured }));
  } finally {
    await voice.close();
    for (const room of rooms) { room.reconnection.enabled = false; if (room.connection.isOpen) await room.leave(); room.removeAllListeners(); }
    await server.gracefullyShutdown(false);
  }
});
