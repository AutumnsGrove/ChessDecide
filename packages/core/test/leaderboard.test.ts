import { describe, expect, it } from 'vitest';
import { buildLeaderboard, compareArms, pickLeaderSeries, type ArmSeries } from '../src/leaderboard.ts';
import type { RatedGame } from '../src/elo.ts';
import type { SeriesStats } from '../src/metrics.ts';
import type { SeriesStatus } from '../src/series-events.ts';

const stats = (acpl: number | null = 100): SeriesStats => ({
  games: 25, model_plies: 300,
  acpl, acpl_median: acpl, acceptable_rate: 0.8, mistake_rate: 0.2, blunder_rate: 0.1,
  mean_p_acceptable: 0.75, mean_e_win_loss: 8, brier: 0.2, ece: 0.1,
  score_as_white: 0.5, score_as_black: 0.5,
  avg_plies: 40, adjudicated_frac: 0.8, cost_per_game: 0.001,
  latency_p50: 400, latency_p95: 900, avg_input_tokens: 900,
});

const h2h = (oppElo: number, scores: Array<0 | 0.5 | 1>): RatedGame[] => scores.map((s) => ({ opponentElo: oppElo, score: s }));

interface ArmOpts {
  arm_id?: string; series_id?: string; status?: SeriesStatus; ladder_version?: number;
  games?: RatedGame[]; cost_usd?: number; model?: string; arm?: string;
}

const armSeries = (o: ArmOpts = {}): ArmSeries => {
  const games = o.games ?? h2h(1000, [1, 1, 1, 0, 0.5]);
  return {
    arm_id: o.arm_id ?? 'jev-clean', model: o.model ?? 'typesafe/jev-1.14', arm: o.arm ?? 'clean',
    series_id: o.series_id ?? '01M0000000000000000000001', status: o.status ?? 'finished',
    ladder_version: o.ladder_version ?? 2, games,
    w: games.filter((g) => g.score === 1).length,
    d: games.filter((g) => g.score === 0.5).length,
    l: games.filter((g) => g.score === 0).length,
    cost_usd: o.cost_usd ?? 0.01, stats: stats(),
  };
};

const strong = h2h(1000, Array.from({ length: 25 }, (_, i) => (i === 0 ? 0.5 : 1) as 0 | 0.5 | 1));
const weak = h2h(1000, Array.from({ length: 25 }, (_, i) => (i === 0 ? 0.5 : 0) as 0 | 0.5 | 1));

describe('pickLeaderSeries', () => {
  it('prefers the latest finished series over a newer unfinished one', () => {
    const picked = pickLeaderSeries([
      armSeries({ series_id: '01M00000000000000000000AA', status: 'finished' }),
      armSeries({ series_id: '01M00000000000000000000BB', status: 'paused', games: [...strong, ...strong] }),
    ], 2);
    expect(picked).toHaveLength(1);
    expect(picked[0]!.series_id).toBe('01M00000000000000000000AA');
  });

  it('takes the latest finished series when an arm finished two', () => {
    const picked = pickLeaderSeries([
      armSeries({ series_id: '01M00000000000000000000AA' }),
      armSeries({ series_id: '01M00000000000000000000BB' }),
    ], 2);
    expect(picked.map((s) => s.series_id)).toEqual(['01M00000000000000000000BB']);
  });

  it('falls back to the series with the most games when nothing finished', () => {
    const picked = pickLeaderSeries([
      armSeries({ series_id: '01M00000000000000000000AA', status: 'running', games: h2h(1000, [1]) }),
      armSeries({ series_id: '01M00000000000000000000BB', status: 'paused', games: h2h(1000, [1, 0, 1]) }),
      armSeries({ series_id: '01M00000000000000000000CC', status: 'stopped_budget', games: h2h(1000, [1, 0]) }),
    ], 2);
    expect(picked.map((s) => s.series_id)).toEqual(['01M00000000000000000000BB']);
  });

  it('filters by ladder version and keeps one row per arm', () => {
    const picked = pickLeaderSeries([
      armSeries({ arm_id: 'a', series_id: '01M00000000000000000000AA', ladder_version: 1 }),
      armSeries({ arm_id: 'a', series_id: '01M00000000000000000000BB', ladder_version: 2 }),
      armSeries({ arm_id: 'b', series_id: '01M00000000000000000000CC', ladder_version: 2 }),
    ], 2);
    expect(picked.map((s) => s.arm_id).sort()).toEqual(['a', 'b']);
    expect(picked.find((s) => s.arm_id === 'a')!.series_id).toBe('01M00000000000000000000BB');
  });

  it('returns nothing for a ladder version no series used', () => {
    expect(pickLeaderSeries([armSeries({ ladder_version: 2 })], 1)).toEqual([]);
  });
});

