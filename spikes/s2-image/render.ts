import { readFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';
const css = readFileSync('/home/user/ChessDecide/docs/mockups/vendor/chessground.cburnett.css', 'utf8');
const PIECES: Record<string, string> = {};
const map: Record<string, string> = { pawn: 'p', bishop: 'b', knight: 'n', rook: 'r', queen: 'q', king: 'k' };
for (const m of css.matchAll(/piece\.(\w+)\.(white|black) \{\s*background-image: url\('data:image\/svg\+xml;base64,([^']+)'\)/g)) {
  const k = map[m[1]]; PIECES[m[2] === 'white' ? k.toUpperCase() : k] = Buffer.from(m[3], 'base64').toString('utf8');
}
/** Deterministic board SVG: White at the bottom, coordinates, no highlights or arrows. */
export function boardSvg(fen: string, size = 512): string {
  const sq = size / 8, light = '#f0d9b5', dark = '#b58863';
  let out = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`;
  const rows = fen.split(' ')[0].split('/');
  for (let r = 0; r < 8; r++) {
    let f = 0;
    for (const c of rows[r]) {
      if (/\d/.test(c)) { f += +c; continue; }
      f++;
    }
  }
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++)
    out += `<rect x="${f * sq}" y="${r * sq}" width="${sq}" height="${sq}" fill="${(r + f) % 2 ? dark : light}"/>`;
  for (let r = 0; r < 8; r++) {
    let f = 0;
    for (const c of rows[r]) {
      if (/\d/.test(c)) { f += +c; continue; }
      const inner = PIECES[c].replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
      out += `<g transform="translate(${f * sq} ${r * sq}) scale(${sq / 45})">${inner}</g>`;
      f++;
    }
  }
  for (let i = 0; i < 8; i++) {
    const col = i % 2 ? light : dark, col2 = i % 2 ? dark : light;
    out += `<text x="${i * sq + sq - 4}" y="${size - 4}" font-size="${sq * 0.2}" font-family="sans-serif" text-anchor="end" fill="${(7 + i) % 2 ? light : dark}">${'abcdefgh'[i]}</text>`;
    out += `<text x="3" y="${i * sq + sq * 0.22}" font-size="${sq * 0.2}" font-family="sans-serif" fill="${i % 2 ? light : dark}">${8 - i}</text>`;
  }
  return out + '</svg>';
}
export function boardPng(fen: string, size = 512): Buffer {
  return Buffer.from(new Resvg(boardSvg(fen, size), { fitTo: { mode: 'width', value: size } }).render().asPng());
}
if (process.argv[1].endsWith('render.ts')) {
  const fen = process.argv[2] ?? 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4';
  const png = boardPng(fen); (await import('node:fs')).writeFileSync(process.argv[3] ?? 'board.png', png); console.log('bytes', png.length);
}
