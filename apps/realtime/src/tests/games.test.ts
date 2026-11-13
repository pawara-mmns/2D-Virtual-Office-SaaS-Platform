import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ChessEngine, gameRegistry } from '../games/registry.ts';
import { GameSessions, type GameActor } from '../games/sessions.ts';
import { GAME_DISCONNECT_MS, GAME_IDLE_MS, GAME_RETENTION_MS, parseGameRequest, type GameAction, type GameCommand, type GameRequest } from '../../../../packages/shared/src/games/protocol.ts';
import { gameTableInRange, gameTables } from '../../../../packages/shared/src/games/tables.ts';
import { tileLayer } from '../../../../packages/shared/src/map.ts';
import { chessFixture, fixtureId as id } from '../../../../scripts/chess-fixture.mts';
const fixture = chessFixture(), table = fixture.tables[0]!, otherTable = fixture.tables[1]!;
const actor = (n: number): GameActor => ({ userId: id(n), sessionId: 'socket-' + n, officeId: id(900), organizationId: id(901), displayName: 'Player ' + n, connected: true, ...table.approaches[0]! });
function setup() {
  let time = 1000, serial = 0;
  const events: { connection: string; revision: number | null }[] = [];
  const manager = new GameSessions(id(900), fixture.map, (connection, state) => events.push({ connection, revision: state.session?.revision ?? null }), () => time);
  const run = (n: number, action: GameAction, extra: Partial<GameCommand> = {}, who = actor(n)) => {
    const target = extra.tableId ?? table.id, current = manager.tableState(target).session;
    return manager.handle(who, { requestId: id(++serial + 1000), action, tableId: target, ...(!['OPEN', 'CREATE', 'RESTORE', 'UNWATCH'].includes(action) ? { sessionId: current?.id ?? id(999), revision: current?.revision ?? 0 } : {}), ...extra });
  };
  const playing = () => { assert.ok(run(1, 'CREATE').ok); assert.ok(run(2, 'JOIN').ok); assert.ok(run(1, 'READY', { ready: true }).ok); assert.ok(run(2, 'READY', { ready: true }).ok); };
  return { manager, run, events, playing, advance(ms: number) { time += ms; manager.tick(); } };
}
test('registry includes only a real chess engine; protocol strictly rejects forged boards, identity, malformed IDs and arbitrary payloads', () => {
  assert.deepEqual([...gameRegistry.keys()], ['chess']);
  const request = { requestId: id(1), action: 'MOVE', tableId: table.id, sessionId: id(2), revision: 2, move: { from: 'e2', to: 'e4' } };
  assert.ok(parseGameRequest(request));
  for (const extra of [{ fen: 'x' }, { userId: id(2) }, { officeId: id(900) }, { move: { from: 'a9', to: 'e4' } }, { move: { from: 'e2', to: 'e4', promotion: { toString: null } } }, { requestId: 'x' }, { revision: -1 }, { action: 'load' }]) assert.equal(parseGameRequest({ ...request, ...extra }), null);
});
test('reliable rules adapter: legal/illegal moves, castling and en passant', () => {
  const engine = new ChessEngine(); engine.move({ from: 'e2', to: 'e4' }); assert.throws(() => engine.move({ from: 'e7', to: 'e4' }));
  for (const [from, to] of [['a7', 'a6'], ['e4', 'e5'], ['d7', 'd5'], ['e5', 'd6']]) engine.move({ from, to });
  assert.equal(engine.view().captured[0]?.type, 'p'); assert.equal(engine.view().lastMove?.to, 'd6');
  const castles = new ChessEngine('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1'); castles.move({ from: 'e1', to: 'g1' }); castles.move({ from: 'e8', to: 'c8' });
  assert.deepEqual(castles.view().history, ['O-O', 'O-O-O']);
});
test('rules adapter: checkmate, stalemate, insufficient material, repetition, fifty-move draw, and all four promotions', () => {
  const mate = new ChessEngine(); for (const [from,to] of [['f2','f3'],['e7','e5'],['g2','g4'],['d8','h4']]) mate.move({from,to});
  assert.deepEqual(mate.outcome(), { winner:'b', reason:'Checkmate' });
  assert.equal(new ChessEngine('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1').outcome()?.reason, 'Stalemate');
  assert.equal(new ChessEngine('7k/8/6K1/8/8/8/8/8 w - - 0 1').outcome()?.reason, 'Insufficient material');
  const repeat = new ChessEngine(); for(let round=0;round<2;round++) for(const[from,to]of [['g1','f3'],['g8','f6'],['f3','g1'],['f6','g8']]) repeat.move({from,to});
  assert.equal(repeat.outcome()?.reason,'Threefold repetition');
  const fifty = new ChessEngine('7k/8/6K1/8/8/8/R7/8 w - - 99 1'); fifty.move({from:'a2',to:'a3'}); assert.equal(fifty.outcome()?.reason,'Fifty-move rule');
  for(const promotion of ['q','r','b','n']) { const promote=new ChessEngine('7k/P7/6K1/8/8/8/8/8 w - - 0 1');assert.throws(()=>promote.move({from:'a7',to:'a8'})); promote.move({from:'a7',to:'a8',promotion});assert.equal(promote.view().lastMove?.promotion,promotion); }
});
test('approaching/opening never creates a game; create/join/readiness and spectators are distinct, with one active participation', () => {
  const f=setup();assert.ok(f.run(3,'OPEN').ok);assert.equal(f.manager.tableState(table.id).session,null);
  assert.ok(f.run(1,'CREATE').ok);assert.equal(f.manager.tableState(table.id).session?.status,'WAITING');
  assert.ok(f.run(3,'SPECTATE').ok);assert.equal(f.run(3,'READY',{ready:true}).code,'NOT_PLAYER');
  assert.equal(f.run(1,'CREATE',{tableId:otherTable.id}, {...actor(1),...otherTable.approaches[0]!}).code,'BUSY');
  assert.ok(f.run(2,'JOIN').ok);assert.equal(f.run(3,'JOIN').code,'FULL');assert.equal(f.manager.tableState(table.id).session?.status,'READY');
  assert.ok(f.run(1,'READY',{ready:true}).ok);assert.equal(f.manager.tableState(table.id).session?.status,'READY');assert.ok(f.run(2,'READY',{ready:true}).ok);assert.equal(f.manager.tableState(table.id).session?.status,'PLAYING');
});
test('server rejects distant/cross-office/cross-tenant actions and does not leak a board in error or replay replies', () => {
  const f=setup();f.playing();
  assert.equal(f.run(3,'OPEN',{}, {...actor(3),officeId:id(902)}).code,'DENIED');
  assert.equal(f.run(3,'OPEN',{}, {...actor(3),organizationId:id(902)}).code,'DENIED');
  const request={requestId:id(3000),action:'OPEN',tableId:table.id};
  const far={...actor(3),x:1,y:1};const denied=f.manager.handle(far,request);assert.equal(denied.code,'TOO_FAR');assert.equal(denied.table,undefined);
  assert.equal(f.manager.handle(far,request).table?.session,null);
  assert.equal(f.run(3,'UNWATCH').code,'DENIED');assert.equal(f.run(3,'UNWATCH').table,undefined);
  assert.equal(f.run(3,'JOIN',{},far).code,'TOO_FAR');
});
test('move authority enforces side, legality, revisions, read-only spectators and duplicate protection across rematches', () => {
  const f=setup();f.playing();assert.ok(f.run(3,'SPECTATE').ok);
  const initial=f.manager.tableState(table.id).session!;
  assert.equal(f.run(2,'MOVE',{move:{from:'e7',to:'e5'}}).code,'NOT_TURN');assert.equal(f.run(3,'MOVE',{move:{from:'e2',to:'e4'}}).code,'NOT_PLAYER');assert.equal(f.run(1,'MOVE',{move:{from:'e2',to:'e5'}}).code,'ILLEGAL_MOVE');
  const request:GameRequest={requestId:id(4000),action:'MOVE',tableId:table.id,sessionId:initial.id,revision:initial.revision,move:{from:'e2',to:'e4'}};
  assert.ok(f.manager.handle(actor(1),request).ok);assert.ok(f.manager.handle(actor(1),request).duplicate);assert.equal((f.manager.tableState(table.id).session!.state.history as string[]).length,1);
  assert.equal(f.manager.handle(actor(1),{...request,move:{from:'d2',to:'d4'}}).code,'INVALID');assert.equal(f.run(2,'MOVE',{revision:initial.revision,move:{from:'e7',to:'e5'}}).code,'STALE');
  assert.ok(f.run(2,'RESIGN').ok);assert.equal(f.manager.tableState(table.id).session?.outcome?.winner,'w');assert.ok(f.run(1,'REMATCH').ok);assert.ok(f.run(2,'REMATCH').ok);const rematch=f.manager.tableState(table.id).session!;assert.equal(rematch.round,2);assert.equal(rematch.status,'READY');assert.equal(rematch.players.find(p=>p.userId===id(1))?.side,'b');
  assert.ok(f.run(1,'READY',{ready:true}).ok);assert.ok(f.run(2,'READY',{ready:true}).ok);assert.equal(f.run(1,'MOVE',{revision:initial.revision,move:{from:'e2',to:'e4'}}).code,'STALE');
});
test('agreed draw, leaving lobbies, closing completed matches and fresh sessions work without overwriting old session identity', () => {
  const f=setup();f.playing();const old=f.manager.tableState(table.id).session!.id;assert.equal(f.run(1,'ACCEPT_DRAW').code,'NO_OFFER');assert.ok(f.run(1,'OFFER_DRAW').ok);assert.equal(f.run(1,'ACCEPT_DRAW').code,'NO_OFFER');assert.ok(f.run(2,'ACCEPT_DRAW').ok);assert.equal(f.manager.tableState(table.id).session?.outcome?.reason,'Draw by agreement');assert.ok(f.run(1,'LEAVE').ok);assert.equal(f.manager.tableState(table.id).session?.status,'CLOSED');assert.ok(f.run(3,'CREATE').ok);assert.notEqual(f.manager.tableState(table.id).session?.id,old);assert.ok(f.run(3,'LEAVE').ok);
});
test('disconnects pause moves, reconnect with a new authorized connection restores the same board, and old socket cleanup cannot disconnect it', () => {
  const f=setup();f.playing();assert.ok(f.run(1,'MOVE',{move:{from:'e2',to:'e4'}}).ok);const before=f.manager.tableState(table.id).session!;
  f.manager.disconnect(actor(2).sessionId,id(2));assert.equal(f.run(1,'MOVE',{move:{from:'d2',to:'d4'}}).code,'PAUSED');
  const restored=f.manager.connect({...actor(2),sessionId:'replacement'});assert.equal(restored?.session?.id,before.id);assert.deepEqual(restored?.session?.state.history,before.state.history);
  f.manager.disconnect(actor(2).sessionId,id(2));assert.equal(f.manager.tableState(table.id).session?.players.find(p=>p.userId===id(2))?.connected,true);
  assert.ok(f.run(2,'MOVE',{move:{from:'e7',to:'e5'}},{...actor(2),sessionId:'replacement'}).ok);
});
test('bounded grace forfeits, abandonment, revocation and timed cleanup never restore a revoked game', () => {
  const f=setup();f.playing();f.manager.disconnect(actor(2).sessionId,id(2));f.advance(GAME_DISCONNECT_MS+1);assert.equal(f.manager.tableState(table.id).session?.outcome?.reason,'Disconnect forfeit');assert.equal(f.manager.tableState(table.id).session?.outcome?.winner,'w');
  f.manager.revoke(actor(1).sessionId,id(1));assert.equal(f.manager.tableState(table.id).session?.status,'CLOSED');assert.equal(f.manager.connect(actor(1)),undefined);f.advance(GAME_RETENTION_MS+1);assert.equal(f.manager.tableState(table.id).session,null);
  const both=setup();both.playing();both.manager.disconnect(actor(1).sessionId,id(1));both.manager.disconnect(actor(2).sessionId,id(2));both.advance(GAME_DISCONNECT_MS+1);assert.equal(both.manager.tableState(table.id).session?.outcome?.reason,'Abandoned');
  const lobby=setup();lobby.run(1,'CREATE');lobby.advance(GAME_IDLE_MS+1);assert.equal(lobby.manager.tableState(table.id).session?.status,'CLOSED');lobby.advance(GAME_RETENTION_MS+1);assert.equal(lobby.manager.tableState(table.id).session,null);
});
test('owner-placed stable tables share valid interaction paths; walls deny range, removal closes a match and office disposal clears it', () => {
  assert.ok(table.id.startsWith('custom/'));assert.ok(gameTableInRange(fixture.map,table,actor(1)));
  const blocked=structuredClone(fixture.map),a=actor(1);const row=Math.floor((a.y+11)/32);for(let x=0;x<blocked.width;x++)tileLayer(blocked,'Architecture').data[row*blocked.width+x]=1;
  assert.equal(gameTableInRange(blocked,table,a),false);
  const f=setup();f.playing();const removed=structuredClone(fixture.map),placements=removed.layers.find(l=>l.name==='Placements');assert.ok(placements?.type==='objectgroup');placements.objects=placements.objects.filter(p=>p.instanceId!==table.id);assert.equal(gameTables(removed).some(t=>t.id===table.id),false);f.manager.updateMap(removed);assert.equal(f.manager.tableState(table.id).session?.status,'CLOSED');assert.equal(f.manager.tableState(table.id).session?.outcome?.reason,'Table changed');f.manager.dispose();assert.equal(f.manager.tableState(table.id).session,null);
});
