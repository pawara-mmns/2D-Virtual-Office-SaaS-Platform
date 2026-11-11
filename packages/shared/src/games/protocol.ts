import { isId } from '../protocol.ts';

export const GAME_DISCONNECT_MS = 45_000;
export const GAME_IDLE_MS = 5 * 60_000;
export const GAME_RETENTION_MS = 60_000;
export type GameStatus = 'WAITING' | 'READY' | 'PLAYING' | 'FINISHED' | 'CLOSED';
export type GameSide = 'w' | 'b';
export type ChessPieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
export type ChessMove = { from: string; to: string; promotion?: 'q' | 'r' | 'b' | 'n' };
export type ChessView = {
  kind: 'chess'; fen: string; turn: GameSide; check: boolean;
  legalMoves: ChessMove[]; history: string[]; lastMove: ChessMove | null;
  captured: { color: GameSide; type: ChessPieceType }[];
};
// A game adapter owns its serializable payload; the session manager treats it as opaque.
export type GamePayload = { kind: string; [key: string]: unknown };
export type GameOutcome = { winner: GameSide | null; reason: string };
export type GamePlayer = { userId: string; name: string; side: GameSide; ready: boolean; connected: boolean; disconnectUntil: number | null };
export type GameSnapshot = {
  id: string; gameType: string; officeId: string; organizationId: string; tableId: string;
  revision: number; round: number; status: GameStatus; players: GamePlayer[]; spectators: number;
  state: GamePayload; outcome: GameOutcome | null; drawOffer: GameSide | null; rematch: string[];
  createdAt: number; startedAt: number | null; endedAt: number | null;
};
export type GameTableState = { officeId: string; tableId: string; session: GameSnapshot | null };
export const gameActions = ['RESTORE', 'OPEN', 'CREATE', 'JOIN', 'SPECTATE', 'SYNC', 'UNWATCH', 'READY', 'MOVE', 'RESIGN', 'LEAVE', 'REMATCH', 'OFFER_DRAW', 'ACCEPT_DRAW'] as const;
export type GameAction = typeof gameActions[number];
export type GameCommand = { action: GameAction; tableId: string; sessionId?: string; revision?: number; ready?: boolean; move?: ChessMove };
export type GameRequest = GameCommand & { requestId: string };
export type GameReply = { requestId: string; ok: boolean; code?: string; message?: string; duplicate?: boolean; table?: GameTableState };
export const isSquare = (value: unknown): value is string => typeof value === 'string' && /^[a-h][1-8]$/.test(value);
export function parseChessMove(value: unknown): ChessMove | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (!isSquare(v.from) || !isSquare(v.to) || Object.keys(v).some(k => !['from', 'to', 'promotion'].includes(k)) || (v.promotion !== undefined && (typeof v.promotion !== 'string' || !['q', 'r', 'b', 'n'].includes(v.promotion)))) return null;
  return { from: v.from, to: v.to, ...(v.promotion === undefined ? {} : { promotion: v.promotion as ChessMove['promotion'] }) };
}
export function parseGameRequest(value: unknown): GameRequest | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as GameRequest;
  if (!isId(v.requestId) || !gameActions.includes(v.action) || typeof v.tableId !== 'string' || !v.tableId || v.tableId.length > 160) return null;
  const bound = !['RESTORE', 'OPEN', 'CREATE', 'UNWATCH'].includes(v.action), ready = v.action === 'READY', move = v.action === 'MOVE';
  const keys = ['requestId', 'action', 'tableId', ...(bound ? ['sessionId', 'revision'] : []), ...(ready ? ['ready'] : []), ...(move ? ['move'] : [])];
  if (Object.keys(v).length !== keys.length || Object.keys(v).some(k => !keys.includes(k))) return null;
  if (bound && (!isId(v.sessionId) || !Number.isSafeInteger(v.revision) || v.revision! < 0)) return null;
  if (ready && typeof v.ready !== 'boolean' || move && !parseChessMove(v.move)) return null;
  return { requestId: v.requestId, action: v.action, tableId: v.tableId, ...(bound ? { sessionId: v.sessionId, revision: v.revision } : {}), ...(ready ? { ready: v.ready } : {}), ...(move ? { move: parseChessMove(v.move)! } : {}) };
}
export function chessView(value: GamePayload | undefined): ChessView | null {
  if (!value || value.kind !== 'chess' || typeof value.fen !== 'string' || value.fen.length > 200 || value.turn !== 'w' && value.turn !== 'b' || typeof value.check !== 'boolean' || !Array.isArray(value.legalMoves) || value.legalMoves.length > 256 || !value.legalMoves.every(parseChessMove) || !Array.isArray(value.history) || value.history.length > 1000 || !value.history.every(v => typeof v === 'string' && v.length < 32) || !Array.isArray(value.captured) || value.captured.length > 32 || !value.captured.every(p => !!p && typeof p === 'object' && ['w', 'b'].includes(p.color) && ['p', 'n', 'b', 'r', 'q', 'k'].includes(p.type)) || value.lastMove !== null && !parseChessMove(value.lastMove)) return null;
  return value as unknown as ChessView;
}
export function validGameTable(value: unknown, officeId: string): value is GameTableState {
  if (!value || typeof value !== 'object') return false;
  const table = value as GameTableState;
  if (table.officeId !== officeId || typeof table.tableId !== 'string' || !table.tableId || table.tableId.length > 160) return false;
  if (table.session === null) return true;
  const s = table.session;
  return !!s && isId(s.id) && s.officeId === officeId && isId(s.organizationId) && s.tableId === table.tableId && typeof s.gameType === 'string' && Number.isSafeInteger(s.revision) && s.revision >= 0 && Number.isSafeInteger(s.round) && s.round > 0 && ['WAITING', 'READY', 'PLAYING', 'FINISHED', 'CLOSED'].includes(s.status) && Array.isArray(s.players) && s.players.length <= 2 && s.players.every(p => !!p && isId(p.userId) && typeof p.name === 'string' && p.name.length <= 100 && ['w', 'b'].includes(p.side) && typeof p.ready === 'boolean' && typeof p.connected === 'boolean' && (p.disconnectUntil === null || Number.isFinite(p.disconnectUntil))) && Number.isInteger(s.spectators) && s.spectators >= 0 && s.spectators <= 10 && !!s.state && typeof s.state.kind === 'string' && (s.state.kind !== 'chess' || !!chessView(s.state)) && Array.isArray(s.rematch) && s.rematch.length <= 2 && s.rematch.every(isId) && (s.drawOffer === null || ['w', 'b'].includes(s.drawOffer)) && (s.outcome === null || !!s.outcome && [null, 'w', 'b'].includes(s.outcome.winner) && typeof s.outcome.reason === 'string' && s.outcome.reason.length <= 100) && Number.isFinite(s.createdAt) && (s.startedAt === null || Number.isFinite(s.startedAt)) && (s.endedAt === null || Number.isFinite(s.endedAt)) && JSON.stringify(value).length <= 32000;
}