describe('buildLeaderboard', () => {
  const board = buildLeaderboard([
    armSeries({ arm_id: 'jev-clean', games: weak, cost_usd: 0.03 }),
    armSeries({ arm_id: 'jev-hinted', games: strong, cost_usd: 0.02 }),
  ], 2);

  it('sorts rows by Elo mean for display', () => {
    expect(board.rows.map((r) => r.arm_id)).toEqual(['jev-hinted', 'jev-clean']);
    expect(board.rows[0]!.elo.mean).toBeGreaterThan(board.rows[1]!.elo.mean);
  });

  it('marks disjoint intervals as separated, both ways', () => {
    expect(board.rows[0]!.separated_from).toEqual(['jev-clean']);
    expect(board.rows[1]!.separated_from).toEqual(['jev-hinted']);
  });

  it('does not separate overlapping intervals', () => {
    const overlapping = buildLeaderboard([
      armSeries({ arm_id: 'a', games: h2h(1000, [1, 0, 1, 0, 1]) }),
      armSeries({ arm_id: 'b', games: h2h(1000, [1, 1, 0, 0, 0]) }),
    ], 2);
    expect(overlapping.rows[0]!.separated_from).toEqual([]);
    expect(overlapping.rows[1]!.separated_from).toEqual([]);
  });

  it('carries the row metrics and reference ticks', () => {
    const row = board.rows[0]!;
    expect(row).toMatchObject({ model: 'typesafe/jev-1.14', arm: 'clean', games: 25 });
    expect(row.acpl).toBe(100);
    expect(row.cost_per_game).toBe(0.001);
    expect(board.reference.length).toBe(12);
    expect(board.reference[0]).toEqual({ id: 'random', label: 'Random mover', elo: 250 });
  });

  it('uses a calibrated ladder for the reference when one is passed', () => {
    const b = buildLeaderboard([armSeries()], 2, [
      { id: 'uci1320', kind: 'uci', label: 'Stockfish 1320', elo: 1312 },
    ]);
    expect(b.reference).toEqual([{ id: 'uci1320', label: 'Stockfish 1320', elo: 1312 }]);
  });

  it('leaves out an arm with no rated game', () => {
    const b = buildLeaderboard([armSeries({ arm_id: 'empty', games: [] }), armSeries({ arm_id: 'rated' })], 2);
    expect(b.rows.map((r) => r.arm_id)).toEqual(['rated']);
    expect(buildLeaderboard([armSeries({ games: [] })], 2).rows).toEqual([]);
  });
});

describe('compareArms', () => {
  it('is 0.5 at zero difference for identical series', () => {
    const c = compareArms(h2h(1000, [1, 0, 0.5]), h2h(1000, [1, 0, 0.5]));
    expect(c.p_a_gt_b).toBeCloseTo(0.5, 6);
    expect(Math.abs(c.diff_mean)).toBeLessThan(1e-6);
    expect(c.diff_lo).toBeLessThan(0);
    expect(c.diff_hi).toBeGreaterThan(0);
  });

  it('is near 1 for a clearly stronger arm and brackets the gap', () => {
    const c = compareArms(strong, weak);
    expect(c.p_a_gt_b).toBeGreaterThan(0.99);
    expect(c.diff_mean).toBeGreaterThan(0);
    expect(c.diff_lo).toBeGreaterThan(0);
    expect(c.diff_lo).toBeLessThan(c.diff_mean);
    expect(c.diff_hi).toBeGreaterThan(c.diff_mean);
  });

  it('is near 0 when the order is reversed, with the negated gap', () => {
    const ab = compareArms(strong, weak), ba = compareArms(weak, strong);
    expect(ba.p_a_gt_b).toBeLessThan(0.01);
    expect(ba.diff_mean).toBeCloseTo(-ab.diff_mean, 6);
    expect(ba.diff_lo).toBeCloseTo(-ab.diff_hi, 6);
  });
});
