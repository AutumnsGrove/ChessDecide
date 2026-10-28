/**
 * Live smoke test for the probe path. Skipped unless LIVE=1 and a key is present:
 *   LIVE=1 OPENROUTER_API_KEY=... pnpm --filter @chessdecide/runner test
 * Costs about $0.00005.
 */
import { describe, expect, it } from 'vitest';
import {
  START_FEN, legalMoves, sideToMove,
  type Game, type GameConfig, type MoveContext,
} from '@chessdecide/core';
import { DecisionsClient, ModelPlayer, type AttemptSink } from '@chessdecide/providers';

const live = process.env.LIVE === '1' && !!process.env.OPENROUTER_API_KEY;

describe.skipIf(!live)('probe (live)', () => {
  it('makes one real decisions call for the start position', async () => {
    const model = 'typesafe/jev-1.14';
    const fen = START_FEN;
    const legal = legalMoves(fen);
    const sink: AttemptSink = {
      async record() { return 1; },
      async findCached() { return undefined; },
    };
    const config: GameConfig = {
      white: { type: 'model', model, arm: 'clean' }, black: { type: 'ladder', level: 'random' },
      opening: { type: 'startpos' }, pace_ms: 0, budget_usd: 1, judge_depth: 14, max_plies: 200, adjudicate: true, seed: 1,
    };
    const game: Game = { id: 'probe', status: 'running', config, start_fen: fen, adjudicated: false, plies: [], result: '*', termination: '', cost_usd: 0, created_at: new Date().toISOString() };
    const player = new ModelPlayer({
      client: new DecisionsClient({ apiKey: process.env.OPENROUTER_API_KEY! }),
      sink, model, arm: 'clean', seed: 1,
    });
    const ctx: MoveContext = { game, fen, historySan: [], legal, ply: 1, side: sideToMove(fen) };
    const m = await player.move(ctx);
    expect(m.uci).toMatch(/^[a-h][1-8][a-h][1-8][qrbn]?$/);
    expect(legal.some((x) => x.uci === m.uci)).toBe(true);
    expect(m.decision?.usage.cost_usd ?? 0).toBeLessThan(0.001);
    expect(m.decision?.usage.input_tokens ?? 0).toBeGreaterThan(0);
  }, 120_000);
});
