"use client";
import { useEffect, useRef, useState } from 'react';
import { ArrowLeftRight, Check, Eye, RefreshCw, X } from 'lucide-react';
import { chessView, type GameAction, type GameCommand, type GameReply, type GameTableState, type GamePlayer, type GameSide } from '../../../../../packages/shared/src/games/protocol';
import { ChessPiece } from './chess-piece';
import { chessPieces, chessSquares, initialChessFen, pieceNames } from './chess-model';

type Props = { tableId: string; table?: GameTableState; userId?: string; online: boolean; request(command: GameCommand): Promise<GameReply>; onClose(): void };
export function GameOverlay({ tableId, table, userId, online, request, onClose }: Props) {
  const close = useRef<HTMLButtonElement>(null), mounted = useRef(true), busy = useRef(false);
  const [pending, setPending] = useState(true), [error, setError] = useState(''), [confirm, setConfirm] = useState(false);
  const [selection, setSelection] = useState<{ square: string; revision: number } | null>(null);
  const [promotion, setPromotion] = useState<{ from: string; to: string; revision: number } | null>(null);
  const [flip, setFlip] = useState(false), [focusSquare, setFocusSquare] = useState('e2');
  const s = table?.session, view = chessView(s?.state), own = s?.players.find(p => p.userId === userId);
  const flipped = (own?.side === 'b') !== flip;
  const squares = chessSquares(flipped), pieces = chessPieces(view?.fen ?? initialChessFen);
  const selected = selection?.revision === s?.revision ? selection?.square : null;
  const targets = view?.legalMoves.filter(m => m.from === selected) ?? [];
  const canMove = !!(online && !pending && s?.status === 'PLAYING' && own?.side === view?.turn && s.players.every(p => p.connected));
  useEffect(() => {
    mounted.current = true; close.current?.focus({ preventScroll: true }); busy.current = true;
    void request({ action: 'OPEN', tableId }).then(reply => { if (mounted.current && !reply.ok) setError(reply.message ?? 'The table could not be opened.'); if (!mounted.current && reply.ok && !reply.table?.session?.players.some(p => p.userId === userId)) void request({action:'UNWATCH',tableId}).catch(()=>{}); }).catch(failure => { if (mounted.current) setError(failure instanceof Error ? failure.message : 'The table could not be opened.'); }).finally(() => { busy.current = false; if (mounted.current) setPending(false); });
    return () => { mounted.current = false; };
  }, [request, tableId, userId]);
  const act = async (action: GameAction, extra: Partial<GameCommand> = {}) => {
    if (busy.current || !online) return;
    busy.current = true; setPending(true); setError(''); setConfirm(false);
    try {
      const reply = await request({ action, tableId, ...(!['OPEN', 'CREATE'].includes(action) && s ? { sessionId: s.id, revision: s.revision } : {}), ...extra });
      if (mounted.current) { if (!reply.ok) setError(reply.message ?? 'The action could not be accepted.'); else { setSelection(null); setPromotion(null); } }
    } catch (failure) { if (mounted.current) setError(failure instanceof Error ? failure.message : 'The game action could not be accepted.'); }
    finally { busy.current = false; if (mounted.current) setPending(false); }
  };
  const choose = (square: string) => {
    setFocusSquare(square);
    if (!canMove || !s) return;
    const moves = targets.filter(m => m.to === square);
    if (selected && moves.length) {
      if (moves.some(m => m.promotion)) setPromotion({ from: selected, to: square, revision: s.revision });
      else void act('MOVE', { move: { from: selected, to: square } });
    } else setSelection(pieces.get(square)?.side === own?.side ? { square, revision: s.revision } : null);
  };
  const title = !s ? 'Start a friendly match' : s.outcome ? `${s.outcome.winner ? (s.players.find(p => p.side === s.outcome!.winner)?.name ?? 'Player') + ' wins' : 'Draw'} · ${s.outcome.reason}` : s.status === 'WAITING' ? 'Waiting for a second player' : s.status === 'READY' ? 'Both players: ready up' : s.players.some(p => !p.connected) ? 'Paused · reconnect grace is 45 seconds' : `${view?.turn === 'w' ? 'White' : 'Black'} to move${view?.check ? ' · Check' : ''}`;
  const playerRow = (side: GameSide) => {
    const p: GamePlayer | undefined = s?.players.find(p => p.side === side);
    return <div className="chess-player" data-turn={s?.status === 'PLAYING' && view?.turn === side}><ChessPiece side={side} type="k" /><div><strong>{p?.name ?? (side === 'w' ? 'White seat' : 'Black seat')}{p?.userId === userId && <span> · You</span>}</strong><small>{!p ? 'Open seat' : !p.connected ? 'Reconnecting…' : s?.status === 'READY' ? p.ready ? 'Ready' : 'Not ready' : side === 'w' ? 'White' : 'Black'}</small></div><span className="chess-captures" aria-label={`Captured ${side === 'w' ? 'black' : 'white'} pieces`}>{view?.captured.filter(c => c.color !== side).map((c, index) => <ChessPiece key={index} side={c.color} type={c.type} />)}</span>{p?.ready && s?.status === 'READY' && <Check aria-hidden="true" />}</div>;
  };
  return <section className="office-game-panel" role="dialog" aria-modal="false" aria-label="Chess table" data-glass-surface="" data-glass-variant="elevated" onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (promotion) setPromotion(null); else if (confirm) setConfirm(false); else if (selected) setSelection(null); else onClose(); } }}>
    <header className="chess-header"><div><strong>Chess</strong><span>{s ? `Round ${s.round}` : 'Table lobby'} · {s?.spectators ?? 0} watching</span></div><button className="office-control" type="button" title="Refresh board" aria-label="Refresh chess board" disabled={!online || pending} onClick={() => void act(s ? 'SYNC' : 'OPEN')}><RefreshCw aria-hidden="true" /></button><button className="office-control" ref={close} type="button" aria-label="Close chess" title={own && s?.status === 'PLAYING' ? 'Close · your match stays active' : 'Close chess'} onClick={onClose}><X aria-hidden="true" /></button></header>
    <div className="chess-content">
      <p className="chess-status" role="status" aria-live="polite">{online ? title : 'Reconnecting to the office…'}</p>
      {playerRow(flipped ? 'w' : 'b')}
      <div className="chess-board-wrap">
        <div className="chess-board" role="grid" aria-label="Chess board" aria-readonly={!canMove} onKeyDown={event => {
          const offset = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowDown' ? 8 : event.key === 'ArrowUp' ? -8 : 0;
          if (!offset) return; event.preventDefault();
          const square = (event.target as HTMLElement).closest<HTMLElement>('[data-square]')?.dataset.square;
          const index = squares.indexOf(square ?? focusSquare), next = squares[Math.max(0, Math.min(63, index + offset))]!;
          setFocusSquare(next); event.currentTarget.querySelector<HTMLButtonElement>(`[data-square="${next}"]`)?.focus();
        }}>{Array.from({ length: 8 }, (_, row) => <div role="row" key={row}>{squares.slice(row * 8, row * 8 + 8).map((square, column) => {
          const p = pieces.get(square), target = targets.some(m => m.to === square), previous = view?.lastMove?.from === square || view?.lastMove?.to === square;
          return <button type="button" role="gridcell" key={square} data-square={square} data-dark={(row + column) % 2 === 1} data-selected={selected === square} data-previous={previous} data-target={canMove && target} data-check={view?.check && p?.type === 'k' && p.side === view.turn} aria-label={`${square}, ${p ? (p.side === 'w' ? 'white ' : 'black ') + pieceNames[p.type] : 'empty'}`} aria-selected={selected === square} aria-disabled={!canMove} tabIndex={focusSquare === square ? 0 : -1} onClick={() => choose(square)}>{p && <ChessPiece side={p.side} type={p.type} />}{column === 0 && <span className="chess-rank" aria-hidden="true">{square[1]}</span>}{row === 7 && <span className="chess-file" aria-hidden="true">{square[0]}</span>}</button>;
        })}</div>)}</div>
        {promotion && promotion.revision === s?.revision && <div className="chess-promotion" role="group" aria-label="Choose promotion"><span>Promote pawn</span>{(['q', 'r', 'b', 'n'] as const).map(piece => <button className="office-control" key={piece} type="button" aria-label={`Promote to ${pieceNames[piece]}`} onClick={() => void act('MOVE', { move: { from: promotion!.from, to: promotion!.to, promotion: piece } })}><ChessPiece type={piece} side={own?.side ?? 'w'} /></button>)}<button type="button" className="office-control" aria-label="Cancel promotion" onClick={() => setPromotion(null)}><X aria-hidden="true" /></button></div>}
      </div>
      {playerRow(flipped ? 'b' : 'w')}
      <div className="chess-meta"><span>{own ? `${own.side === 'w' ? 'White' : 'Black'} pieces` : <><Eye aria-hidden="true" /> Spectator · read only</>}</span><button className="office-control" type="button" aria-label="Flip board" title="Flip board" onClick={() => setFlip(value => !value)}><ArrowLeftRight aria-hidden="true" /></button></div>
      {!!view?.history.length && <details className="chess-history"><summary>Moves · {view.history.length} ply · {view.history.at(-1)}</summary><ol>{view.history.map((move, index) => <li key={index}>{index % 2 === 0 ? `${Math.floor(index / 2) + 1}. ` : ''}{move}</li>)}</ol></details>}
      {error && <p className="chess-error" role="alert">{error}</p>}
    </div>
    <footer className="chess-actions">
      {confirm ? <><span>Resign this match?</span><button className="office-control" type="button" onClick={() => setConfirm(false)}>Keep playing</button><button className="office-control chess-danger" type="button" onClick={() => void act('RESIGN')}>Confirm resign</button></> : <>
        {(!s || s.status === 'CLOSED') && <button type="button" className="office-control chess-primary" disabled={!online || pending} onClick={() => void act('CREATE')}>Create match</button>}
        {s?.status === 'WAITING' && !own && <button type="button" className="office-control chess-primary" disabled={!online || pending} onClick={() => void act('JOIN')}>Join match</button>}
        {s && !own && s.status !== 'CLOSED' && <button type="button" className="office-control" disabled={!online || pending} onClick={() => void act('SPECTATE')}>Spectate</button>}
        {s?.status === 'READY' && own && <button type="button" className="office-control chess-primary" disabled={!online || pending} onClick={() => void act('READY', { ready: !own.ready })}>{own.ready ? 'Cancel ready' : 'Ready to play'}</button>}
        {(s?.status === 'WAITING' || s?.status === 'READY') && own && <button type="button" className="office-control" disabled={!online || pending} onClick={() => void act('LEAVE')}>Leave lobby</button>}
        {s?.status === 'PLAYING' && own && <><button type="button" className="office-control" disabled={!online || pending || s.drawOffer === own.side} onClick={() => void act(s.drawOffer && s.drawOffer !== own.side ? 'ACCEPT_DRAW' : 'OFFER_DRAW')}>{s.drawOffer && s.drawOffer !== own.side ? 'Accept draw' : s.drawOffer === own.side ? 'Draw offered' : 'Offer draw'}</button><button type="button" className="office-control chess-danger" disabled={!online || pending} onClick={() => setConfirm(true)}>Resign</button></>}
        {s?.status === 'FINISHED' && own && <><button type="button" className="office-control chess-primary" disabled={!online || pending || s.rematch.includes(own.userId)} onClick={() => void act('REMATCH')}>{s.rematch.includes(own.userId) ? 'Rematch requested' : 'Rematch'}</button><button type="button" className="office-control" disabled={!online || pending} onClick={() => void act('LEAVE')}>Close match</button></>}
        {pending && <span role="status">Updating…</span>}
      </>}
    </footer>
  </section>;
}
