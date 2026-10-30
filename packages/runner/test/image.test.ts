import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/d1';
import { getPlatformProxy } from 'wrangler';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { legalMoves, playToEnd, type JudgePort, type LadderLevel } from '@chessdecide/core';
import { boardPng } from '@chessdecide/render';
import { RandomOpponent } from '@chessdecide/engine';
import * as schema from '@chessdecide/db/schema';
import { newGame } from '../src/runtime.ts';
import { buildPorts } from '../src/runtime.ts';
import type { Db } from '@chessdecide/db';

const MIGRATIONS = fileURLToPath(new URL('../../db/migrations/', import.meta.url));
const CONFIG = fileURLToPath(new URL('../../../apps/web/wrangler.jsonc', import.meta.url));

let db: Db; let dispose: () => Promise<void>;
beforeAll(async () => {
  const proxy = await getPlatformProxy<{ DB: D1Database }>({
    configPath: CONFIG, persist: { path: mkdtempSync(join(tmpdir(), 'cd-image-')) },
  });
  dispose = proxy.dispose;
  for (const f of readdirSync(MIGRATIONS).filter((x) => x.endsWith('.sql')).sort())
    for (const st of readFileSync(MIGRATIONS + f, 'utf8').split('--> statement-breakpoint'))
      if (st.trim()) await proxy.env.DB.exec(st.trim().replace(/\s+/g, ' '));
  db = drizzle(proxy.env.DB, { schema });
}, 60_000);
afterAll(async () => { await dispose?.(); });

/** Fast fake: White is always winning, so adjudication ends the game quickly. */
const judge: JudgePort = {
  async oracle(fen) {
    const whiteToMove = fen.split(' ')[1] === 'w';
    const cp = whiteToMove ? 1000 : -1000;
    const wdl: [number, number, number] = whiteToMove ? [1000, 0, 0] : [0, 0, 1000];
    return { depth: 6, sf_version: 'fake', rows: legalMoves(fen).map((m) => ({ uci: m.uci, san: m.san, cp, wp: whiteToMove ? 100 : 0, wdl })) };
  },
  async evalPosition(fen) {
    const whiteToMove = fen.split(' ')[1] === 'w';
    return { cp_stm: whiteToMove ? 1000 : -1000, wdl_stm: whiteToMove ? [1000, 0, 0] : [0, 0, 1000] };
  },
};
const rt = { judge, engines: [], close: async () => {} };
const randomOpponent = async (level: LadderLevel, rng: () => number) => new RandomOpponent(rng, { levelId: level.id, levelElo: level.elo });

describe('image arm wiring', () => {
  it('plays a mock game with arm "image" end to end', async () => {
    const config = {
      white: { type: 'model' as const, model: 'typesafe/jev-1.14', arm: 'image' as const },
      black: { type: 'ladder' as const, level: 'random' },
      opening: { type: 'startpos' as const }, pace_ms: 0, budget_usd: 1, judge_depth: 6,
      max_plies: 12, adjudicate: true, seed: 3,
    };
    const game = newGame(config);
    const ports = await buildPorts(rt, db, game, { mock: true, judge, makeOpponentFor: randomOpponent });
    const done = await playToEnd(game, ports);
    expect(['finished', 'stopped_budget']).toContain(done.status);
    expect(done.plies.length).toBeGreaterThan(0);
    expect(done.config.white).toEqual(config.white);
  }, 60_000);

  it('the renderer the runtime uses produces a real PNG for a game position', () => {
    const png = boardPng('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    expect(png.length).toBeGreaterThan(1000);
    expect([...png.subarray(0, 4)]).toEqual([137, 80, 78, 71]);
  });
});
