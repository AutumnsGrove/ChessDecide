import { Chess } from 'chess.js';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { boardPng } from './render.ts';

// ---- positions: model(white)-to-move positions from the sample game ----
(globalThis as any).window = {};
new Function('window', readFileSync('/home/user/ChessDecide/docs/mockups/sample_game.js', 'utf8'))((globalThis as any).window);
const G = (globalThis as any).window.SAMPLE_GAME.plies as any[];
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
export const positions = G.filter(p => p.by === 'model').map(p => {
  const i = p.ply - 1; const fen = i === 0 ? START : G[i - 1].fen;
  return { ply: p.ply, fen, history: G.slice(Math.max(0, i - 16), i).map(x => x.san) };
});

// ---- bare descriptors (PROMPTS.md v3 `plain`) ----
const NAMES: Record<string, string> = { p: 'Pawn', n: 'Knight', b: 'Bishop', r: 'Rook', q: 'Queen', k: 'King' };
const PN: Record<string, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
export function legal(fen: string) {
  const c = new Chess(fen);
  return c.moves({ verbose: true }).map(m => {
    const uci = m.from + m.to + (m.promotion ?? '');
    const d = `${NAMES[m.piece]} ${m.from} to ${m.to}` + (m.promotion ? `, promotes to ${PN[m.promotion]}` : '');
    return { uci, san: m.san, desc: d };
  }).sort((a, b) => (a.uci < b.uci ? -1 : 1));
}
const side = (fen: string) => (fen.split(' ')[1] === 'w' ? 'White' : 'Black');
const moveNo = (fen: string) => +fen.split(' ')[5];

export type Arm = 'text' | 'image';
export function buildRequest(model: string, pos: { fen: string; history: string[] }, arm: Arm, imgPx = 512) {
  const opts = legal(pos.fen);
  const criteria = Object.fromEntries(opts.map(o => [o.uci, o.desc]));
  const instructions = `Choose the strongest legal chess move for ${side(pos.fen)} in this position.`;
  let state: unknown;
  if (arm === 'text') {
    state = { game: 'chess', fen: pos.fen, side_to_move: side(pos.fen).toLowerCase(), move_number: moveNo(pos.fen), history_san: pos.history };
  } else {
    const b64 = boardPng(pos.fen, imgPx).toString('base64');
    state = [
      { game: 'chess', side_to_move: side(pos.fen).toLowerCase(), move_number: moveNo(pos.fen) },
      { type: 'image_url', image_url: { url: `data:image/png;base64,${b64}` } },
    ];
  }
  return { model, state, questions: { move: { type: 'choice', instructions: arm === 'image' ? `This image shows the current position. ${instructions}` : instructions, criteria } } };
}

// ---- stockfish scoring (child-position search, mover POV) ----
class Sf {
  p = spawn('/usr/games/stockfish'); buf = ''; waiters: ((l: string) => void)[] = [];
  constructor() { this.p.stdout.on('data', d => { this.buf += d; let i; while ((i = this.buf.indexOf('\n')) >= 0) { const l = this.buf.slice(0, i); this.buf = this.buf.slice(i + 1); this.waiters.forEach(w => w(l)); } }); this.p.stdin.write('uci\nsetoption name Threads value 1\nsetoption name Hash value 64\n'); }
  async search(fen: string, depth: number): Promise<number> {
    return new Promise(res => { let cp = 0; const w = (l: string) => { const m = l.match(/score (cp|mate) (-?\d+)/); if (m && / depth /.test(l)) cp = m[1] === 'cp' ? +m[2] : (+m[2] > 0 ? 10000 : -10000); if (l.startsWith('bestmove')) { this.waiters = this.waiters.filter(x => x !== w); res(cp); } }; this.waiters.push(w); this.p.stdin.write(`position fen ${fen}\ngo depth ${depth}\n`); });
  }
  close() { this.p.stdin.write('quit\n'); }
}
export async function oracle(fen: string, depth = 10) {
  const sf = new Sf(); const c = new Chess(fen); const out: Record<string, number> = {};
  for (const m of c.moves({ verbose: true })) {
    const ch = new Chess(fen); ch.move(m); const uci = m.from + m.to + (m.promotion ?? '');
    out[uci] = ch.isCheckmate() ? 1000 : ch.isDraw() ? 0 : Math.max(-1000, Math.min(1000, -(await sf.search(ch.fen(), depth))));
  }
  sf.close(); const best = Math.max(...Object.values(out));
  return { cp: out, best, cpl: Object.fromEntries(Object.entries(out).map(([k, v]) => [k, best - v])) };
}
