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

export type DecisionTone = 'best' | 'neutral' | 'inaccuracy' | 'mistake' | 'blunder';
export interface DecisionRow {
  san: string; uci: string; p: number; cpl: number;
  isPick: boolean; isBest: boolean; tone: DecisionTone;
}

/** Tone for the Stockfish-loss chip. 0 cp is `best`; <= 0.2 pawns is neutral. */
export function cplTone(cpl: number): DecisionTone {
  if (cpl <= 0) return 'best';
  if (cpl <= 20) return 'neutral';
  if (cpl < 100) return 'inaccuracy';
  if (cpl < 200) return 'mistake';
  return 'blunder';
}

/**
 * Rows for the DecisionPanel: up to `limit`, sorted by P descending, always including the pick and
 * Stockfish's best. Empty for engine plies, forced plies and plies without a decision.
 */
export function decisionRows(ply: Ply, limit = 9): DecisionRow[] {
  const d = ply.decision;
  if (ply.by !== 'model' || ply.forced || !d) return [];
  const options = [...(d.top_options ?? [])];
  if (options.length === 0) return [];
  if (ply.judge && !options.some((o) => o.uci === ply.judge!.best_uci))
    options.push({ uci: ply.judge.best_uci, san: ply.judge.best_san, p: 0, cpl: 0 });
  const byP = (a: { p: number; cpl?: number; uci: string }, b: { p: number; cpl?: number; uci: string }) =>
    b.p - a.p || (a.cpl ?? 0) - (b.cpl ?? 0) || (a.uci < b.uci ? -1 : 1);
  const bestUci = ply.judge?.best_uci
    ?? [...options].sort((a, b) => (a.cpl ?? Infinity) - (b.cpl ?? Infinity) || b.p - a.p)[0]!.uci;
  const must = new Set([d.pick_uci, bestUci]);
  const sorted = [...options].sort(byP);
  const chosen = sorted.filter((o) => must.has(o.uci));
  for (const o of sorted) {
    if (chosen.length >= limit) break;
    if (!chosen.includes(o)) chosen.push(o);
  }
  return chosen.slice(0, limit).map((o) => {
    const cpl = o.cpl ?? 0;
    return {
      san: o.san, uci: o.uci, p: o.p, cpl,
      isPick: o.uci === d.pick_uci, isBest: o.uci === bestUci, tone: cplTone(cpl),
    };
  }).sort((a, b) => b.p - a.p || a.cpl - b.cpl || (a.uci < b.uci ? -1 : 1));
}
export function resultLabel(g: Game): string {
  if (g.result === '*') return g.status === 'finished' ? '—' : 'In progress';
  if (g.result === '1/2-1/2') return 'Draw';
  const modelIsWhite = g.config.white.type === 'model';
  const whiteWon = g.result === '1-0';
  const hasModel = g.config.white.type === 'model' || g.config.black.type === 'model';
  return hasModel ? (whiteWon === modelIsWhite ? 'Model won' : 'Model lost') : g.result;
}
