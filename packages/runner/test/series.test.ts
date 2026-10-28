import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { getPlatformProxy } from 'wrangler';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  DEFAULT_LADDER, legalMoves,
  type GameEvent, type JudgePort, type LadderLevel, type SeriesConfig, type SeriesEvent,
} from '@chessdecide/core';
import { RandomOpponent } from '@chessdecide/engine';
import { EventHub } from '@chessdecide/api';
import { buildSeries, loadSeriesRow, saveSeries, type Db } from '@chessdecide/db';
import * as schema from '@chessdecide/db/schema';
import { SeriesControlPlane, recoverSeries, type SeriesDeps } from '../src/series.ts';
import type { Runtime } from '../src/runtime.ts';

let db: Db; let dispose: () => Promise<void>;
const migDir = fileURLToPath(new URL('../../db/migrations/', import.meta.url));

beforeAll(async () => {
  const proxy = await getPlatformProxy<{ DB: D1Database }>({
    configPath: fileURLToPath(new URL('../../../apps/web/wrangler.jsonc', import.meta.url)),
    persist: { path: mkdtempSync(join(tmpdir(), 'cd-series-cp-')) },
  });
  dispose = proxy.dispose;
  for (const f of readdirSync(migDir).filter((x) => x.endsWith('.sql')).sort())
    for (const st of readFileSync(migDir + f, 'utf8').split('--> statement-breakpoint')) if (st.trim()) await proxy.env.DB.exec(st.trim().replace(/\s+/g, ' '));
  db = drizzle(proxy.env.DB, { schema });
}, 60_000);
afterAll(async () => { await dispose?.(); });

