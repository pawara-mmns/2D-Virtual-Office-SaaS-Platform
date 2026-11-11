import { randomUUID } from 'node:crypto';
import type { OfficeMap } from '../../../../packages/shared/src/map.ts';
import { gameTables, gameTableInRange, type GameTable } from '../../../../packages/shared/src/games/tables.ts';
import { GAME_DISCONNECT_MS, GAME_IDLE_MS, GAME_RETENTION_MS, parseGameRequest, type GameSnapshot, type GameTableState, type GameRequest, type GameReply, type GamePlayer, type GameOutcome } from '../../../../packages/shared/src/games/protocol.ts';
import { gameRegistry, type GameEngine } from './registry.ts';

export type GameActor = { userId: string; sessionId: string; officeId: string; organizationId: string; displayName: string; connected: boolean; x: number; y: number; seatId?: string };
type Member = GamePlayer & { connectionId: string };
type Session = Omit<GameSnapshot, 'state' | 'spectators' | 'players'> & { engine: GameEngine; players: Member[]; touchedAt: number; closedAt: number | null; tableFingerprint: string };
class GameFailure extends Error { constructor(readonly code: string, message: string) { super(message); } }
const active = (s: Session) => ['WAITING', 'READY', 'PLAYING'].includes(s.status);
const fingerprint = (t: GameTable) => JSON.stringify([t.id, t.assetId, t.x, t.y, t.width, t.height, t.orientation]);
export class GameSessions {
  private map: OfficeMap;
  private tables = new Map<string, GameTable>();
  private sessions = new Map<string, Session>();
  private byTable = new Map<string, string>();
  private participating = new Map<string, string>();
  private viewers = new Map<string, Map<string, string>>();
  private requests = new Map<string, Map<string, { fingerprint: string; ok: boolean; code?: string; message?: string }>>();
  private organizationId?: string;
  constructor(readonly officeId: string, map: OfficeMap, private readonly emit: (connectionId: string, state: GameTableState) => void, private readonly now = Date.now) {
    this.map = map; this.tables = new Map(gameTables(map).map(t => [t.id, t]));
  }
  private fail(code: string, message: string): never { throw new GameFailure(code, message); }
  private snapshot(s: Session): GameSnapshot {
    const members = new Set(s.players.map(p => p.userId));
    return { id: s.id, gameType: s.gameType, officeId: s.officeId, organizationId: s.organizationId, tableId: s.tableId,
      revision: s.revision, round: s.round, status: s.status, players: s.players.map(p => ({userId:p.userId,name:p.name,side:p.side,ready:p.ready,connected:p.connected,disconnectUntil:p.disconnectUntil})),
      spectators: new Set([...(this.viewers.get(s.tableId)?.values() ?? [])].filter(id => !members.has(id))).size,
      state: s.engine.view(), outcome: s.outcome ? { ...s.outcome } : null, drawOffer: s.drawOffer, rematch: [...s.rematch],
      createdAt: s.createdAt, startedAt: s.startedAt, endedAt: s.endedAt };
  }
  tableState(tableId: string): GameTableState {
    const s = this.sessions.get(this.byTable.get(tableId) ?? '');
    return { officeId: this.officeId, tableId, session: s ? this.snapshot(s) : null };
  }
  private publish(tableId: string) { const state = this.tableState(tableId); for (const id of this.viewers.get(tableId)?.keys() ?? []) this.emit(id, state); }
  private watch(actor: GameActor, tableId: string) {
    let viewers = this.viewers.get(tableId); if (!viewers) { viewers = new Map(); this.viewers.set(tableId, viewers); }
    viewers.set(actor.sessionId, actor.userId);
  }
  private canRead(actor: GameActor, tableId: string) {
    return this.viewers.get(tableId)?.has(actor.sessionId) || this.sessions.get(this.byTable.get(tableId) ?? '')?.players.some(p => p.userId === actor.userId);
  }
  private free(userId: string, except?: string) { const current = this.participating.get(userId); if (current && current !== except) this.fail('BUSY', 'Finish or leave your current match before joining another.'); }
  private changed(s: Session) { s.revision++; s.touchedAt = this.now(); this.publish(s.tableId); }
  private finish(s: Session, outcome: GameOutcome) {
    s.status = 'FINISHED'; s.outcome = outcome; s.endedAt = this.now(); s.drawOffer = null;
    for (const p of s.players) if (this.participating.get(p.userId) === s.id) this.participating.delete(p.userId);
  }
  private close(s: Session, reason: string) {
    this.finish(s, { winner: null, reason }); s.status = 'CLOSED'; s.closedAt = this.now(); this.changed(s);
  }
  handle(actor: GameActor, value: unknown): GameReply {
    const request = parseGameRequest(value);
    if (!request) return { requestId: value && typeof value === 'object' && 'requestId' in value && typeof value.requestId === 'string' ? value.requestId.slice(0, 36) : '', ok: false, code: 'INVALID', message: 'Invalid game request.' };
    if (!actor.connected || actor.officeId !== this.officeId || this.organizationId && actor.organizationId !== this.organizationId) return { requestId: request.requestId, ok: false, code: 'DENIED', message: 'Game access denied.' };
    this.organizationId ??= actor.organizationId;
    if (request.action === 'RESTORE') {
      if (request.tableId !== '@active') return { requestId: request.requestId, ok: false, code: 'INVALID', message: 'Invalid restore request.' };
      return { requestId: request.requestId, ok: true, table: this.connect(actor) ?? { officeId: this.officeId, tableId: '@active', session: null } };
    }
    let cache = this.requests.get(actor.userId); if (!cache) { cache = new Map(); this.requests.set(actor.userId, cache); }
    const identity = JSON.stringify(request), previous = cache.get(request.requestId);
    if (previous) {
      if (previous.fingerprint !== identity) return { requestId: request.requestId, ok: false, code: 'INVALID', message: 'A request ID cannot be reused for a different action.' };
      return { requestId: request.requestId, ok: previous.ok, code: previous.code, message: previous.message, duplicate: true, table: this.canRead(actor, request.tableId) ? this.tableState(request.tableId) : { officeId: this.officeId, tableId: request.tableId, session: null } };
    }
    let reply: GameReply;
    try { this.run(actor, request); reply = { requestId: request.requestId, ok: true, table: this.tableState(request.tableId) }; }
    catch (error) { reply = { requestId: request.requestId, ok: false, code: error instanceof GameFailure ? error.code : 'UNAVAILABLE', message: error instanceof GameFailure ? error.message : 'The game action could not be accepted.', table: this.canRead(actor, request.tableId) ? this.tableState(request.tableId) : undefined }; }
    cache.set(request.requestId, { fingerprint: identity, ok: reply.ok, code: reply.code, message: reply.message });
    if (cache.size > 128) cache.delete(cache.keys().next().value!);
    return reply;
  }
  private run(actor: GameActor, r: GameRequest) {
    const table = this.tables.get(r.tableId);
    if (!table) this.fail('TABLE_GONE', 'This chess table is no longer available.');
    let s = this.sessions.get(this.byTable.get(table.id) ?? '');
    const owner = s?.players.find(p => p.userId === actor.userId);
    const range = () => { if (!gameTableInRange(this.map, table, actor)) this.fail('TOO_FAR', 'Move closer to the chess table with a clear approach.'); };
    if (r.action === 'OPEN') { if (!owner) range(); this.watch(actor, table.id); this.publish(table.id); return; }
    if (r.action === 'UNWATCH') { if (!this.canRead(actor, table.id)) this.fail('DENIED', 'You are not watching this table.'); if (!owner) this.viewers.get(table.id)?.delete(actor.sessionId); this.publish(table.id); return; }
    if (r.action === 'CREATE') {
      range(); this.free(actor.userId);
      if (s && s.status !== 'CLOSED') this.fail('EXISTS', 'A session already exists at this table. Join or spectate it.');
      if (this.sessions.size >= 32) this.fail('CAPACITY', 'There are too many recent games. Try again shortly.');
      const definition = gameRegistry.get(table.gameType); if (!definition) this.fail('UNAVAILABLE', 'This game is not available.');
      const now = this.now();
      s = { id: randomUUID(), gameType: definition.id, officeId: this.officeId, organizationId: actor.organizationId, tableId: table.id,
        revision: 1, round: 1, status: 'WAITING', players: [{ userId: actor.userId, name: actor.displayName, side: 'w', ready: false, connected: true, disconnectUntil: null, connectionId: actor.sessionId }],
        engine: definition.create(), outcome: null, drawOffer: null, rematch: [], createdAt: now, startedAt: null, endedAt: null, touchedAt: now, closedAt: null, tableFingerprint: fingerprint(table) };
      this.sessions.set(s.id, s); this.byTable.set(table.id, s.id); this.participating.set(actor.userId, s.id); this.watch(actor, table.id); this.publish(table.id); return;
    }
    if (!s || s.id !== r.sessionId) this.fail('STALE', 'The table session changed. Open the latest board.');
    if (r.action === 'SYNC' || r.action === 'SPECTATE') { if (!owner) range(); this.watch(actor, table.id); this.publish(table.id); return; }
    if (s.status === 'CLOSED') this.fail('CLOSED', 'This match is closed. Start a new match.');
    if (r.revision !== s.revision) this.fail('STALE', 'The board changed. Review the latest position and try again.');
    if (r.action === 'JOIN') {
      range(); this.free(actor.userId, s.id);
      if (owner) { this.watch(actor, table.id); return; }
      if (s.status !== 'WAITING' || s.players.length >= 2) this.fail('FULL', 'Both player seats are taken. You can spectate.');
      s.players.push({ userId: actor.userId, name: actor.displayName, side: s.players.some(p => p.side === 'w') ? 'b' : 'w', ready: false, connected: true, disconnectUntil: null, connectionId: actor.sessionId });
      for (const p of s.players) p.ready = false;
      s.status = 'READY'; this.participating.set(actor.userId, s.id); this.watch(actor, table.id); this.changed(s); return;
    }
    if (!owner || owner.connectionId !== actor.sessionId || !owner.connected) this.fail('NOT_PLAYER', 'Spectators cannot change a match.');
    if (r.action === 'READY') {
      if (s.status !== 'READY') this.fail('NOT_READY', 'Two players must join before readying.');
      owner.ready = r.ready!;
      if (s.players.every(p => p.ready && p.connected)) { s.status = 'PLAYING'; s.startedAt = this.now(); }
    } else if (r.action === 'MOVE') {
      if (s.status !== 'PLAYING') this.fail('NOT_PLAYING', 'This match is not playing.');
      if (s.players.some(p => !p.connected)) this.fail('PAUSED', 'Wait for the other player to reconnect.');
      if (s.engine.turn() !== owner.side) this.fail('NOT_TURN', 'Wait for your turn.');
      try { s.engine.move(r.move); } catch { this.fail('ILLEGAL_MOVE', 'That move is not legal.'); }
      s.drawOffer = null; const outcome = s.engine.outcome(); if (outcome) this.finish(s, outcome);
    } else if (r.action === 'RESIGN') {
      if (s.status !== 'PLAYING') this.fail('NOT_PLAYING', 'This match is not playing.');
      this.finish(s, { winner: owner.side === 'w' ? 'b' : 'w', reason: 'Resignation' });
    } else if (r.action === 'LEAVE') {
      if (s.status === 'PLAYING') this.finish(s, { winner: owner.side === 'w' ? 'b' : 'w', reason: 'Resignation' });
      else if (s.status === 'FINISHED') { this.close(s, 'Match closed'); return; }
      else { s.players = s.players.filter(p => p !== owner); this.participating.delete(actor.userId); for (const p of s.players) p.ready = false; s.status = 'WAITING'; if (!s.players.length) { this.close(s, 'Lobby empty'); return; } }
    } else if (r.action === 'REMATCH') {
      if (s.status !== 'FINISHED' || s.players.length !== 2) this.fail('NOT_FINISHED', 'Finish the current match before requesting a rematch.');
      this.free(actor.userId);
      const votes = [...new Set([...s.rematch, actor.userId])];
      if (votes.length === 2) {
        for (const p of s.players) { this.free(p.userId); if (!p.connected) this.fail('PAUSED', 'Both players must be connected for a rematch.'); }
        s.engine = gameRegistry.get(s.gameType)!.create(); s.round++; s.status = 'READY'; s.outcome = null; s.drawOffer = null; s.rematch = []; s.startedAt = null; s.endedAt = null;
        for (const p of s.players) { p.side = p.side === 'w' ? 'b' : 'w'; p.ready = false; this.participating.set(p.userId, s.id); }
      } else s.rematch = votes;
    } else if (r.action === 'OFFER_DRAW' || r.action === 'ACCEPT_DRAW') {
      if (s.status !== 'PLAYING') this.fail('NOT_PLAYING', 'This match is not playing.');
      if (r.action === 'OFFER_DRAW') s.drawOffer = owner.side;
      else { if (!s.drawOffer || s.drawOffer === owner.side) this.fail('NO_OFFER', 'There is no opponent draw offer to accept.'); this.finish(s, { winner: null, reason: 'Draw by agreement' }); }
    }
    this.changed(s);
  }
  connect(actor: GameActor) {
    if (!actor.connected || actor.officeId !== this.officeId || this.organizationId && actor.organizationId !== this.organizationId) return;
    const candidates = [...this.sessions.values()].filter(s => s.status !== 'CLOSED' && s.players.some(p => p.userId === actor.userId)).sort((a, b) => Number(active(b)) - Number(active(a)) || b.createdAt - a.createdAt);
    const s = candidates[0]; if (!s) return;
    const p = s.players.find(p => p.userId === actor.userId)!;
    if (p.disconnectUntil !== null && p.disconnectUntil <= this.now() && active(s)) this.tick();
    if (s.status === 'CLOSED' || !s.players.includes(p)) return;
    const changed = !p.connected || p.connectionId !== actor.sessionId || p.name !== actor.displayName;
    p.connected = true; p.connectionId = actor.sessionId; p.disconnectUntil = null; p.name = actor.displayName; this.watch(actor, s.tableId); if (changed) this.changed(s); else this.publish(s.tableId);
    return this.tableState(s.tableId);
  }
  disconnect(connectionId: string, userId: string) {
    for (const [tableId, viewers] of this.viewers) { if (viewers.delete(connectionId)) this.publish(tableId); }
    for (const s of this.sessions.values()) {
      const p = s.players.find(p => p.userId === userId && p.connectionId === connectionId);
      if (p?.connected && s.status !== 'CLOSED') { p.connected = false; p.disconnectUntil = this.now() + GAME_DISCONNECT_MS; this.changed(s); }
    }
  }
  revoke(connectionId: string, userId: string) {
    for (const viewers of this.viewers.values()) viewers.delete(connectionId);
    for (const s of this.sessions.values()) {
      const p = s.players.find(p => p.userId === userId); if (!p || s.status === 'CLOSED') continue;
      if (s.status === 'PLAYING') { this.finish(s, { winner: p.side === 'w' ? 'b' : 'w', reason: 'Access revoked' }); s.status = 'CLOSED'; s.closedAt = this.now(); this.changed(s); }
      else this.close(s, 'Access revoked');
    }
    this.participating.delete(userId); this.requests.delete(userId);
  }
  updateMap(map: OfficeMap) {
    this.map = map; this.tables = new Map(gameTables(map).map(t => [t.id, t]));
    for (const s of this.sessions.values()) { const t = this.tables.get(s.tableId); if (s.status !== 'CLOSED' && (!t || fingerprint(t) !== s.tableFingerprint)) this.close(s, 'Table changed'); }
  }
  tick() {
    const now = this.now();
    for (const s of this.sessions.values()) {
      if (s.status === 'CLOSED') { if (now - s.closedAt! >= GAME_RETENTION_MS) { this.sessions.delete(s.id); if (this.byTable.get(s.tableId) === s.id) { this.byTable.delete(s.tableId); this.viewers.delete(s.tableId); } } continue; }
      const expired = s.players.filter(p => !p.connected && p.disconnectUntil !== null && now >= p.disconnectUntil);
      if (active(s) && expired.length) {
        if (s.status === 'PLAYING') { const present = s.players.find(p => p.connected); this.finish(s, { winner: present?.side ?? null, reason: present ? 'Disconnect forfeit' : 'Abandoned' }); this.changed(s); }
        else { for (const p of expired) this.participating.delete(p.userId); s.players = s.players.filter(p => !expired.includes(p)); s.status = 'WAITING'; for (const p of s.players) p.ready = false; if (!s.players.length) this.close(s, 'Lobby abandoned'); else this.changed(s); }
      }
      if (s.status !== 'PLAYING' && now - s.touchedAt >= GAME_IDLE_MS) this.close(s, 'Session expired');
    }
    const retained = new Set([...this.sessions.values()].flatMap(s => s.players.map(p => p.userId)));
    for (const viewers of this.viewers.values()) for (const id of viewers.values()) retained.add(id);
    for (const id of this.requests.keys()) if (!retained.has(id)) this.requests.delete(id);
  }
  dispose() { for (const s of this.sessions.values()) if (s.status !== 'CLOSED') this.close(s, 'Office closed'); this.sessions.clear(); this.byTable.clear(); this.participating.clear(); this.viewers.clear(); this.requests.clear(); }
}
