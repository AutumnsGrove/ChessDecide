import { Chess, type Move as CjsMove } from 'chess.js';
import type { Color, Move, Outcome } from './types.ts';

const PIECE_NAME = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' } as const;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function toMove(m: CjsMove): Move {
  const castle = m.flags.includes('k') ? 'k' : m.flags.includes('q') ? 'q' : null;
  return {
    uci: m.from + m.to + (m.promotion ?? ''),
    san: m.san,
    from: m.from,
    to: m.to,
    ...(m.promotion ? { promo: m.promotion as Move['promo'] } : {}),
    piece: m.piece as Move['piece'],
    ...(m.captured ? { captured: m.captured as Move['captured'] } : {}),
    capture: m.flags.includes('c') || m.flags.includes('e'),
    ep: m.flags.includes('e'),
    castle,
    check: m.san.endsWith('+') || m.san.endsWith('#'),
    mate: m.san.endsWith('#'),
  };
}

/** Throws if the FEN is invalid. */
export function assertValidFen(fen: string): void {
  new Chess(fen);
}

/** All legal moves, sorted by UCI ascending (byte order). */
export function legalMoves(fen: string): Move[] {
  return new Chess(fen)
    .moves({ verbose: true })
    .map(toMove)
    .sort((a, b) => (a.uci < b.uci ? -1 : a.uci > b.uci ? 1 : 0));
}

export function applyMove(fen: string, uci: string): { fen: string; move: Move } {
  const c = new Chess(fen);
  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  const promotion = uci.length > 4 ? uci.slice(4) : undefined;
  const m = c.move({ from, to, ...(promotion ? { promotion } : {}) });
  return { fen: c.fen(), move: toMove(m) };
}

/** First four FEN fields: placement, side, castling, en passant. Used for repetition. */
export function positionKey(fen: string): string {
  return fen.split(' ').slice(0, 4).join(' ');
}

export function sideToMove(fen: string): Color {
  return fen.split(' ')[1] === 'w' ? 'white' : 'black';
}

export function moveNumber(fen: string): number {
  return Number(fen.split(' ')[5]);
}

export function halfmoveClock(fen: string): number {
  return Number(fen.split(' ')[4]);
}

export function pieceCount(fen: string): number {
  return (fen.split(' ')[0] ?? '').replace(/[^a-zA-Z]/g, '').length;
}

/**
 * Game outcome for `fen`. `previousKeys` = positionKey of every EARLIER position in the game
 * (including the start position), not including `fen` itself.
 * Order: checkmate, stalemate, insufficient, threefold, fifty_move.
 */
export function outcomeOf(fen: string, previousKeys: readonly string[]): Outcome {
  const c = new Chess(fen);
  if (c.isCheckmate()) return 'checkmate';
  if (c.isStalemate()) return 'stalemate';
  if (c.isInsufficientMaterial()) return 'insufficient';
  const key = positionKey(fen);
  if (previousKeys.filter((k) => k === key).length >= 2) return 'threefold';
  if (halfmoveClock(fen) >= 100) return 'fifty_move';
  return 'none';
}

export function isInCheck(fen: string): boolean {
  return new Chess(fen).isCheck();
}

/** `plain`: fully bare. Promotion text is kept because it separates e7e8q from e7e8n. */
export function descPlain(m: Move): string {
  let s = `${cap(PIECE_NAME[m.piece])} ${m.from} to ${m.to}`;
  if (m.promo) s += `, promotes to ${PIECE_NAME[m.promo]}`;
  return s;
}

/** `annotated`: capture, castle, promotion, then check/checkmate. */
export function descAnnotated(m: Move): string {
  let s = `${cap(PIECE_NAME[m.piece])} ${m.from} to ${m.to}`;
  if (m.ep) s += ', captures pawn en passant';
  else if (m.captured) s += `, captures ${PIECE_NAME[m.captured]}`;
  if (m.castle) s += `, castles ${m.castle === 'k' ? 'kingside' : 'queenside'}`;
  if (m.promo) s += `, promotes to ${PIECE_NAME[m.promo]}`;
  if (m.mate) s += ', checkmate';
  else if (m.check) s += ', check';
  return s;
}

export function perft(fen: string, depth: number): number {
  const c = new Chess(fen);
  const go = (d: number): number => {
    if (d === 0) return 1;
    let n = 0;
    for (const m of c.moves({ verbose: true })) {
      c.move(m);
      n += go(d - 1);
      c.undo();
    }
    return n;
  };
  return go(depth);
}
