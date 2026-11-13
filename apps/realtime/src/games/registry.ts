import { Chess } from 'chess.js';
import { parseChessMove, type ChessView, type GameOutcome, type GamePayload } from '../../../../packages/shared/src/games/protocol.ts';

export interface GameEngine {
  turn(): 'w' | 'b';
  view(): GamePayload;
  move(input: unknown): void;
  outcome(): GameOutcome | null;
}
export interface GameDefinition { id: string; seats: 2; create(): GameEngine }
export class ChessEngine implements GameEngine {
  private readonly chess: Chess;
  constructor(fen?: string) { this.chess = new Chess(fen); } // FEN injection is test/server-only, never a request field.
  turn() { return this.chess.turn(); }
  move(input: unknown) {
    const move = parseChessMove(input);
    if (!move) throw Error('Invalid move');
    this.chess.move(move);
  }
  outcome(): GameOutcome | null {
    if (this.chess.isCheckmate()) return { winner: this.chess.turn() === 'w' ? 'b' : 'w', reason: 'Checkmate' };
    if (this.chess.isStalemate()) return { winner: null, reason: 'Stalemate' };
    if (this.chess.isInsufficientMaterial()) return { winner: null, reason: 'Insufficient material' };
    if (this.chess.isThreefoldRepetition()) return { winner: null, reason: 'Threefold repetition' };
    if (this.chess.isDrawByFiftyMoves()) return { winner: null, reason: 'Fifty-move rule' };
    if (this.chess.isDraw()) return { winner: null, reason: 'Draw' };
    if (this.chess.history().length >= 1000) return { winner: null, reason: 'Move limit' };
    return null;
  }
  view(): ChessView & GamePayload {
    const history = this.chess.history({ verbose: true }), last = history.at(-1);
    return { kind: 'chess', fen: this.chess.fen(), turn: this.chess.turn(), check: this.chess.isCheck(),
      legalMoves: this.outcome() ? [] : this.chess.moves({ verbose: true }).map(m => ({ from: m.from, to: m.to, ...(m.promotion ? { promotion: m.promotion as 'q' | 'r' | 'b' | 'n' } : {}) })),
      history: history.map(m => m.san), lastMove: last ? { from: last.from, to: last.to, ...(last.promotion ? { promotion: last.promotion as 'q' | 'r' | 'b' | 'n' } : {}) } : null,
      captured: history.flatMap(m => m.captured ? [{ color: m.color === 'w' ? 'b' as const : 'w' as const, type: m.captured }] : []),
    };
  }
}
// New games register a real engine here and a table asset/UI renderer; lifecycle,
// authorization, revisions, spectators and reconnection remain shared.
export const gameRegistry: ReadonlyMap<string, GameDefinition> = new Map([
  ['chess', { id: 'chess', seats: 2, create: () => new ChessEngine() }],
]);
