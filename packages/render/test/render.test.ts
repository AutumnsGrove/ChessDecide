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

  it('pins the start-position SVG hash', () => {
    // The SVG is byte-stable everywhere. The PNG is not: resvg rasterises the file/rank labels with
    // whatever sans-serif the machine has, so a PNG hash differs between laptop and CI.
    // Regenerate after an intentional look change by printing sha256(boardSvg(START)).
    const sha = createHash('sha256').update(boardSvg(START)).digest('hex');
    expect(sha).toBe('5f403bdfd10a75cff0a447da8215936665b110296063ff377b37e96355df5b95');
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
