import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/d1';
import { getPlatformProxy } from 'wrangler';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_LADDER } from '@chessdecide/core';
import * as schema from '@chessdecide/db/schema';
import { saveSeries, type Db, type SeriesRow } from '@chessdecide/db';
import { createApi, type ApiDeps } from '../src/index.ts';

let db: Db; let dispose: () => Promise<void>;
beforeAll(async () => {
  const proxy = await getPlatformProxy<{ DB: D1Database }>({
    configPath: fileURLToPath(new URL('../../../apps/web/wrangler.jsonc', import.meta.url)),
    persist: { path: mkdtempSync(join(tmpdir(), 'cd-leader-api-')) },
  });
  dispose = proxy.dispose;
  const dir = fileURLToPath(new URL('../../db/migrations/', import.meta.url));
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort())
    for (const st of readFileSync(dir + f, 'utf8').split('--> statement-breakpoint')) if (st.trim()) await proxy.env.DB.exec(st.trim().replace(/\s+/g, ' '));
  db = drizzle(proxy.env.DB, { schema });
}, 60_000);
afterAll(async () => { await dispose?.(); });

const seriesRow = (id: string, arm: string, over: Partial<SeriesRow> = {}): SeriesRow => ({
  id, name: `Jev · ${arm} · quick`, model_slug: 'typesafe/jev-1.14', arm_id: arm, arm_json: '{}',
  status: 'finished', status_reason: 'target_reached', size_json: JSON.stringify({ preset: 'quick' }),
  ladder_mode: 'adaptive', ladder_level: null, ladder_version: 2, seed: 1, budget_usd: 1,
  concurrency: 2, judge_depth: 14, cost_usd: 0.02, elo_mean: null, elo_lo: null, elo_hi: null, w: 0, d: 0, l: 0,
  elo_history_json: null, blocks_json: null, catalog_snapshot_json: null,
  created_at: '2026-01-01T00:00:00Z', finished_at: null, ...over,
});

const gameRow = (id: string, seriesId: string, index: number, score: 0 | 0.5 | 1) => ({
  id, status: 'finished', status_reason: null,
  config_json: JSON.stringify({ max_plies: 200, adjudicate: true }),
  white_player: 'model', black_player: 'ladder', series_id: seriesId, series_index: index, block_index: 0,
  level_id: 'eps50', level_elo: 614, model_color: 'white', model_score: score, adjudicated: 1,
  start_fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  result: score === 1 ? '1-0' : score === 0 ? '0-1' : '1/2-1/2', termination: 'adjudicated',
  budget_usd: 1, cost_usd: 0.001, created_at: '2026-01-01T00:00:00Z', finished_at: '2026-01-01T00:10:00Z',
});

/** Two arms on ladder v2: `strong` wins everything, `weak` loses everything. */
async function seed(): Promise<void> {
  await saveSeries(db, seriesRow('L0000000000000000000000A1', 'strong'));
  await saveSeries(db, seriesRow('L0000000000000000000000B1', 'weak'));
  const strong = [1, 1, 1, 1, 0.5] as const, weak = [0, 0, 0, 0, 0.5] as const;
  for (let i = 0; i < 5; i++) {
    await db.insert(schema.games).values(gameRow(`g-s-${i}`, 'L0000000000000000000000A1', i, strong[i]!));
    await db.insert(schema.games).values(gameRow(`g-w-${i}`, 'L0000000000000000000000B1', i, weak[i]!));
  }
}

/** The synthetic series below were rated on ladder v2; use a calibrated v2 ruler by default. */
const LADDER_V2 = {
  ...DEFAULT_LADDER, version: 2, calibrated: true,
  levels: DEFAULT_LADDER.levels.map((l) => (l.id === 'eps50' ? { ...l, elo: 601 } : l)),
};

const app = (over: Partial<ApiDeps> = {}) =>
  createApi({ db, mode: 'local', mock: true, ladder: () => LADDER_V2, ...over } as ApiDeps);

