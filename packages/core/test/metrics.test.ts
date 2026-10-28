import { describe, expect, it } from 'vitest';
import { ece, median, percentile, seriesStats, type StatsGame } from '../src/metrics.ts';
import type { Ply } from '../src/types.ts';

const mp = (cpl: number, wl: number, p: number, acceptable: boolean, over: Partial<Ply> = {}): Ply => ({
  ply: 1, side: 'white', by: 'model', uci: 'a2a3', san: 'a3', fen_after: '', created_at: '',
  judge: { depth: 14, best_uci: 'e2e4', best_san: 'e4', best_cp: 0, played_cp: -cpl, cpl, win_loss: wl, class: 'ok', acceptable, p_acceptable: 0.5, e_win_loss: 4 },
  decision: { model_slug: 'm', arm: 'clean', pick_uci: 'a2a3', p_pick: p, n_options: 20, top_options: [], latency_ms: 200, usage: { input_tokens: 900, output_tokens: 0, cost_usd: 0 }, cache_hit: false, retries: 0, attempt_id: 1 }, ...over,
});
describe('series stats', () => {
  it('percentiles and median interpolate', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5); expect(percentile([10], 0.95)).toBe(10); expect(percentile([], 0.5)).toBeNull();
    expect(percentile([0, 100], 0.95)).toBeCloseTo(95, 9);
  });
  it('ECE of a perfectly calibrated bin is 0; of an overconfident one is the gap', () => {
    expect(ece([[0.5, 1], [0.5, 0]])).toBeCloseTo(0, 9);
    expect(ece([[0.9, 0], [0.9, 0]])).toBeCloseTo(0.9, 9);
  });
  it('aggregates ACPL, rates, Brier, colour scores; skips forced and cached plies', () => {
    const g1: StatsGame = { modelColor: 'white', score: 1, costUsd: 0.01, adjudicated: false, plies: [mp(0, 0, 0.8, true), mp(100, 12, 0.6, false), mp(0, 0, 0.9, true, { forced: true }), { ...mp(30, 1, 0.5, true), by: 'engine', judge: null, decision: null }] };
    const g2: StatsGame = { modelColor: 'black', score: 0, costUsd: 0.03, adjudicated: true, plies: [mp(200, 25, 0.7, false)] };
    const s = seriesStats([g1, g2]);
    expect(s.games).toBe(2); expect(s.model_plies).toBe(3);                       // forced and engine plies excluded
    expect(s.acpl).toBeCloseTo(100, 9); expect(s.acpl_median).toBe(100);
    expect(s.acceptable_rate).toBeCloseTo(1 / 3, 9); expect(s.mistake_rate).toBeCloseTo(2 / 3, 9); expect(s.blunder_rate).toBeCloseTo(1 / 3, 9);
    expect(s.brier).toBeCloseTo(((0.8 - 1) ** 2 + (0.6 - 0) ** 2 + (0.7 - 0) ** 2) / 3, 9);
    expect(s.score_as_white).toBe(1); expect(s.score_as_black).toBe(0);
    expect(s.adjudicated_frac).toBe(0.5); expect(s.cost_per_game).toBeCloseTo(0.02, 9); expect(s.avg_plies).toBeCloseTo(2.5, 9);
    expect(s.latency_p50).toBe(200); expect(s.avg_input_tokens).toBe(900);
  });
});
