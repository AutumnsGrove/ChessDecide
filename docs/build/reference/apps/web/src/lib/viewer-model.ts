/** Pure helpers for the Viewer. Fixed templates over Stockfish numbers: NO generated commentary. */
import type { Game, Ply, PlayerDesc } from '@chessdecide/core';

export function playerLabel(p: PlayerDesc): string {
  if (p.type === 'model') return p.model;
  if (p.type === 'ladder') return p.level === 'random' ? 'Random mover' : `Ladder ${p.level}`;
  return `Stockfish ${p.elo}`;
}
/** Win bar fill for White, 0..100 (50 = level). Logistic on centipawns. */
export function evalPct(cp: number): number { return 50 + 50 * (2 / (1 + Math.exp(-cp / 300)) - 1); }
export const pawns = (cp: number) => (Math.abs(cp) / 100).toFixed(1);

export function leadSentence(cp: number, whiteName: string, blackName: string): string {
  if (Math.abs(cp) < 40) return 'The position is level.';
  const who = cp > 0 ? whiteName : blackName, a = Math.abs(cp);
  return `${who} is ${a < 120 ? 'slightly' : a < 300 ? 'clearly' : 'far'} ahead.`;
}

export interface StatusLine { title: string; tag?: { text: string; kind: 'ok' | 'inaccuracy' | 'mistake' | 'blunder' | 'forced' | 'engine' }; body: string; lead: string }

export function statusLine(game: Game, ply: Ply | null): StatusLine {
  const w = playerLabel(game.config.white), b = playerLabel(game.config.black);
  if (!ply) return { title: 'Start', body: 'Press play, or tap the graph to jump to any moment.', lead: '' };
  const name = ply.side === 'white' ? w : b;
  const lead = ply.eval ? leadSentence(ply.eval.white_eval_cp, w, b) : '';
  if (ply.by === 'engine') return { title: `${name} plays ${ply.san}`, tag: { text: 'Opponent', kind: 'engine' }, body: 'The opponent answers with its move.', lead };
  if (ply.forced) return { title: `${name} plays ${ply.san}`, tag: { text: 'Forced', kind: 'forced' }, body: 'The only legal move.', lead };
  const j = ply.judge;
  if (!j) return { title: `${name} plays ${ply.san}`, body: 'Waiting for Stockfish to judge this move.', lead };
  const loss = (j.cpl / 100).toFixed(1);
  const body = j.class === 'blunder' || j.class === 'mistake' ? `This cost about ${loss} pawns of advantage. Stockfish wanted ${j.best_san}.`
    : j.class === 'inaccuracy' ? `A small slip, about ${loss} pawns. Stockfish preferred ${j.best_san}.`
    : j.cpl <= 10 ? 'Matches what Stockfish would play.' : 'A sound move. Stockfish liked it nearly as much as its own pick.';
  return { title: `${name} plays ${ply.san}`, tag: { text: j.class === 'ok' ? 'Good' : j.class, kind: j.class }, body, lead };
}

/** SVG polyline points for the eval graph: x = ply index, y = White-POV cp clamped to +-600. */
export function graphPoints(plies: readonly Ply[], width = 300, height = 84): string {
  const n = Math.max(plies.length, 1);
  const y = (cp: number) => height / 2 - (Math.max(-600, Math.min(600, cp)) / 600) * (height / 2 - 4);
  return [`0,${height / 2}`, ...plies.map((p, i) => `${(((i + 1) / n) * width).toFixed(1)},${y(p.eval?.white_eval_cp ?? 0).toFixed(1)}`)].join(' ');
}
export const mistakeCount = (g: Game) => g.plies.filter((p) => p.by === 'model' && (p.judge?.class === 'mistake' || p.judge?.class === 'blunder')).length;
export function resultLabel(g: Game): string {
  if (g.result === '*') return g.status === 'finished' ? '—' : 'In progress';
  if (g.result === '1/2-1/2') return 'Draw';
  const modelIsWhite = g.config.white.type === 'model';
  const whiteWon = g.result === '1-0';
  const hasModel = g.config.white.type === 'model' || g.config.black.type === 'model';
  return hasModel ? (whiteWon === modelIsWhite ? 'Model won' : 'Model lost') : g.result;
}
