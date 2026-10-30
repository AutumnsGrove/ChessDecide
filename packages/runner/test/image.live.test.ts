/**
 * Live check for the image arm: one real call per model at the start position.
 * Skipped unless LIVE=1 and a key is present:
 *   LIVE=1 pnpm --filter @chessdecide/runner test test/image.live.test.ts
 * Costs about $0.0001 in total; Autumn runs this with her key.
 */
import { describe, expect, it } from 'vitest';
import {
  START_FEN, legalMoves, sideToMove,
  type Game, type GameConfig, type MoveContext,
} from '@chessdecide/core';
import { boardDataUrl } from '@chessdecide/render';
import { DecisionsClient, ModelPlayer, type AttemptSink } from '@chessdecide/providers';

const live = process.env.LIVE === '1' && !!process.env.OPENROUTER_API_KEY;
const MODELS = ['typesafe/jev-1.14', 'liquid/d1-ultra'];

describe.skipIf(!live)('image arm (live)', () => {
  for (const model of MODELS) {
    it(`${model} answers a board image with a legal move`, async () => {
      const fen = START_FEN;
      const legal = legalMoves(fen);
      const rows: { interface?: string; input_tokens?: number | null; cost?: number | null }[] = [];
      const sink: AttemptSink = {
        async record(row) { rows.push(row); return rows.length; },
        async findCached() { return undefined; },
      };
      const config: GameConfig = {
        white: { type: 'model', model, arm: 'image' }, black: { type: 'ladder', level: 'random' },
        opening: { type: 'startpos' }, pace_ms: 0, budget_usd: 1, judge_depth: 14, max_plies: 200, adjudicate: true, seed: 1,
      };
      const game: Game = { id: 'probe-image', status: 'running', config, start_fen: fen, adjudicated: false, plies: [], result: '*', termination: '', cost_usd: 0, created_at: new Date().toISOString() };
      const player = new ModelPlayer({
        client: new DecisionsClient({ apiKey: process.env.OPENROUTER_API_KEY! }),
        sink, model, arm: 'image', seed: 1, renderImage: async (f) => boardDataUrl(f),
      });
      const ctx: MoveContext = { game, fen, historySan: [], legal, ply: 1, side: sideToMove(fen) };
      const m = await player.move(ctx);
      expect(legal.some((x) => x.uci === m.uci)).toBe(true);
      expect(rows[0]!.interface).toBe('image');
      expect(m.decision?.usage.input_tokens ?? 0).toBeGreaterThan(0);
      expect(m.decision?.usage.cost_usd ?? 0).toBeLessThan(0.002);
      console.log(`${model}: ${m.uci} in=${m.decision?.usage.input_tokens} out=${m.decision?.usage.output_tokens} cost=$${(m.decision?.usage.cost_usd ?? 0).toFixed(6)} latency=${m.decision?.latency_ms}ms`);
    }, 180_000);
  }
});
