import { describe, expect, it } from 'vitest';
import type { Series, SeriesStats } from '@chessdecide/core';
import {
  blockRows, eloChartPoints, gameChip, intervalLabel, ladderAxisScale, metricRows, overlap,
  precisionHint, progressLabel, targetGames,
} from '../src/lib/series-model.ts';

const stats: SeriesStats = {
  games: 25, model_plies: 250, acpl: 42.5, acpl_median: 30, acceptable_rate: 0.8, mistake_rate: 0.1,
  blunder_rate: 0.04, mean_p_acceptable: 0.55, mean_e_win_loss: 2.1, brier: 0.22, ece: 0.08,
  score_as_white: 0.6, score_as_black: 0.4, avg_plies: 61.2, adjudicated_frac: 0.2,
  cost_per_game: 0.0005, latency_p50: 400, latency_p95: 900, avg_input_tokens: 1200,
};

const series = (over: Partial<Series> = {}): Series => ({
  id: 's', name: 'Jev · clean · quick', model: 'typesafe/jev-1.14', arm: 'clean', status: 'running',
  size: { preset: 'quick' }, ladder_version: 2, seed: 1, budget_usd: 1, cost_usd: 0.01,
  games: [], blocks: [], elo: null, elo_history: [], secondary: stats, created_at: '', ...over,
});

describe('series model', () => {
  it('targets and progress', () => {
    expect(targetGames({ preset: 'quick' })).toBe(25);
    expect(targetGames({ preset: 'standard' })).toBe(50);
    expect(targetGames({ preset: 'custom', games: 7 })).toBe(7);
    expect(targetGames({ preset: 'completion' })).toBeNull();
    expect(progressLabel(series({ games: [{ game_id: 'g', index: 0, block: 0, level_id: 'eps15', level_elo: 1150, model_color: 'white', status: 'finished', result: '1-0', termination: 'checkmate', adjudicated: false, plies: 40, cost_usd: 0 }] }))).toBe('1 / 25');
    expect(progressLabel(series({ size: { preset: 'completion', max_games: 120 }, games: [] }))).toBe('0 / ~120');
  });

  it('labels the Elo with its interval and the precision hint', () => {
    expect(intervalLabel({ mean: 980.4, lo: 860, hi: 1100, half_width: 120, games: 25, w: 10, d: 5, l: 10, score_pct: 0.5 })).toBe('980 ± 120');
    expect(intervalLabel(null)).toBe('—');
    expect(precisionHint(25)).toBe('≈ ±136 at 25 games');
    expect(precisionHint(50)).toBe('≈ ±96 at 50 games');
    expect(precisionHint(100)).toBe('≈ ±68 at 100 games');
    expect(precisionHint(200)).toBe('≈ ±48 at 200 games');
  });

  it('detects overlapping intervals', () => {
    const a = { mean: 900, lo: 800, hi: 1000, half_width: 100, games: 25, w: 0, d: 0, l: 0, score_pct: 0 };
    const b = { ...a, mean: 950, lo: 900, hi: 1000 };
    const c = { ...a, mean: 1300, lo: 1200, hi: 1400 };
    expect(overlap(a, b)).toBe(true);
    expect(overlap(a, c)).toBe(false);
  });

  it('scales the ladder axis and builds the Elo chart geometry', () => {
    expect(ladderAxisScale(300)(1500)).toBe(150);
    expect(ladderAxisScale(300)(4000)).toBe(300);
    const g = eloChartPoints([{ games: 1, mean: 1200, lo: 1100, hi: 1300 }, { games: 2, mean: 1300, lo: 1200, hi: 1400 }, { games: 3, mean: 1400, lo: 1300, hi: 1500 }], 600, 220);
    expect(g.points).toHaveLength(3);
    expect(g.line.split(' ')).toHaveLength(3);
    expect(g.band.split(' ')).toHaveLength(6);
    expect(g.x(0)).toBe(0); expect(g.x(2)).toBe(600);
    expect(g.y(0)).toBe(220); expect(g.y(3000)).toBe(0);
    expect(eloChartPoints([], 600, 220).line).toBe('');
  });

  it('maps blocks and metrics for display', () => {
    const s = series({ blocks: [{ index: 0, level_id: 'eps15', level_elo: 1150, games: 5, score: 0.6, posterior_before: 1200, posterior_after: 1180 }] });
    expect(blockRows(s)).toEqual([{ index: 0, level: 'eps15 · 1150', games: 5, score: 0.6, after: 1180 }]);
    const rows = metricRows(stats);
    expect(rows.find((r) => r.key === 'acpl')).toMatchObject({ value: '42.5' });
    expect(rows.find((r) => r.key === 'acceptable_rate')?.value).toBe('80.0 %');
    expect(rows.find((r) => r.key === 'cost_per_game')?.value).toBe('$0.0005');
    expect(rows.find((r) => r.key === 'latency_p95')?.value).toBe('900 ms');
  });

  it('names the game chip from the model score', () => {
    const g = (over: Record<string, unknown>) => ({ game_id: 'g', index: 0, block: 0, level_id: 'eps15', level_elo: 1150, model_color: 'white', status: 'finished', result: '1-0', termination: '', adjudicated: false, plies: 1, cost_usd: 0, ...over }) as any;
    expect(gameChip(g({ model_score: 1 }))).toBe('won');
    expect(gameChip(g({ model_score: 0.5 }))).toBe('draw');
    expect(gameChip(g({ model_score: 0 }))).toBe('lost');
    expect(gameChip(g({ status: 'running' }))).toBe('running');
    expect(gameChip(g({ status: 'aborted' }))).toBe('aborted');
  });
});
