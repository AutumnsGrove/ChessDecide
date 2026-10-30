import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { BOARD_SIZE, boardDataUrl, boardPng, boardSvg } from '../src/index.ts';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const ITALIAN = 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4';
const PIECE_GROUPS = /<g transform=/g;

const pngSize = (png: Uint8Array) => {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  return { width: view.getUint32(16), height: view.getUint32(20) };
};

describe('board renderer', () => {
  it('renders the start position and the Italian-game position (snapshot)', () => {
    expect(boardSvg(START)).toMatchSnapshot('start');
    expect(boardSvg(ITALIAN)).toMatchSnapshot('italian');
  });

  it('is deterministic', () => {
    expect(boardSvg(START)).toBe(boardSvg(START));
    expect([...boardPng(START)]).toEqual([...boardPng(START)]);
    expect(boardSvg(START)).toBe(boardSvg('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1'));
  });

  it('produces a 512x512 PNG under 300 KB', () => {
    const png = boardPng(START);
    expect(pngSize(png)).toEqual({ width: BOARD_SIZE, height: BOARD_SIZE });
    expect(png.length).toBeLessThan(300 * 1024);
    expect(boardDataUrl(START).startsWith('data:image/png;base64,iVBOR')).toBe(true);
  });

  it('pins the start-position PNG hash', () => {
    // Regenerate after an intentional look change:
    //   node --experimental-strip-types -e "import('./packages/render/src/index.ts').then(m=>console.log(require('crypto').createHash('sha256').update(m.boardPng('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')).digest('hex')))"
    const sha = createHash('sha256').update(boardPng(START)).digest('hex');
    expect(sha).toBe('b4c5295453f62850e9dcb581ec65ad9eba1fb97c8fadd59c4b157f489125c0c0');
  });

  it('draws every piece, including a promoted queen', () => {
    const promoted = 'Q6k/8/8/8/8/8/8/K7 w - - 0 1';
    const svg = boardSvg(promoted);
    expect(svg.match(PIECE_GROUPS)).toHaveLength(3); // Q, k, K
    expect(boardPng(promoted).length).toBeGreaterThan(0);
    expect(boardSvg(promoted)).not.toBe(boardSvg('6qk/8/8/8/8/8/8/K7 w - - 0 1'));
  });

  it('keeps White at the bottom and rejects a bad FEN', () => {
    const a8 = boardSvg('8/8/8/8/8/8/8/8 w - - 0 1');
    expect(a8).toContain('fill="#f0d9b5"'); // a8 is light, drawn top-left
    expect(() => boardSvg('not-a-fen')).toThrow(/invalid FEN/);
    expect(() => boardSvg('8/8/8 w - - 0 1')).toThrow(/8 ranks/);
    expect(() => boardSvg('9/8/8/8/8/8/8/8 w - - 0 1')).toThrow(/squares/);
  });
});
