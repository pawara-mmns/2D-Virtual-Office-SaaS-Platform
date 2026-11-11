import type { ChessPieceType, GameSide } from '../../../../../packages/shared/src/games/protocol.ts';
export const initialChessFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
export const pieceNames: Record<ChessPieceType, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
export function chessSquares(flipped: boolean) {
  const files = flipped ? 'hgfedcba' : 'abcdefgh', ranks = flipped ? '12345678' : '87654321';
  return [...ranks].flatMap(rank => [...files].map(file => file + rank));
}
// Render-only FEN decoding. The browser never authorizes a move or sends a FEN.
export function chessPieces(fen: string): Map<string, { side: GameSide; type: ChessPieceType }> {
  const result = new Map<string, { side: GameSide; type: ChessPieceType }>(), rows = fen.split(' ')[0]?.split('/');
  if (rows?.length !== 8) return result;
  for (const [index, row] of rows.entries()) {
    let file = 0;
    for (const char of row) {
      if (/^[1-8]$/.test(char)) { file += Number(char); continue; }
      if (!/^[pnbrqkPNBRQK]$/.test(char) || file >= 8) return new Map();
      result.set('abcdefgh'[file++]! + (8 - index), { side: char === char.toUpperCase() ? 'w' : 'b', type: char.toLowerCase() as ChessPieceType });
    }
    if (file !== 8) return new Map();
  }
  return result;
}
