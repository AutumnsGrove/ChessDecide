import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/d1';
import { getPlatformProxy } from 'wrangler';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SeriesRow } from '../src/index.ts';
import * as schema from '../src/schema.ts';
import { leaderboardInput, saveSeries, type Db } from '../src/index.ts';

let db: Db; let dispose: () => Promise<void>;
const migDir = fileURLToPath(new URL('../migrations/', import.meta.url));

beforeAll(async () => {
  const proxy = await getPlatformProxy<{ DB: D1Database }>({
    configPath: fileURLToPath(new URL('../../../apps/web/wrangler.jsonc', import.meta.url)),
    persist: { path: mkdtempSync(join(tmpdir(), 'cd-leader-store-')) },
  });
  dispose = proxy.dispose;
  for (const f of readdirSync(migDir).filter((x) => x.endsWith('.sql')).sort())
    for (const st of readFileSync(migDir + f, 'utf8').split('--> statement-breakpoint')) if (st.trim()) await proxy.env.DB.exec(st.trim().replace(/\s+/g, ' '));
  db = drizzle(proxy.env.DB, { schema });
}, 60_000);
afterAll(async () => { await dispose?.(); });

const seriesRow = (id: string, model: string, arm: string, over: Partial<SeriesRow> = {}): SeriesRow => ({
  id, name: null, model_slug: model, arm_id: arm, arm_json: '{}',
  status: 'finished', status_reason: 'target_reached', size_json: JSON.stringify({ preset: 'quick' }),
  ladder_mode: 'adaptive', ladder_level: null, ladder_version: 2, seed: 1,
  budget_usd: 1, concurrency: 2, judge_depth: 14, cost_usd: 0.01,
  elo_mean: null, elo_lo: null, elo_hi: null, w: 0, d: 0, l: 0,
  elo_history_json: null, blocks_json: null, catalog_snapshot_json: null,
  created_at: '2026-01-01T00:00:00Z', finished_at: null, ...over,
});

const gameRow = (id: string, series: string, index: number, score: 0 | 0.5 | 1) => ({
  id, status: 'finished', status_reason: null,
  config_json: JSON.stringify({ max_plies: 200 }), white_player: 'model', black_player: 'ladder',
  series_id: series, series_index: index, block_index: 0, level_id: 'eps50', level_elo: 614,
  model_color: 'white', model_score: score, adjudicated: 1,
  start_fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  result: score === 1 ? '1-0' : score === 0 ? '0-1' : '1/2-1/2', termination: 'adjudicated',
  budget_usd: 1, cost_usd: 0.0005, created_at: '2026-01-01T00:00:00Z', finished_at: '2026-01-01T00:05:00Z',
});

async function seedSeries(id: string, model: string, arm: string, scores: Array<0 | 0.5 | 1>, over: Partial<SeriesRow> = {}) {
  await saveSeries(db, seriesRow(id, model, arm, over));
  for (let i = 0; i < scores.length; i++) await db.insert(schema.games).values(gameRow(`${id}-g${i}`, id, i, scores[i]!));
}

describe('leaderboard input', () => {
  it('keys an arm by model + arm, so the same preset on two models is two rows', async () => {
    await seedSeries('L00000000000000000000JEV01', 'typesafe/jev-1.14', 'clean', [1, 0, 1]);
    await seedSeries('L00000000000000000000D1U01', 'liquid/d1-ultra', 'clean', [0, 0, 1]);
    const input = await leaderboardInput(db, 2);
    const ids = input.map((s) => s.arm_id).sort();
    expect(ids).toContain('typesafe/jev-1.14#clean');
    expect(ids).toContain('liquid/d1-ultra#clean');
  });

  it('carries rated games, W-D-L and the secondary stats', async () => {
    const input = await leaderboardInput(db, 2);
    const jev = input.find((s) => s.arm_id === 'typesafe/jev-1.14#clean')!;
    expect(jev).toMatchObject({ model: 'typesafe/jev-1.14', arm: 'clean', ladder_version: 2, w: 2, d: 0, l: 1 });
    expect(jev.games).toEqual([{ opponentElo: 614, score: 1 }, { opponentElo: 614, score: 0 }, { opponentElo: 614, score: 1 }]);
    expect(jev.stats.games).toBe(3);
    expect(jev.cost_usd).toBe(0.01);
  });

  it('keeps only the latest finished series for an arm', async () => {
    await seedSeries('L00000000000000000000JEV02', 'typesafe/jev-1.14', 'clean', [1, 1, 1, 1, 1], { status: 'finished' });
    const input = await leaderboardInput(db, 2);
    const jev = input.find((s) => s.arm_id === 'typesafe/jev-1.14#clean')!;
    expect(jev.series_id).toBe('L00000000000000000000JEV02');
    expect(jev.w).toBe(5);
  });

  it('filters by ladder version', async () => {
    expect(await leaderboardInput(db, 3)).toEqual([]);
  });
});
