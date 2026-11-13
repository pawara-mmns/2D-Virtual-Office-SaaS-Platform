import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';
import { matchMaker } from 'colyseus';
import type { Room } from '@colyseus/sdk';
import { createRealtimeServer } from '../server.ts';
import { AccessDenied, type Authorize } from '../auth/authorize.ts';
import type { OfficeState } from '../state/office-state.ts';
import { mapVersion } from '../../../../packages/shared/src/protocol.ts';
import { protectReconnectUrl } from '../../../../packages/shared/src/socket-transport.ts';
import { type GameAction, type GameCommand, type GameReply, type GameRequest, type GameTableState } from '../../../../packages/shared/src/games/protocol.ts';
import { chessFixture, fixtureId as id } from '../../../../scripts/chess-fixture.mts';
const native = globalThis.WebSocket; globalThis.WebSocket = undefined as unknown as typeof WebSocket;
const { Client } = await import('@colyseus/sdk'); globalThis.WebSocket = native;
const require = createRequire(import.meta.url), Socket = createRequire(require.resolve('@colyseus/sdk'))('ws');
type ClientRoom = Room<object, OfficeState>;
async function until(check: () => boolean, label: string) { for (let i = 0; i < 300; i++) { if (check()) return; await delay(20); } throw Error('Timed out: ' + label); }
test('real HTTP/WebSocket chess: range, two players, spectator, tenants, duplicates, recovery, checkmate, rematch and revoked identity', { timeout: 25000 }, async () => {
  const fixture = chessFixture(), table = fixture.tables[0]!, origin = 'http://local-chess.invalid', revoked = new Set<number>();
  const authorize: Authorize = async (token, office) => { const n = Number(String(token).replace('chess-', '')); if (![1,2,3,4].includes(n) || revoked.has(n) || office !== id(n === 4 ? 910 : 900)) throw new AccessDenied(); return { token: String(token), userId: id(n), organizationId: id(n === 4 ? 911 : 901), officeId: String(office), displayName: 'Player ' + n, avatarKey: 'fern', expiresAt: Date.now() + 60000, checkedAt: Date.now() }; };
  const server = createRealtimeServer({ authorize, map: fixture.map, origins: [origin] }); await server.listen(0, '127.0.0.1'); const address = server.transport.server!.address(); assert.ok(address && typeof address === 'object'); const url = 'http://127.0.0.1:' + address.port;
  const rooms: ClientRoom[] = [], states = new Map<string, GameTableState>(), replies = new Map<string, (reply: GameReply) => void>(); let serial = 1000;
  const join = async (n: number) => {
    const response = await fetch(url + '/office/join', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', Authorization: 'Bearer chess-' + n }, body: JSON.stringify({ officeId: id(n === 4 ? 910 : 900), mapVersion: mapVersion(fixture.map) }) }); assert.equal(response.status, 200);
    const room = await new Client(url, { headers: { Origin: origin } }).consumeSeatReservation<OfficeState>(await response.json()); rooms.push(room);
    room.onMessage('game.state', (value: GameTableState) => states.set(room.sessionId, value)); room.onMessage('game.reply', (value: GameReply) => { if (value.table) states.set(room.sessionId, value.table); replies.get(value.requestId)?.(value); replies.delete(value.requestId); }); room.onMessage('proximity.state', () => {}); room.onMessage('voice.state', () => {});
    protectReconnectUrl(room.connection, (url, protocol) => new Socket(url, protocol, { headers: { Origin: origin } }));
    await until(() => room.state.players?.has(room.sessionId), 'join'); return room;
  };
  const sendRaw = async (room: ClientRoom, request: GameRequest) => { await delay(100); return new Promise<GameReply>((resolve, reject) => { const timeout = setTimeout(() => reject(Error('Game reply timeout')), 4500); replies.set(request.requestId, reply => { clearTimeout(timeout); resolve(reply); }); room.send('game.request', request); }); };
  const send = async (room: ClientRoom, action: GameAction, extra: Partial<GameCommand> = {}) => { await delay(120); const s = states.get(room.sessionId)?.session; return sendRaw(room, { requestId: id(++serial), action, tableId: table.id, ...(!['OPEN','CREATE','RESTORE','UNWATCH'].includes(action) ? { sessionId: s?.id ?? id(999), revision: s?.revision ?? 0 } : {}), ...extra }); };
  try {
    const a = await join(1), b = await join(2), c = await join(3), foreign = await join(4), live = matchMaker.getLocalRoomById(a.roomId), liveState = live.state as OfficeState;
    const far = await send(c, 'OPEN'); assert.equal(far.code, 'TOO_FAR'); assert.equal(far.table, undefined);
    for (const [index, room] of [a,b,c].entries()) Object.assign(liveState.players.get(room.sessionId)!, table.approaches[index]!);
    const otherLive = matchMaker.getLocalRoomById(foreign.roomId); Object.assign((otherLive.state as OfficeState).players.get(foreign.sessionId)!, table.approaches[0]!);
    assert.ok((await send(a,'OPEN')).ok); assert.equal(states.get(a.sessionId)?.session,null); assert.ok((await send(a,'CREATE')).ok); assert.ok((await send(b,'OPEN')).ok); assert.ok((await send(b,'JOIN')).ok);
    assert.ok((await send(c,'OPEN')).ok); assert.ok((await send(c,'SPECTATE')).ok); assert.ok((await send(a,'READY',{ready:true})).ok); assert.ok((await send(b,'READY',{ready:true})).ok);
    await until(()=>states.get(c.sessionId)?.session?.status==='PLAYING','spectator playing state'); const initial = states.get(a.sessionId)!.session!;
    assert.equal((await send(c,'MOVE',{move:{from:'e2',to:'e4'}})).code,'NOT_PLAYER'); assert.equal((await send(b,'MOVE',{move:{from:'e7',to:'e5'}})).code,'NOT_TURN'); assert.equal((await send(a,'MOVE',{move:{from:'e2',to:'e5'}})).code,'ILLEGAL_MOVE');
    assert.ok((await send(foreign,'CREATE')).ok); const intrusion=await send(foreign,'MOVE',{sessionId:initial.id,revision:initial.revision,move:{from:'e2',to:'e4'}}); assert.equal(intrusion.code,'STALE'); assert.notEqual(intrusion.table?.session?.id,initial.id); assert.equal(intrusion.table?.officeId,id(910));
    const first:GameRequest={requestId:id(++serial),action:'MOVE',tableId:table.id,sessionId:initial.id,revision:states.get(a.sessionId)!.session!.revision,move:{from:'f2',to:'f3'}};
    assert.ok((await sendRaw(a,first)).ok);assert.equal((await sendRaw(a,first)).duplicate,true);assert.equal((states.get(a.sessionId)!.session!.state.history as string[]).length,1);
    const before=states.get(b.sessionId)!.session!;b.reconnection.minUptime=0;b.reconnection.maxRetries=4;b.reconnection.maxDelay=300;b.connection.close();await until(()=>!liveState.players.get(b.sessionId)!.connected,'drop');await until(()=>!!liveState.players.get(b.sessionId)?.connected&&b.connection.isOpen,'authorized reconnect');
    assert.ok((await send(b,'RESTORE',{tableId:'@active'})).ok);assert.equal(states.get(b.sessionId)?.session?.id,before.id);assert.deepEqual(states.get(b.sessionId)?.session?.state.history,before.state.history);
    assert.ok((await send(b,'MOVE',{move:{from:'e7',to:'e5'}})).ok);assert.ok((await send(a,'MOVE',{move:{from:'g2',to:'g4'}})).ok);assert.ok((await send(b,'MOVE',{move:{from:'d8',to:'h4'}})).ok);await until(()=>states.get(c.sessionId)?.session?.status==='FINISHED','spectator sees checkmate');assert.equal(states.get(c.sessionId)?.session?.outcome?.reason,'Checkmate');
    assert.ok((await send(a,'REMATCH')).ok);assert.ok((await send(b,'REMATCH')).ok);assert.equal(states.get(a.sessionId)?.session?.round,2);assert.ok((await send(a,'READY',{ready:true})).ok);assert.ok((await send(b,'READY',{ready:true})).ok);
    revoked.add(2);b.send('credential','chess-2');await until(()=>!liveState.players.has(b.sessionId),'revoked player removed');await until(()=>states.get(a.sessionId)?.session?.status==='CLOSED','revocation closes match');assert.equal(states.get(a.sessionId)?.session?.outcome?.reason,'Access revoked');
    console.info('Actual local HTTP/WebSockets, three office members plus isolated tenant, authorized SDK reconnect and authoritative chess passed. Synthetic identities only.');
  } finally { for(const room of rooms){room.reconnection.enabled=false;if(room.connection.isOpen)await room.leave();room.removeAllListeners();}await server.gracefullyShutdown(false); }
});
