import { describe, expect, it } from 'vitest';
import type { GameConfig } from '@chessdecide/core';
import type { ModelInfo } from '../src/catalog.ts';
import { estimateGame } from '../src/estimate.ts';

const model = (slug: string, price: number): ModelInfo => ({
  slug, canonical_slug: null, name: slug, context_length: 262144,
  price_in_per_m: price, input_modalities: ['text'], roster: false, disabled_reason: null,
});

const CATALOG = [model('typesafe/jev-1.14', 0.042), model('cheap/model', 0.01)];

const config = (over: Partial<GameConfig> = {}): GameConfig => ({
  white: { type: 'model', model: 'typesafe/jev-1.14', arm: 'clean' },
  black: { type: 'ladder', level: 'eps15' },
  opening: { type: 'startpos' },
  pace_ms: 0, budget_usd: 1, judge_depth: 14, max_plies: 200, adjudicate: true, seed: 1,
  ...over,
});

describe('estimateGame', () => {
  it('estimates a 200-ply clean game at 40 calls', () => {
    const e = estimateGame(config(), CATALOG);
    expect(e.calls).toBe(40);
    expect(e.est_cost_usd).toBeCloseTo(40 * (1750 / 1e6) * 0.042, 12);
    expect(e.worst_case_usd).toBeCloseTo(100 * (1750 / 1e6) * 0.042, 12);
    expect(e.est_input_tokens).toBe(40 * 1750);
    expect(e.cap_usd).toBe(1);
    expect(e.over_cap).toBe(false);
    expect(e.breakdown).toEqual([{ model: 'typesafe/jev-1.14', arm: 'clean', calls: 40, est_cost_usd: e.est_cost_usd }]);
  });

  it('is zero when neither side is a model', () => {
    const e = estimateGame(config({ white: { type: 'ladder', level: 'uci1500' }, black: { type: 'ladder', level: 'uci1320' } }), CATALOG);
    expect(e).toMatchObject({ calls: 0, est_cost_usd: 0, worst_case_usd: 0, est_input_tokens: 0, over_cap: false, breakdown: [] });
  });

  it('adds 600 input tokens per call for the image arm', () => {
    const clean = estimateGame(config(), CATALOG);
    const image = estimateGame(config({ white: { type: 'model', model: 'typesafe/jev-1.14', arm: 'image' } }), CATALOG);
    expect(image.est_input_tokens - clean.est_input_tokens).toBe(40 * 600);
    expect(image.breakdown[0]!.arm).toBe('image');
  });

  it('uses each side price when both sides are models', () => {
    const e = estimateGame(config({ black: { type: 'model', model: 'cheap/model', arm: 'hinted' } }), CATALOG);
    expect(e.calls).toBe(80);
    const jev = 40 * (1750 / 1e6) * 0.042, cheap = 40 * (1750 / 1e6) * 0.01;
    expect(e.est_cost_usd).toBeCloseTo(jev + cheap, 12);
    expect(e.breakdown.map((b) => b.model)).toEqual(['typesafe/jev-1.14', 'cheap/model']);
  });

  it('flags an over-cap estimate', () => {
    expect(estimateGame(config({ budget_usd: 0.0001 }), CATALOG).over_cap).toBe(true);
  });

  it('throws for an unknown model', () => {
    expect(() => estimateGame(config({ white: { type: 'model', model: 'nope/nope', arm: 'clean' } }), CATALOG)).toThrow('unknown model');
  });
});
