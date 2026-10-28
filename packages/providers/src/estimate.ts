/**
 * Cost estimate for one game, before any money is spent. Spec: docs/PROMPTS.md §10, D27.
 */
import type { Arm, GameConfig, PlayerDesc } from '@chessdecide/core';
import type { ModelInfo } from './catalog.ts';

export interface GameEstimate {
  calls: number;
  est_input_tokens: number;
  est_cost_usd: number;
  worst_case_usd: number;
  cap_usd: number;
  over_cap: boolean;
  breakdown: Array<{ model: string; arm: string; calls: number; est_cost_usd: number }>;
}

const TYPICAL_OPTIONS = 30;
const BASE_TOKENS = 400;
const TOKENS_PER_OPTION = 45;
const IMAGE_EXTRA_TOKENS = 600;

const isImage = (arm: Arm | string): boolean => (typeof arm === 'string' ? arm === 'image' : arm.interface === 'image');
const armId = (arm: Arm | string): string => (typeof arm === 'string' ? arm : 'custom');
const perCallTokens = (arm: Arm | string): number =>
  BASE_TOKENS + TOKENS_PER_OPTION * TYPICAL_OPTIONS + (isImage(arm) ? IMAGE_EXTRA_TOKENS : 0);

/** Model sides of the game (0, 1 or 2). */
type ModelSide = Extract<PlayerDesc, { type: 'model' }>;
function modelSides(config: GameConfig): ModelSide[] {
  return [config.white, config.black].filter((p): p is ModelSide => p.type === 'model');
}

/**
 * Typical estimate (40 calls per model side max) and worst case (every ply reaches the model).
 * Throws `Error('unknown model')` when a slug is not in the catalog.
 */
export function estimateGame(config: GameConfig, catalog: ModelInfo[]): GameEstimate {
  const bySlug = new Map(catalog.map((m) => [m.slug, m]));
  const maxPlies = Math.max(0, Math.floor(config.max_plies));
  const typicalCalls = Math.min(40, Math.ceil(maxPlies / 2));
  const worstCalls = Math.ceil(maxPlies / 2);

  const breakdown: GameEstimate['breakdown'] = [];
  let calls = 0, worst = 0, tokens = 0, cost = 0;

  for (const side of modelSides(config)) {
    const model = side.model;
    const info = bySlug.get(model);
    if (!info) throw new Error('unknown model');
    const tokensPerCall = perCallTokens(side.arm);
    const perCallUsd = (tokensPerCall / 1e6) * info.price_in_per_m;
    const sideCost = typicalCalls * perCallUsd;
    calls += typicalCalls;
    tokens += typicalCalls * tokensPerCall;
    cost += sideCost;
    worst += worstCalls * perCallUsd;
    breakdown.push({ model, arm: armId(side.arm), calls: typicalCalls, est_cost_usd: sideCost });
  }

  return {
    calls,
    est_input_tokens: tokens,
    est_cost_usd: cost,
    worst_case_usd: worst,
    cap_usd: config.budget_usd,
    over_cap: cost > config.budget_usd,
    breakdown,
  };
}
