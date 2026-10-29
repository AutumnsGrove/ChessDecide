/** Leaderboard maths, METRICS.md B6. Pure and deterministic. */
import { GRID_MAX, GRID_MIN, estimate, posterior, probABeatsB, type EloEstimate, type RatedGame } from './elo.ts';
import { DEFAULT_LADDER, type LadderLevel } from './ladder.ts';
import type { SeriesStats } from './metrics.ts';
import type { SeriesStatus } from './series-events.ts';

/** One arm's candidate series, as the db layer hands it over. */
export interface ArmSeries {
  arm_id: string; model: string; arm: string;
  series_id: string; status: SeriesStatus; ladder_version: number;
  games: RatedGame[]; w: number; d: number; l: number; cost_usd: number;
  stats: SeriesStats;
}

export interface LeaderRow {
  arm_id: string; model: string; arm: string;
  series_id: string; status: SeriesStatus;
  games: number; elo: EloEstimate;
  w: number; d: number; l: number; score_pct: number;
  acpl: number | null; acceptable_rate: number | null; blunder_rate: number | null;
  cost_usd: number; cost_per_game: number | null;
  separated_from: string[];
}

export interface LeaderReference { id: string; label: string; elo: number }

export interface CompareResult { p_a_gt_b: number; diff_mean: number; diff_lo: number; diff_hi: number }

/**
 * One series per arm: its latest **finished** series, else the series with the most finished games
 * (ties go to the later series id — series ids are ULIDs, so they sort by creation time).
 * Only series on `ladderVersion`: Elo is only comparable on one ruler.
 * Metadata-only variant, so the db layer can pick first and only load the series it needs.
 */
export interface SeriesPickMeta {
  arm_id: string; series_id: string; status: SeriesStatus; ladder_version: number; finished_games: number;
}

const latest = <T extends { series_id: string }>(xs: readonly T[]) =>
  [...xs].sort((a, b) => (a.series_id < b.series_id ? 1 : a.series_id > b.series_id ? -1 : 0))[0]!;

function pickPerArm<T extends { arm_id: string; series_id: string; status: SeriesStatus; ladder_version: number }>(
  input: readonly T[], ladderVersion: number, finishedGames: (t: T) => number,
): T[] {
  const byArm = new Map<string, T[]>();
  for (const s of input) {
    if (s.ladder_version !== ladderVersion) continue;
    const list = byArm.get(s.arm_id) ?? [];
    list.push(s);
    byArm.set(s.arm_id, list);
  }
  const out: T[] = [];
  for (const list of byArm.values()) {
    const finished = list.filter((s) => s.status === 'finished');
    if (finished.length) { out.push(latest(finished)); continue; }
    const most = Math.max(...list.map(finishedGames));
    out.push(latest(list.filter((s) => finishedGames(s) === most)));
  }
  return out;
}

export function pickLeaderSeriesIds(input: readonly SeriesPickMeta[], ladderVersion: number): string[] {
  return pickPerArm(input, ladderVersion, (s) => s.finished_games).map((s) => s.series_id);
}

export function pickLeaderSeries(input: readonly ArmSeries[], ladderVersion: number): ArmSeries[] {
  return pickPerArm(input, ladderVersion, (s) => s.games.length);
}

/**
 * Rows sorted by Elo mean (display only) plus the ladder ticks to draw against.
 * Arms with no rated game are left out: a leaderboard is evidence, and an empty series is not.
 */
export function buildLeaderboard(
  input: readonly ArmSeries[],
  ladderVersion: number,
  levels: readonly LadderLevel[] = DEFAULT_LADDER.levels,
): { rows: LeaderRow[]; reference: LeaderReference[] } {
  const rows: LeaderRow[] = pickLeaderSeries(input, ladderVersion).filter((s) => s.games.length > 0).map((s) => {
    const elo = estimate(s.games);
    return {
      arm_id: s.arm_id, model: s.model, arm: s.arm, series_id: s.series_id, status: s.status,
      games: elo.games, elo, w: elo.w, d: elo.d, l: elo.l, score_pct: elo.score_pct,
      acpl: s.stats.acpl, acceptable_rate: s.stats.acceptable_rate, blunder_rate: s.stats.blunder_rate,
      cost_usd: s.cost_usd, cost_per_game: s.stats.cost_per_game,
      separated_from: [],
    };
  });
  for (const row of rows) {
    row.separated_from = rows
      .filter((o) => o.arm_id !== row.arm_id && (o.elo.hi < row.elo.lo || o.elo.lo > row.elo.hi))
      .map((o) => o.arm_id);
  }
  rows.sort((a, b) => b.elo.mean - a.elo.mean);
  return { rows, reference: levels.map((l) => ({ id: l.id, label: l.label, elo: l.elo })) };
}

/** Difference posterior of two arms by grid convolution (B6): `P(A > B)` and the Elo gap. */
export function compareArms(a: readonly RatedGame[], b: readonly RatedGame[]): CompareResult {
  const pa = posterior(a), pb = posterior(b);
  const n = 2 * (GRID_MAX - GRID_MIN) + 1;
  const off = GRID_MAX - GRID_MIN;
  const diff = new Float64Array(n);
  // Only move mass above 1e-12; the tails never matter and this keeps it ~O(10^6).
  const hotA: number[] = [], hotB: number[] = [];
  for (let i = 0; i < pa.length; i++) if (pa[i]! > 1e-12) hotA.push(i);
  for (let j = 0; j < pb.length; j++) if (pb[j]! > 1e-12) hotB.push(j);
  for (const i of hotA) for (const j of hotB) diff[i - j + off] = diff[i - j + off]! + pa[i]! * pb[j]!;
  let mean = 0, total = 0;
  for (let k = 0; k < n; k++) { mean += (k - off) * diff[k]!; total += diff[k]!; }
  const quantile = (q: number) => {
    let c = 0;
    for (let k = 0; k < n; k++) { c += diff[k]!; if (c >= q) return k - off; }
    return n - 1 - off;
  };
  return {
    p_a_gt_b: probABeatsB(pa, pb),
    diff_mean: total > 0 ? mean / total : 0,
    diff_lo: quantile(0.025),
    diff_hi: quantile(0.975),
  };
}
