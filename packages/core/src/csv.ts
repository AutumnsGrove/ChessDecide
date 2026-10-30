/**
 * CSV exports (RFC 4180 quoting, `\n` newlines, empty field for null/undefined).
 * Headers are fixed by docs/build/tasks/T11-exports.md; keep them byte-for-byte.
 */
import type { LeaderRow } from './leaderboard.ts';
import type { Series } from './series-events.ts';

export type CsvValue = string | number | boolean | null | undefined;

export function csvField(value: CsvValue): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(header: readonly string[], rows: readonly (readonly CsvValue[])[]): string {
  return [header, ...rows].map((row) => row.map(csvField).join(',')).join('\n') + '\n';
}

export const SERIES_CSV_HEADER = [
  'index', 'block', 'level_id', 'level_elo', 'model_color', 'result', 'model_score',
  'termination', 'adjudicated', 'plies', 'acpl', 'cost_usd', 'game_id',
] as const;

/** One row per game, in play order. `model_score`/`acpl` stay empty until a game is rated/judged. */
export function seriesCsv(series: Series): string {
  return toCsv(SERIES_CSV_HEADER, series.games.map((g) => [
    g.index, g.block, g.level_id, g.level_elo, g.model_color, g.result, g.model_score,
    g.termination, g.adjudicated ? 1 : 0, g.plies, g.acpl_model, g.cost_usd, g.game_id,
  ]));
}

export const LEADERBOARD_CSV_HEADER = [
  'arm_id', 'model', 'arm', 'series_id', 'status', 'games', 'elo_mean', 'elo_lo', 'elo_hi',
  'w', 'd', 'l', 'score_pct', 'acpl', 'acceptable_rate', 'blunder_rate', 'cost_usd',
] as const;

/** One row per arm, exactly the columns the leaderboard shows (minus `separated_from`). */
export function leaderboardCsv(rows: readonly LeaderRow[]): string {
  return toCsv(LEADERBOARD_CSV_HEADER, rows.map((r) => [
    r.arm_id, r.model, r.arm, r.series_id, r.status, r.games,
    r.elo.mean, r.elo.lo, r.elo.hi, r.w, r.d, r.l, r.score_pct,
    r.acpl, r.acceptable_rate, r.blunder_rate, r.cost_usd,
  ]));
}
