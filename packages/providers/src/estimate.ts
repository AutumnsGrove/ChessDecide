/**
 * Cost estimate for one game, before any money is spent. Spec: docs/PROMPTS.md §10, D27.
 */
import { ARM_PRESETS, sendsImage, type Arm, type ArmName, type GameConfig, type PlayerDesc } from '@chessdecide/core';
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

// Calibrated on the 2026-10/11 sweeps (38 series, ~65k model calls): 553 (hinted) to 659 (clean) input tokens
// per call, 30 to 38 model calls per game. A prompt is ~130 tokens plus ~26 per legal-move option
// (653 tokens at 20 options, 1,383 at 48); the average position offers ~18.
const TYPICAL_OPTIONS = 18;
const WORST_OPTIONS = 40;
const TYPICAL_CALLS = 34;
const BASE_TOKENS = 130;
const TOKENS_PER_OPTION = 26;
export const IMAGE_EXTRA_TOKENS = 600;

const isImage = (arm: Arm | string): boolean => sendsImage(typeof arm === 'string' ? ARM_PRESETS[arm as ArmName] ?? ARM_PRESETS.clean : arm);
const armId = (arm: Arm | string): string => (typeof arm === 'string' ? arm : 'custom');
const perCallTokens = (arm: Arm | string, options = TYPICAL_OPTIONS): number =>
  BASE_TOKENS + TOKENS_PER_OPTION * options + (isImage(arm) ? IMAGE_EXTRA_TOKENS : 0);

/** Model sides of the game (0, 1 or 2). */
type ModelSide = Extract<PlayerDesc, { type: 'model' }>;
function modelSides(config: GameConfig): ModelSide[] {
  return [config.white, config.black].filter((p): p is ModelSide => p.type === 'model');
}

/**
 * Typical estimate (34 calls per model side max) and worst case (every ply reaches the model).
 * Throws `Error('unknown model')` when a slug is not in the catalog.
 */
export function estimateGame(config: GameConfig, catalog: ModelInfo[]): GameEstimate {
  const bySlug = new Map(catalog.map((m) => [m.slug, m]));
  const maxPlies = Math.max(0, Math.floor(config.max_plies));
  const typicalCalls = Math.min(TYPICAL_CALLS, Math.ceil(maxPlies / 2));
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
    worst += worstCalls * (perCallTokens(side.arm, WORST_OPTIONS) / 1e6) * info.price_in_per_m;
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
