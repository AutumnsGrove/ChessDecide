import { describe, expect, it } from 'vitest';
import { START_FEN } from '../src/types.ts';
import { applyMove, descAnnotated, descPlain, legalMoves, outcomeOf, perft, positionKey } from '../src/chess.ts';

const ITALIAN = 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4';

describe('chess wrapper', () => {
  it('perft', () => {
    expect(perft(START_FEN, 3)).toBe(8902);
    expect(perft('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', 2)).toBe(2039);
  });
  it.skipIf(!process.env.SLOW)('perft depth 4 (slow, ~40 s)', () => {
    expect(perft(START_FEN, 4)).toBe(197281);
  }, 180_000);
  it('legal moves are sorted by UCI', () => {
    const u = legalMoves(START_FEN).map((m) => m.uci);
    expect(u).toEqual([...u].sort());
    expect(u).toHaveLength(20);
  });
  it('castling is the king move; promotions carry a lowercase letter', () => {
    const c = legalMoves('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    expect(c.find((m) => m.uci === 'e1g1')?.castle).toBe('k');
    expect(c.find((m) => m.uci === 'e1c1')?.castle).toBe('q');
    const p = legalMoves('8/P7/8/8/8/8/8/k6K w - - 0 1').filter((m) => m.promo);
    expect(p.map((m) => m.uci)).toEqual(['a7a8b', 'a7a8n', 'a7a8q', 'a7a8r']);
  });
  it('descriptors: plain is bare, annotated adds hints', () => {
    const m = legalMoves(ITALIAN).find((x) => x.uci === 'h5f7')!;
    expect(descPlain(m)).toBe('Queen h5 to f7');
    expect(descAnnotated(m)).toBe('Queen h5 to f7, captures pawn, checkmate');
    expect(m.san).toBe('Qxf7#');
    const ep = legalMoves('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 2').find((x) => x.uci === 'e5d6')!;
    expect(descPlain(ep)).toBe('Pawn e5 to d6');
    expect(descAnnotated(ep)).toBe('Pawn e5 to d6, captures pawn en passant');
    const castle = legalMoves('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1').find((x) => x.uci === 'e1g1')!;
    expect(descPlain(castle)).toBe('King e1 to g1');
    expect(descAnnotated(castle)).toBe('King e1 to g1, castles kingside');
    const promo = legalMoves('1r2k3/P7/8/8/8/8/8/4K3 w - - 0 1').find((x) => x.uci === 'a7b8q')!;
    expect(descPlain(promo)).toBe('Pawn a7 to b8, promotes to queen');
    expect(descAnnotated(promo)).toBe('Pawn a7 to b8, captures rook, promotes to queen, check');
  });
  it('outcomes', () => {
    expect(outcomeOf('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1', [])).toBe('stalemate');
    expect(outcomeOf('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3', [])).toBe('checkmate');
    expect(outcomeOf('8/8/8/8/8/8/8/K1k5 w - - 0 1', [])).toBe('insufficient');
    expect(outcomeOf('4k3/8/8/8/8/8/8/4K2R w - - 100 80', [])).toBe('fifty_move');
    const k = positionKey(ITALIAN);
    expect(outcomeOf(ITALIAN, [k, 'x', k])).toBe('threefold');
    expect(outcomeOf(ITALIAN, [k])).toBe('none');
  });
  it('applyMove returns SAN and new FEN; rejects illegal moves', () => {
    const r = applyMove(START_FEN, 'e2e4');
    expect(r.move.san).toBe('e4');
    expect(r.fen.startsWith('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq')).toBe(true);
    expect(() => applyMove(START_FEN, 'e2e5')).toThrow();
  });
});