describe('leaderboard API', () => {
  beforeAll(seed, 30_000);

  it('returns one row per arm, sorted, with reference ticks and the ladder footer', async () => {
    const r = await app().request('/api/leaderboard');
    expect(r.status).toBe(200);
    const body = await r.json() as any;
    expect(body.ladder).toEqual({ version: 2, calibrated: true });
    expect(body.rows.map((x: any) => x.arm_id)).toEqual(['typesafe/jev-1.14#strong', 'typesafe/jev-1.14#weak']);
    const [a, b] = body.rows;
    expect(a).toMatchObject({ model: 'typesafe/jev-1.14', games: 5, w: 4, d: 1, l: 0, series_id: 'L0000000000000000000000A1' });
    expect(a.elo.mean).toBeGreaterThan(b.elo.mean);
    expect(a.separated_from).toEqual(['typesafe/jev-1.14#weak']);
    expect(b.separated_from).toEqual(['typesafe/jev-1.14#strong']);
    expect(body.reference).toHaveLength(DEFAULT_LADDER.levels.length);
    expect(body.reference[0]).toEqual({ id: 'random', label: 'Random mover', elo: 250 });
    expect(body.reference.find((x: any) => x.id === 'eps50').elo).toBe(601);
  });

  it('filters by ladder_version and validates it', async () => {
    const v2 = await (await app().request('/api/leaderboard?ladder_version=2')).json() as any;
    expect(v2.rows).toHaveLength(2);
    const none = await (await app().request('/api/leaderboard?ladder_version=7')).json() as any;
    expect(none.rows).toEqual([]);
    expect(none.reference.length).toBeGreaterThan(0);
    expect((await app().request('/api/leaderboard?ladder_version=abc')).status).toBe(400);
    expect((await app().request('/api/leaderboard?ladder_version=-1')).status).toBe(400);
  });

  it('falls back to the nominal ladder when no ladder file is loaded', async () => {
    const body = await (await app({ ladder: undefined, mode: 'public' }).request('/api/leaderboard')).json() as any;
    expect(body.ladder).toEqual({ version: 0, calibrated: false });
    expect(body.rows).toEqual([]);
  });

  it('compares two arms and reports the difference interval', async () => {
    const r = await app().request('/api/leaderboard/compare?a=typesafe/jev-1.14%23strong&b=typesafe/jev-1.14%23weak');
    expect(r.status).toBe(200);
    const c = await r.json() as any;
    expect(c.a).toMatchObject({ arm_id: 'typesafe/jev-1.14#strong', games: 5 });
    expect(c.b).toMatchObject({ arm_id: 'typesafe/jev-1.14#weak', games: 5 });
    expect(c.p_a_gt_b).toBeGreaterThan(0.5);
    expect(c.diff_lo).toBeLessThanOrEqual(c.diff_mean!);
    expect(c.diff_hi).toBeGreaterThanOrEqual(c.diff_mean!);
    const back = await (await app().request('/api/leaderboard/compare?a=typesafe/jev-1.14%23weak&b=typesafe/jev-1.14%23strong')).json() as any;
    expect(back.p_a_gt_b).toBeCloseTo(1 - c.p_a_gt_b, 6);
  });

  it('needs both arms and known arms', async () => {
    expect((await app().request('/api/leaderboard/compare?a=typesafe/jev-1.14%23strong')).status).toBe(400);
    const unknown = await app().request('/api/leaderboard/compare?a=typesafe/jev-1.14%23strong&b=nope');
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toMatchObject({ error: { code: 'not_found' } });
  });

  it('is available read-only in public mode', async () => {
    const publicApi = app({ mode: 'public', catalog: undefined });
    expect((await publicApi.request('/api/leaderboard')).status).toBe(200);
    expect((await publicApi.request('/api/leaderboard/compare?a=typesafe/jev-1.14%23strong&b=typesafe/jev-1.14%23weak')).status).toBe(200);
  });
});
