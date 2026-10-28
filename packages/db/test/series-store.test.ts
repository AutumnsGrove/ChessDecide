import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/d1';
import { getPlatformProxy } from 'wrangler';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { START_FEN, type Game } from '@chessdecide/core';
import * as schema from '../src/schema.ts';
import { saveGame, savePly, type Db } from '../src/store.ts';
import {
  buildSeries, saveSeries, seriesGames, seriesSummaries, setGameSeriesFields, type SeriesRow,
} from '../src/series-store.ts';

let db: Db; let dispose: () => Promise<void>;
const migDir = fileURLToPath(new URL('../migrations/', import.meta.url));

beforeAll(async () => {
  const proxy = await getPlatformProxy<{ DB: D1Database }>({
    configPath: fileURLToPath(new URL('../../../apps/web/wrangler.jsonc', import.meta.url)),
    persist: { path: mkdtempSync(join(tmpdir(), 'cd-series-')) },
  });
  dispose = proxy.dispose;
  for (const f of readdirSync(migDir).filter((x) => x.endsWith('.sql')).sort())
    for (const st of readFileSync(migDir + f, 'utf8').split('--> statement-breakpoint')) if (st.trim()) await proxy.env.DB.exec(st.trim().replace(/\s+/g, ' '));
  db = drizzle(proxy.env.DB, { schema });
}, 60_000);
afterAll(async () => { await dispose?.(); });

const seriesRow = (id: string): SeriesRow => ({
  id, name: 'Jev · clean · quick', model_slug: 'typesafe/jev-1.14', arm_id: 'clean', arm_json: '{}',
  status: 'running', status_reason: null, size_json: JSON.stringify({ preset: 'quick' }),
  ladder_mode: 'adaptive', ladder_level: null, ladder_version: 1, seed: 7,
  budget_usd: 1, concurrency: 2, judge_depth: 14, cost_usd: 0.001,
  elo_mean: null, elo_lo: null, elo_hi: null, w: 0, d: 0, l: 0,
  elo_history_json: null, blocks_json: null, catalog_snapshot_json: null,
  created_at: '2026-01-01T00:00:00Z', finished_at: null,
});

const gameRow = (id: string, index: number, status: string, result: string | null): Game => ({
  id, status: status as Game['status'], config: {
    white: { type: 'model', model: 'typesafe/jev-1.14', arm: 'clean' }, black: { type: 'ladder', level: 'uci1320' },
    opening: { type: 'startpos' }, pace_ms: 0, budget_usd: 1, judge_depth: 14, max_plies: 200, adjudicate: true, seed: index,
  },
  start_fen: START_FEN, series_id: 's1', series_index: index, level_id: 'uci1320', level_elo: 1320,
  model_color: index % 2 === 0 ? 'white' : 'black', adjudicated: false,
  plies: [], result: (result ?? '*') as Game['result'], termination: result ? 'checkmate' : '', cost_usd: 0.0002, created_at: '2026-01-01T00:00:00Z',
});

describe('series store', () => {
  it('projects games, blocks, Elo history and secondary stats', async () => {
    await saveSeries(db, seriesRow('s1'));
    const results = ['1-0', '0-1', '1/2-1/2', '1-0', '1-0'];
    for (let i = 0; i < 5; i++) {
      const g = gameRow(`g${i}`, i, i < 4 ? 'finished' : 'running', i < 4 ? results[i]! : null);
      await saveGame(db, g);
      await setGameSeriesFields(db, g.id, { block_index: Math.floor(i / 5), ...(i < 4 ? { model_score: i === 0 || i === 3 ? 1 : i === 2 ? 0.5 : 0 } : {}) });
      await savePly(db, g.id, { ply: 1, side: 'white', by: 'model', uci: 'e2e4', san: 'e4', fen_after: 'x', created_at: 't',
        judge: { depth: 14, best_uci: 'e2e4', best_san: 'e4', best_cp: 30, played_cp: 20, cpl: 10 * (i + 1), win_loss: 1, class: 'ok', acceptable: true } });
    }
    const recs = await seriesGames(db, 's1');
    expect(recs.map((r) => r.status)).toEqual(['finished', 'finished', 'finished', 'finished', 'running']);
    expect(recs[0]!.score).toBe(1);
    expect(recs[4]!.score).toBeUndefined();

    const s = (await buildSeries(db, 's1'))!;
    expect(s.games).toHaveLength(5);
    expect(s.elo).not.toBeNull();
    expect(s.elo_history).toHaveLength(4);
    expect(s.blocks).toHaveLength(1);
    expect(s.blocks[0]).toMatchObject({ index: 0, level_id: 'uci1320', games: 5 });
    expect(s.secondary.acpl).toBeCloseTo((10 + 20 + 30 + 40) / 4, 6);
    expect(s.games[0]!.acpl_model).toBe(10);
    expect(s.games[0]!.model_color).toBe('white');

    const est = s.elo!;
    await saveSeries(db, { ...seriesRow('s1'), elo_mean: est.mean, elo_lo: est.lo, elo_hi: est.hi, w: est.w, d: est.d, l: est.l });
    const sums = await seriesSummaries(db);
    expect(sums.find((x) => x.id === 's1')).toMatchObject({ games_done: 4, model: 'typesafe/jev-1.14', arm: 'clean' });
    expect(sums[0]!.elo?.games).toBe(4);
  });

  it('returns undefined for an unknown series', async () => {
    expect(await buildSeries(db, 'nope')).toBeUndefined();
  });
});