/** White is always +10 pawns, so adjudication ends games at ply 30 instead of 200 (fast tests). */
const fakeJudge: JudgePort = {
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
const rt: Runtime = { judge: fakeJudge, engines: [], close: async () => {} };

const randomOpponent = async (level: LadderLevel, rng: () => number) =>
  new RandomOpponent(rng, { levelId: level.id, levelElo: level.elo });

function makeCp(over: Partial<SeriesDeps> = {}) {
  return new SeriesControlPlane({
    rt, db, hub: new EventHub<SeriesEvent>(), gameHub: new EventHub<GameEvent>(),
    mock: true, ladder: () => DEFAULT_LADDER, judge: fakeJudge, makeOpponentFor: randomOpponent, ...over,
  });
}

const cfg = (over: Partial<SeriesConfig> = {}): SeriesConfig => ({
  model: 'typesafe/jev-1.14', arm: 'clean', size: { preset: 'quick' }, ladder: { mode: 'adaptive' },
  seed: 5, budget_usd: 1, concurrency: 2, judge_depth: 6, ...over,
});

async function run(cp: SeriesControlPlane, config: SeriesConfig) {
  const created = await cp.create(config);
  await cp.start(created.id);
  await cp.idle(created.id);
  return (await buildSeries(db, created.id))!;
}

describe('SeriesControlPlane', () => {
  it('completes a quick series with 25 games, 5 blocks and alternating colours', async () => {
    const s = await run(makeCp(), cfg());
    expect(s.status).toBe('finished');
    expect(s.games.filter((g) => g.status === 'finished')).toHaveLength(25);
    expect(s.blocks).toHaveLength(5);
    expect(s.blocks[0]!.level_id).toBe('eps15');            // nearest 1200 in DEFAULT_LADDER
    for (const b of s.blocks) expect(new Set(s.games.filter((g) => g.block === b.index).map((g) => g.level_id)).size).toBe(1);
    expect(s.games.map((g) => g.model_color)).toEqual(Array.from({ length: 25 }, (_, i) => (i % 2 === 0 ? 'white' : 'black')));
    expect(s.elo).not.toBeNull();
    expect(s.elo_history).toHaveLength(25);

    const rows = await db.select().from(schema.games).where(eq(schema.games.series_id, s.id));
    for (let k = 0; k < 12; k++) {
      const a = rows.find((r) => r.series_index === 2 * k)!;
      const b = rows.find((r) => r.series_index === 2 * k + 1)!;
      expect(a.start_fen).toBe(b.start_fen);
    }
  }, 300_000);

  it('never runs more than two games at once', async () => {
    let active = 0, max = 0;
    const cp = makeCp({
      makeOpponentFor: async (level, rng) => {
        active++; max = Math.max(max, active);
        const inner = new RandomOpponent(rng, { levelId: level.id, levelElo: level.elo });
        return { move: (fen) => inner.move(fen), close: async () => { active--; await inner.close(); } };
      },
    });
    const s = await run(cp, cfg({ size: { preset: 'custom', games: 6 } }));
    expect(s.games.filter((g) => g.status === 'finished')).toHaveLength(6);
    expect(max).toBeLessThanOrEqual(2);
    expect(max).toBeGreaterThan(0);
  }, 120_000);

  it('honours custom and fixed sizes', async () => {
    const custom = await run(makeCp(), cfg({ size: { preset: 'custom', games: 7 } }));
    expect(custom.games.filter((g) => g.status === 'finished')).toHaveLength(7);
    const fixed = await run(makeCp(), cfg({ size: { preset: 'custom', games: 5 }, ladder: { mode: 'fixed', level: 'uci1500' } }));
    expect(new Set(fixed.games.map((g) => g.level_id))).toEqual(new Set(['uci1500']));
  }, 120_000);

  it('stops on budget and resumes after the cap is raised without double counting', async () => {
    const cp = makeCp();
    const created = await cp.create(cfg({ budget_usd: 0.005 }));
    await cp.start(created.id);
    await cp.idle(created.id);
    let s = (await buildSeries(db, created.id))!;
    expect(s.status).toBe('stopped_budget');
    const before = s.games.filter((g) => g.status === 'finished').length;
    expect(before).toBeLessThan(25);
    const costBefore = s.cost_usd;

    const row = (await loadSeriesRow(db, created.id))!;
    await saveSeries(db, { ...row, budget_usd: 1 });
    await cp.start(created.id);
    await cp.idle(created.id);
    s = (await buildSeries(db, created.id))!;
    expect(s.status).toBe('finished');
    expect(s.games.filter((g) => g.status === 'finished')).toHaveLength(25);
    expect(s.cost_usd).toBeGreaterThanOrEqual(costBefore);
  }, 120_000);

  it('aborts a game after 3 retries and stops after 3 consecutive aborts', async () => {
    const cp = makeCp({ makeOpponentFor: async () => ({ move: async () => { throw new Error('boom'); }, close: async () => {} }) });
    const s = await run(cp, cfg());
    expect(s.status).toBe('stopped_error');
    expect(s.status_reason).toBe('too_many_aborts');
    expect(s.games.filter((g) => g.status === 'aborted').length).toBeGreaterThanOrEqual(3);
    expect(s.elo?.games ?? 0).toBe(0);
  }, 120_000);

  it('pauses and resumes; stop aborts in-flight games and keeps finished ones', async () => {
    const cp = makeCp();
    const created = await cp.create(cfg({ size: { preset: 'custom', games: 6 } }));
    await cp.start(created.id);
    await cp.pause(created.id);
    let s = (await buildSeries(db, created.id))!;
    expect(s.status).toBe('paused');
    await cp.start(created.id);
    await cp.idle(created.id);
    s = (await buildSeries(db, created.id))!;
    expect(s.status).toBe('finished');
    expect(s.games.filter((g) => g.status === 'finished')).toHaveLength(6);

    const cp2 = makeCp();
    const stopped = await cp2.create(cfg({ seed: 8, size: { preset: 'custom', games: 6 } }));
    await cp2.start(stopped.id);
    await expect.poll(async () => (await buildSeries(db, stopped.id))!.games.length, { timeout: 20_000 }).toBeGreaterThan(0);
    await cp2.stop(stopped.id);
    const after = (await buildSeries(db, stopped.id))!;
    expect(after.status).toBe('aborted');
    expect(after.games.some((g) => g.status === 'running')).toBe(false);
  }, 120_000);

  it('is deterministic for the same seed', async () => {
    const a = await run(makeCp(), cfg({ size: { preset: 'custom', games: 7 }, seed: 42 }));
    const b = await run(makeCp(), cfg({ size: { preset: 'custom', games: 7 }, seed: 42 }));
    const key = (s: Awaited<ReturnType<typeof buildSeries>>) => s!.games.map((g) => `${g.level_id}:${g.model_color}`).join('|');
    expect(key(a)).toBe(key(b));
    const fa = await db.select().from(schema.games).where(eq(schema.games.series_id, a.id));
    const fb = await db.select().from(schema.games).where(eq(schema.games.series_id, b.id));
    expect(fa.map((g) => g.start_fen)).toEqual(fb.map((g) => g.start_fen));
  }, 120_000);

  it('recovers a paused series after a server restart', async () => {
    const cp = makeCp();
    const created = await cp.create(cfg({ seed: 9, size: { preset: 'custom', games: 6 } }));
    const row = (await loadSeriesRow(db, created.id))!;
    await saveSeries(db, { ...row, status: 'running' });
    const n = await recoverSeries(db);
    expect(n).toBeGreaterThanOrEqual(1);
    await cp.start(created.id); await cp.idle(created.id);
    const s = (await buildSeries(db, created.id))!;
    expect(s.status).toBe('finished');
    expect(s.games.filter((g) => g.status === 'finished')).toHaveLength(6);
  }, 180_000);
});
