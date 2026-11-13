import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gameChannel } from './channel.ts';
import { chessPieces, chessSquares, initialChessFen } from './chess-model.ts';
import { validGameTable, type GameRequest, type GameTableState } from '../../../../../packages/shared/src/games/protocol.ts';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const table = (): GameTableState => ({ officeId: id(1), tableId: 'custom/' + id(2), session: { id: id(3), officeId: id(1), organizationId: id(4), tableId: 'custom/' + id(2), gameType: 'chess', revision: 1, round: 1, status: 'PLAYING', players: [{ userId: id(5), name: 'Taylor', side: 'w', connected: true, ready: true, disconnectUntil: null }], spectators: 0, state: { kind: 'chess', fen: initialChessFen, turn: 'w', check: false, legalMoves: [{ from: 'e2', to: 'e4' }], history: [], lastMove: null, captured: [] }, outcome: null, drawOffer: null, rematch: [], createdAt: 1, startedAt: 1, endedAt: null } });
test('render-only chess model has 64 unique oriented squares, 32 initial pieces and rejects malformed boards', () => {
  assert.equal(new Set(chessSquares(false)).size, 64); assert.equal(chessSquares(false)[0], 'a8'); assert.equal(chessSquares(true)[0], 'h1');
  const pieces = chessPieces(initialChessFen); assert.equal(pieces.size, 32); assert.deepEqual(pieces.get('e1'), { side: 'w', type: 'k' }); assert.deepEqual(pieces.get('d8'), { side: 'b', type: 'q' });
  for (const invalid of ['', '8/8', '9/8/8/8/8/8/8/8', 'x7/8/8/8/8/8/8/8']) assert.equal(chessPieces(invalid).size, 0);
});
test('game channel sends compact commands only, correlates replies, ignores stale boards and rejects cross-office updates', async () => {
  const sent: GameRequest[] = [], received: (GameTableState | null)[] = [], channel = gameChannel(id(1), () => true, r => sent.push(r), r => received.push(r));
  try {
    const open = channel.request({ action: 'OPEN', tableId: table().tableId }); assert.deepEqual(Object.keys(sent[0]!).sort(), ['action', 'requestId', 'tableId']);
    assert.equal(channel.accept({ ...table(), officeId: id(9) }), false);
    channel.reply({ requestId: sent[0]!.requestId, ok: true, table: table() }); assert.ok((await open).ok);
    assert.ok(validGameTable(table(), id(1))); const latest = table(); latest.session!.revision = 3; channel.accept(latest); channel.accept(table()); assert.equal(received.at(-1)?.session?.revision, 3);
    const move = channel.request({ action: 'MOVE', tableId: table().tableId, sessionId: id(3), revision: 3, move: { from: 'e2', to: 'e4' } });
    assert.equal('fen' in sent[1]!, false); assert.equal('userId' in sent[1]!, false);
    channel.reply({ requestId: sent[1]!.requestId, ok: false, code: 'STALE', table: latest }); assert.equal((await move).code, 'STALE');
    const wrong = channel.request({ action: 'OPEN', tableId: table().tableId }); channel.reply({ requestId: sent[2]!.requestId, ok: true, table: { ...table(), officeId: id(8) } }); await assert.rejects(wrong, /verified/);
  } finally { channel.dispose(); }
});
test('disconnect cancels pending operations and disposal cannot revive a stale callback', async () => {
  let online = true; const sent: GameRequest[] = [], received: unknown[] = [], channel = gameChannel(id(1), () => online, r => sent.push(r), r => received.push(r));
  const pending = channel.request({ action: 'OPEN', tableId: table().tableId }); channel.disconnect(); await assert.rejects(pending, /Connection lost/);
  online = false; await assert.rejects(channel.request({ action: 'OPEN', tableId: table().tableId }), /Reconnect/);
  channel.dispose(); channel.accept(table()); assert.deepEqual(received, [null]);
});
test('game decoding rejects malformed pieces and player rows; synchronous transport failure clears pending timers', async () => {
  for (const change of [
    { players: [null] },
    { state: { ...table().session!.state, captured: [{ color: 'w', type: 'url' }] } },
    { state: { ...table().session!.state, lastMove: { from: 'z9', to: 'a1' } } },
    { state: { ...table().session!.state, turn: { toString: null } } },
  ]) assert.equal(validGameTable({ ...table(), session: { ...table().session!, ...change } }, id(1)), false);
  const channel = gameChannel(id(1), () => true, () => { throw Error('Socket closed'); });
  await assert.rejects(channel.request({ action: 'OPEN', tableId: table().tableId }), /Connection changed/); channel.dispose();
});
