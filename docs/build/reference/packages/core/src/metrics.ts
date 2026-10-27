/** Series secondary metrics, METRICS.md B7 (definitions) and §5–§7. Pure. */
import type { Color, Ply } from './types.ts';

export interface StatsGame {
  modelColor: Color; score: 0 | 0.5 | 1; plies: readonly Ply[]; costUsd: number; adjudicated: boolean;
}
export interface SeriesStats {
  games: number; model_plies: number;
  acpl: number | null; acpl_median: number | null;
  acceptable_rate: number | null; mistake_rate: number | null; blunder_rate: number | null;
  mean_p_acceptable: number | null; mean_e_win_loss: number | null;
  brier: number | null; ece: number | null;
  score_as_white: number | null; score_as_black: number | null;
  avg_plies: number | null; adjudicated_frac: number | null; cost_per_game: number | null;
  latency_p50: number | null; latency_p95: number | null; avg_input_tokens: number | null;
}

const mean = (a: readonly number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
/** Linear-interpolated percentile, q in [0,1]. */
export function percentile(a: readonly number[], q: number): number | null {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y), pos = (s.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return s[lo]! + (s[hi]! - s[lo]!) * (pos - lo);
}
export const median = (a: readonly number[]) => percentile(a, 0.5);

/** ECE over 10 equal-width bins of predicted probability. `pairs` = [p_pick, acceptable 0|1]. */
export function ece(pairs: ReadonlyArray<readonly [number, 0 | 1]>): number | null {
  if (!pairs.length) return null;
  const bins: Array<Array<readonly [number, 0 | 1]>> = Array.from({ length: 10 }, () => []);
  for (const p of pairs) bins[Math.min(9, Math.floor(p[0] * 10))]!.push(p);
  let e = 0;
  for (const b of bins) if (b.length) e += (b.length / pairs.length) * Math.abs(mean(b.map((x) => x[0]))! - mean(b.map((x) => x[1]))!);
  return e;
}

export function seriesStats(games: readonly StatsGame[]): SeriesStats {
  const judged = games.flatMap((g) => g.plies.filter((p) => p.by === 'model' && !p.forced && p.judge));
  const decisions = games.flatMap((g) => g.plies.filter((p) => p.by === 'model' && !p.forced && p.decision && !p.decision.cache_hit));
  const cpl = judged.map((p) => p.judge!.cpl);
  const pairs = judged.filter((p) => p.decision?.p_pick !== undefined).map((p) => [p.decision!.p_pick!, p.judge!.acceptable ? 1 : 0] as const);
  const asColor = (c: Color) => mean(games.filter((g) => g.modelColor === c).map((g) => g.score));
  const rate = (f: (p: Ply) => boolean) => (judged.length ? judged.filter(f).length / judged.length : null);
  return {
    games: games.length, model_plies: judged.length,
    acpl: mean(cpl), acpl_median: median(cpl),
    acceptable_rate: rate((p) => p.judge!.acceptable),
    mistake_rate: rate((p) => p.judge!.win_loss >= 10),
    blunder_rate: rate((p) => p.judge!.win_loss >= 20),
    mean_p_acceptable: mean(judged.flatMap((p) => (p.judge!.p_acceptable !== undefined ? [p.judge!.p_acceptable] : []))),
    mean_e_win_loss: mean(judged.flatMap((p) => (p.judge!.e_win_loss !== undefined ? [p.judge!.e_win_loss] : []))),
    brier: mean(pairs.map(([p, a]) => (p - a) ** 2)),
    ece: ece(pairs),
    score_as_white: asColor('white'), score_as_black: asColor('black'),
    avg_plies: mean(games.map((g) => g.plies.length)),
    adjudicated_frac: games.length ? games.filter((g) => g.adjudicated).length / games.length : null,
    cost_per_game: mean(games.map((g) => g.costUsd)),
    latency_p50: percentile(decisions.map((p) => p.decision!.latency_ms), 0.5),
    latency_p95: percentile(decisions.map((p) => p.decision!.latency_ms), 0.95),
    avg_input_tokens: mean(decisions.map((p) => p.decision!.usage.input_tokens)),
  };
}
