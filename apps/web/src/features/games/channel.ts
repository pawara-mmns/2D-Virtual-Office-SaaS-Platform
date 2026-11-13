import { parseGameRequest, validGameTable, type GameCommand, type GameReply, type GameRequest, type GameTableState } from '../../../../../packages/shared/src/games/protocol.ts';

export function gameChannel(officeId: string, online: () => boolean, send: (request: GameRequest) => void, onState: (table: GameTableState | null) => void = () => {}) {
  const pending = new Map<string, { request: GameRequest; resolve(value: GameReply): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout>; retry: ReturnType<typeof setTimeout> }>();
  const known = new Map<string, GameTableState>();
  let latest: GameTableState | undefined, disposed = false;
  const accept = (value: unknown) => {
    if (disposed || !validGameTable(value, officeId)) return false;
    if (value.tableId === '@active') return true;
    const previous = known.get(value.tableId)?.session, next = value.session;
    if (previous && next && (previous.id === next.id ? next.revision < previous.revision : next.createdAt < previous.createdAt)) return true;
    known.set(value.tableId, value); if (known.size > 32) known.delete(known.keys().next().value!); latest = value; onState(value); return true;
  };
  const request = (command: GameCommand): Promise<GameReply> => new Promise((resolve, reject) => {
    if (disposed || !online()) { reject(Error('Reconnect to the office before using the game.')); return; }
    const value = parseGameRequest({ ...command, requestId: crypto.randomUUID() });
    if (!value || pending.size >= 8) { reject(Error('Invalid or pending game request.')); return; }
    const timer = setTimeout(() => { const item = pending.get(value.requestId); if (!item) return; clearTimeout(item.retry); pending.delete(value.requestId); reject(Error('The game action is unconfirmed. Refresh the table before trying again.')); }, 9000);
    const retry = setTimeout(() => { if (pending.has(value.requestId) && online()) try { send(value); } catch { /* The bounded timeout/reconnect reconciles an uncertain send. */ } }, 3000);
    pending.set(value.requestId, { request: value, resolve, reject, timer, retry });
    try { send(value); } catch { clearTimeout(timer); clearTimeout(retry); pending.delete(value.requestId); reject(Error('Connection changed before the request could be sent. Reconnect and refresh the table.')); }
  });
  const disconnect = () => { for (const item of pending.values()) { clearTimeout(item.timer); clearTimeout(item.retry); item.reject(Error('Connection lost. Reconnect to restore the latest board.')); } pending.clear(); };
  return {
    request, accept,
    reply(value: GameReply) {
      const item = pending.get(value?.requestId); if (!item) return;
      clearTimeout(item.timer); clearTimeout(item.retry); pending.delete(value.requestId);
      if (typeof value.ok !== 'boolean' || value.table && (item.request.action !== 'RESTORE' && value.table.tableId !== item.request.tableId || !accept(value.table)) || value.ok && !value.table) { item.reject(Error('The game reply could not be verified. Refresh the table.')); return; }
      item.resolve(value);
    },
    disconnect,
    reconnect() { const before = latest; void request({ action: 'RESTORE', tableId: '@active' }).then(reply => { if (!reply.table?.session && before?.session && before.session.status !== 'CLOSED') setTimeout(() => { void request({ action: 'SYNC', tableId: before.tableId, sessionId: before.session!.id, revision: before.session!.revision }).catch(() => {}); }, 100); }).catch(() => {}); },
    dispose() { if(disposed)return;disposed = true; disconnect(); known.clear(); onState(null); },
  };
}
