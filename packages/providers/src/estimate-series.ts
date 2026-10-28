/** Series cost estimate before starting (T06). Uses the same per-game formula as a single game. */
import type { GameConfig, SeriesConfig } from '@chessdecide/core';
import { sizeTarget } from '@chessdecide/core';
import type { ModelInfo } from './catalog.ts';
import { estimateGame } from './estimate.ts';

export interface SeriesEstimate {
  typical: { calls: number; est_cost_usd: number };
  worst_case: { calls: number; est_cost_usd: number };
  cap_usd: number;
  games_typical: number;
  games_worst: number;
  over_cap_typical: boolean;
  over_cap_worst: boolean;
}

/** Typical uses the minimum games (completion) / target (fixed); worst uses max games / target. */
export function estimateSeries(config: SeriesConfig, catalog: ModelInfo[]): SeriesEstimate {
  const target = sizeTarget(config.size);
  const gamesTypical = target ?? (config.size.preset === 'completion' ? (config.size.min_games ?? 25) : 25);
  const gamesWorst = target ?? (config.size.preset === 'completion' ? (config.size.max_games ?? 200) : 200);

  const game: GameConfig = {
    white: { type: 'model', model: config.model, arm: config.arm },
    black: { type: 'ladder', level: config.ladder.mode === 'fixed' ? config.ladder.level : 'eps50' },
    opening: { type: 'startpos' },
    pace_ms: 0, budget_usd: config.budget_usd, judge_depth: config.judge_depth ?? 14,
    max_plies: 200, adjudicate: true, seed: config.seed ?? 1,
  };
  const one = estimateGame(game, catalog);
  const worstCallsPerGame = one.breakdown.reduce((s, b) => s + Math.ceil(200 / 2), 0);

  const typical = { calls: one.calls * gamesTypical, est_cost_usd: one.est_cost_usd * gamesTypical };
  const worst = { calls: worstCallsPerGame * gamesWorst, est_cost_usd: one.worst_case_usd * gamesWorst };
  return {
    typical, worst_case: worst, cap_usd: config.budget_usd, games_typical: gamesTypical, games_worst: gamesWorst,
    over_cap_typical: typical.est_cost_usd > config.budget_usd,
    over_cap_worst: worst.est_cost_usd > config.budget_usd,
  };
}
