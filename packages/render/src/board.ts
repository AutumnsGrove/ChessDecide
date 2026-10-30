/**
 * Deterministic board images for the image arm. Spec: docs/build/tasks/T12-image-arm.md, D30.
 * Fixed look: #f0d9b5/#b58863, White at the bottom, file letters and rank numbers, no highlights
 * or arrows. Same FEN and size → identical SVG text and identical PNG bytes.
 */
import { Resvg } from '@resvg/resvg-js';
import { PIECES } from './pieces.ts';

export const BOARD_SIZE = 512;
export const LIGHT = '#f0d9b5';
export const DARK = '#b58863';
const FILES = 'abcdefgh';

/** Parse the board field; throws on anything that is not eight ranks of eight squares. */
function ranks(fen: string): string[] {
  const board = fen.trim().split(/\s+/)[0] ?? '';
  const rows = board.split('/');
  if (rows.length !== 8) throw new Error(`invalid FEN: expected 8 ranks, got ${rows.length}`);
  for (const [i, row] of rows.entries()) {
    let n = 0;
    for (const c of row) n += /[1-8]/.test(c) ? Number(c) : 1;
    if (n !== 8) throw new Error(`invalid FEN: rank ${8 - i} has ${n} squares`);
  }
  return rows;
}

function piece(key: string): string {
  const svg = PIECES[key];
  if (!svg) throw new Error(`invalid FEN: unknown piece "${key}"`);
  return svg.trim().replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
}

/** A standalone SVG board. Numbers are plain decimal so the output is byte-stable. */
export function boardSvg(fen: string, size = BOARD_SIZE): string {
  const rows = ranks(fen);
  const sq = size / 8;
  let out = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`;
  for (let r = 0; r < 8; r++)
    for (let f = 0; f < 8; f++)
      out += `<rect x="${f * sq}" y="${r * sq}" width="${sq}" height="${sq}" fill="${(r + f) % 2 === 0 ? LIGHT : DARK}"/>`;
  for (let r = 0; r < 8; r++) {
    let f = 0;
    for (const c of rows[r]!) {
      if (/[1-8]/.test(c)) { f += Number(c); continue; }
      out += `<g transform="translate(${f * sq} ${r * sq}) scale(${sq / 45})">${piece(c)}</g>`;
      f++;
    }
  }
  const label = sq * 0.2;
  for (let i = 0; i < 8; i++) {
    out += `<text x="${i * sq + sq - 4}" y="${size - 4}" font-size="${label}" font-family="sans-serif" text-anchor="end" fill="${(7 + i) % 2 === 0 ? DARK : LIGHT}">${FILES[i]}</text>`;
    out += `<text x="3" y="${i * sq + label + 2}" font-size="${label}" font-family="sans-serif" fill="${i % 2 === 0 ? LIGHT : DARK}">${8 - i}</text>`;
  }
  return out + '</svg>';
}

/** PNG bytes (512x512 by default). `fitTo` pins the output size so the bytes never depend on DPI. */
export function boardPng(fen: string, size = BOARD_SIZE): Uint8Array {
  const png = new Resvg(boardSvg(fen, size), { fitTo: { mode: 'width', value: size } }).render().asPng();
  return new Uint8Array(png);
}

/** `data:image/png;base64,…` — what the OpenRouter image message carries. */
export function boardDataUrl(fen: string, size = BOARD_SIZE): string {
  return `data:image/png;base64,${Buffer.from(boardPng(fen, size)).toString('base64')}`;
}
