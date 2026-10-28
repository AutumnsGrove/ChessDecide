/** Pure helpers for the series screens. No generated commentary: fixed labels over stored numbers. */
import type { Block, EloEstimate, EloPoint, Series, SeriesGame, SeriesSize, SeriesStats } from '@chessdecide/core';

export function targetGames(size: SeriesSize): number | null {
  if (size.preset === 'quick') return 25;
  if (size.preset === 'standard') return 50;
  if (size.preset === 'custom') return size.games;
  return null;
}

export function progressLabel(series: Series): string {
  const done = series.games.filter((g) => g.status === 'finished').length;
  const target = targetGames(series.size);
  if (target !== null) return `${done} / ${target}`;
  const max = series.size.preset === 'completion' ? (series.size.max_games ?? 200) : 200;
  return `${done} / ~${max}`;
}

export const intervalLabel = (elo: EloEstimate | null): string =>
  elo ? `${Math.round(elo.mean)} ± ${Math.round(elo.half_width)}` : '—';

/** Rough expected 95 % half-width at n games (680 / sqrt(n)). */
export const precisionHint = (n: number): string => `≈ ±${Math.round(680 / Math.sqrt(Math.max(1, n)))} at ${n} games`;

/** Two 95 % intervals overlap (or touch). */
export const overlap = (a: EloEstimate, b: EloEstimate): boolean => a.lo <= b.hi && b.lo <= a.hi;

/** x(elo) on a 0..3000 axis of `width` units. */
export const ladderAxisScale = (width: number) => (elo: number): number =>
  (Math.max(0, Math.min(3000, elo)) / 3000) * width;

export interface ChartPoint { x: number; y: number; mean: number; lo: number; hi: number }
export interface ChartGeometry {
  line: string; band: string; points: ChartPoint[];
  x: (i: number) => number; y: (elo: number) => number;
}

/** Mean line + 95 % band over the Elo history, on a fixed 0..3000 y-axis. */
export function eloChartPoints(history: readonly EloPoint[], w = 600, h = 220, min = 0, max = 3000): ChartGeometry {
  const x = (i: number) => (history.length <= 1 ? w / 2 : (i / (history.length - 1)) * w);
  const y = (elo: number) => h - ((Math.max(min, Math.min(max, elo)) - min) / (max - min)) * h;
  const points = history.map((p, i) => ({ x: x(i), y: y(p.mean), mean: p.mean, lo: p.lo, hi: p.hi }));
  const line = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const upper = history.map((p, i) => `${x(i).toFixed(1)},${y(p.hi).toFixed(1)}`);
  const lower = history.map((p, i) => `${x(i).toFixed(1)},${y(p.lo).toFixed(1)}`).reverse();
  const band = upper.length ? [...upper, ...lower].join(' ') : '';
  return { line, band, points, x, y };
}

export interface BlockRow { index: number; level: string; games: number; score: number; after: number }
export function blockRows(series: Series): BlockRow[] {
  return series.blocks.map((b: Block) => ({
    index: b.index, level: `${b.level_id} · ${Math.round(b.level_elo)}`,
    games: b.games, score: b.score, after: b.posterior_after,
  }));
}

export const METRIC_LABELS = {
  acpl: 'Average centipawn loss — lower is better',
  acpl_median: 'Median centipawn loss',
  acceptable_rate: 'Share of moves within 2 pawns of Stockfish',
  mistake_rate: 'Share of moves losing ≥ 10 % win chance',
  blunder_rate: 'Share of moves losing ≥ 20 % win chance',
  mean_p_acceptable: 'Average confidence in acceptable moves',
  mean_e_win_loss: 'Expected win-chance loss',
  brier: 'Probability calibration (Brier, lower is better)',
  ece: 'Calibration error (ECE, lower is better)',
  score_as_white: 'Score as White',
  score_as_black: 'Score as Black',
  avg_plies: 'Average game length',
  adjudicated_frac: 'Share of adjudicated games',
  cost_per_game: 'Cost per game',
  latency_p50: 'Median model latency',
  latency_p95: '95th percentile latency',
  avg_input_tokens: 'Average input tokens per call',
} as const;

export type MetricKey = keyof typeof METRIC_LABELS;

const pct = (v: number | null) => (v === null ? '—' : `${(v * 100).toFixed(1)} %`);
const num = (v: number | null, digits = 1) => (v === null ? '—' : v.toFixed(digits));
const money = (v: number | null) => (v === null ? '—' : `$${v.toFixed(4)}`);
const ms = (v: number | null) => (v === null ? '—' : `${Math.round(v)} ms`);

export function metricRows(s: SeriesStats): Array<{ key: MetricKey; label: string; value: string }> {
  const rows: Array<[MetricKey, string]> = [
    ['acpl', num(s.acpl)],
    ['acpl_median', num(s.acpl_median)],
    ['acceptable_rate', pct(s.acceptable_rate)],
    ['mistake_rate', pct(s.mistake_rate)],
    ['blunder_rate', pct(s.blunder_rate)],
    ['mean_p_acceptable', num(s.mean_p_acceptable, 2)],
    ['mean_e_win_loss', num(s.mean_e_win_loss)],
    ['brier', num(s.brier, 3)],
    ['ece', num(s.ece, 3)],
    ['score_as_white', pct(s.score_as_white)],
    ['score_as_black', pct(s.score_as_black)],
    ['avg_plies', num(s.avg_plies)],
    ['adjudicated_frac', pct(s.adjudicated_frac)],
    ['cost_per_game', money(s.cost_per_game)],
    ['latency_p50', ms(s.latency_p50)],
    ['latency_p95', ms(s.latency_p95)],
    ['avg_input_tokens', s.avg_input_tokens === null ? '—' : String(Math.round(s.avg_input_tokens))],
  ];
  return rows.map(([key, value]) => ({ key, label: METRIC_LABELS[key], value }));
}

export const gameChip = (g: SeriesGame): string => {
  if (g.status === 'aborted') return 'aborted';
  if (g.status !== 'finished') return 'running';
  if (g.model_score === 1) return 'won';
  if (g.model_score === 0.5) return 'draw';
  if (g.model_score === 0) return 'lost';
  return 'finished';
};
