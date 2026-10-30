/**
 * D1 free tier allows 50 queries per request; keep every read-only route well under 10.
 * Spec: docs/build/tasks/T10-publish.md §3. The counter wraps `DB.prepare` because drizzle's
 * D1 session goes through it for every statement (and `batch` for transactions).
 */
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/d1';
import { getPlatformProxy } from 'wrangler';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as schema from '@chessdecide/db/schema';
import { saveSeries, type Db } from '@chessdecide/db';
import { createApi } from '../src/index.ts';

const MIGRATIONS = fileURLToPath(new URL('../../db/migrations/', import.meta.url));
const CONFIG = fileURLToPath(new URL('../../../apps/web/wrangler.jsonc', import.meta.url));

/** A D1 binding that counts statements, so a route's query budget is observable. */
function counting(raw: D1Database) {
  let queries = 0;
  const target = {
    prepare(sql: string) { queries++; return raw.prepare(sql); },
    exec(sql: string) { queries++; return raw.exec(sql); },
    batch(stmts: D1PreparedStatement[]) { queries++; return raw.batch(stmts); },
    dump: () => raw.dump(),
  } as unknown as D1Database;
  const db = drizzle(target, { schema });
  return { db, reset: () => { queries = 0; }, count: () => queries };
}

const ARMS = [
  { model: 'liquid/d1-ultra', arm: 'hinted', mean: 895 },
  { model: 'typesafe/jev-1.14', arm: 'hinted', mean: 775 },
  { model: 'liquid/d1-ultra', arm: 'clean', mean: 733 },
  { model: 'typesafe/jev-1.14', arm: 'clean', mean: 532 },
];

let db: Db;
let counted: ReturnType<typeof counting>;
let dispose: () => Promise<void>;

beforeAll(async () => {
  const proxy = await getPlatformProxy<{ DB: D1Database }>({
    configPath: CONFIG,
    persist: { path: mkdtempSync(join(tmpdir(), 'cd-query-budget-')) },
  });
  dispose = proxy.dispose;
  for (const f of readdirSync(MIGRATIONS).filter((x) => x.endsWith('.sql')).sort())
    for (const st of readFileSync(MIGRATIONS + f, 'utf8').split('--> statement-breakpoint'))
      if (st.trim()) await proxy.env.DB.exec(st.trim().replace(/\s+/g, ' '));
  db = drizzle(proxy.env.DB, { schema });
  counted = counting(proxy.env.DB);

  await db.insert(schema.ladder_levels).values([
    { ladder_version: 2, id: 'uci1320', kind: 'uci', params_json: JSON.stringify({ uci_elo: 1320 }), elo: 1320, se: 30, games: 200 },
    { ladder_version: 2, id: 'uci1500', kind: 'uci', params_json: JSON.stringify({ uci_elo: 1500 }), elo: 1583, se: 30, games: 200 },
  ]);

  for (const [i, a] of ARMS.entries()) {
    const id = `S${i}`;
    await saveSeries(db, {
      id, name: `${a.model} · ${a.arm}`, model_slug: a.model, arm_id: a.arm, arm_json: '{}',
      status: 'finished', status_reason: null, size_json: JSON.stringify({ preset: 'quick' }),
      ladder_mode: 'adaptive', ladder_level: null, ladder_version: 2, seed: i + 1, budget_usd: 0.5,
      cost_usd: 0.01, elo_mean: a.mean, elo_lo: a.mean - 160, elo_hi: a.mean + 160, w: 2, d: 0, l: 0,
      created_at: `2026-03-0${i + 1}T00:00:00Z`, finished_at: '2026-03-09T00:00:00Z',
    });
    for (let g = 0; g < 2; g++) {
      const config = {
        white: { type: 'model', model: a.model, arm: a.arm },
        black: { type: 'ladder', level: 'uci1500' },
        opening: { type: 'startpos' }, pace_ms: 0, budget_usd: 0.5, judge_depth: 14,
        max_plies: 200, adjudicate: true, seed: g,
      };
      await db.insert(schema.games).values({
        id: `${id}G${g}`, status: 'finished', config_json: JSON.stringify(config),
        white_player: JSON.stringify(config.white), black_player: JSON.stringify(config.black),
        series_id: id, series_index: g, block_index: 0, level_id: 'uci1500', level_elo: 1500,
        model_color: g === 0 ? 'white' : 'black', model_score: g === 0 ? 1 : 0, adjudicated: 0,
        start_fen: 'start', result: g === 0 ? '1-0' : '0-1', termination: 'checkmate', cost_usd: 0.005,
        created_at: `2026-03-0${i + 1}T00:10:0${g}Z`,
      });
      const decision = {
        model_slug: a.model, arm: a.arm, pick_uci: 'e2e4', p_pick: 0.4, n_options: 1,
        top_options: [{ uci: 'e2e4', san: 'e4', p: 0.4 }], latency_ms: 900,
        usage: { input_tokens: 1500, output_tokens: 40, cost_usd: 0.005 }, cache_hit: false, retries: 0, attempt_id: 1,
      };
      await db.insert(schema.plies).values([
        { game_id: `${id}G${g}`, ply: 1, side: 'white', by: 'model', uci: 'e2e4', san: 'e4', fen_after: 'f', forced: 0, decision_json: JSON.stringify(decision), eval_json: '{}', created_at: 't' },
        { game_id: `${id}G${g}`, ply: 2, side: 'black', by: 'engine', uci: 'e7e5', san: 'e5', fen_after: 'f', forced: 0, engine_json: '{}', eval_json: '{}', created_at: 't' },
      ]);
    }
  }
}, 120_000);

afterAll(async () => { await dispose?.(); });

describe('read-only route query budget', () => {
  const app = () => createApi({ db: counted.db, mode: 'public' });

  const calls = async (path: string): Promise<{ status: number; queries: number; body: string; type: string }> => {
    counted.reset();
    const res = await app().fetch(new Request(`http://x${path}`));
    const queries = counted.count();
    const body = await res.text();
    return { status: res.status, queries, body, type: res.headers.get('content-type') ?? '' };
  };

  /** Every route the public site uses: 4 arms, 8 games, 16 plies, one series each. */
  const routes = [
    '/api/health',
    '/api/games',
    '/api/games/S0G0',
    '/api/leaderboard',
    '/api/leaderboard/compare?a=liquid/d1-ultra%23hinted&b=typesafe/jev-1.14%23clean',
    '/api/series',
    '/api/series/S0',
    '/api/series/S0/games',
    '/api/games/S0G0/pgn',
    '/api/series/S0/export.json',
    '/api/series/S0/export.csv',
    '/api/leaderboard/export.csv',
  ];

  for (const path of routes) {
    it(`${path} answers with ≤ 10 queries`, async () => {
      const { status, queries, body } = await calls(path);
      expect(status, `${path}: ${body}`).toBeLessThan(300);
      expect(queries, `${path} ran ${queries} queries`).toBeLessThanOrEqual(10);
    });
  }

  it('the leaderboard does not grow its query count with the number of arms', async () => {
    const { queries } = await calls('/api/leaderboard');
    // rows + finished-game counts + games + plies, plus the published ladder (version + levels).
    // buildSeries per arm is in memory, so this number does not move when arms are added.
    expect(queries).toBe(6);
  });

  it('public mode derives the ruler from the published ladder', async () => {
    const res = await app().fetch(new Request('http://x/api/leaderboard'));
    const board = (await res.json()) as { ladder: { version: number; calibrated: boolean }; rows: { arm_id: string }[]; reference: { id: string }[] };
    expect(board.ladder).toEqual({ version: 2, calibrated: true });
    expect(board.rows).toHaveLength(4);
    expect(board.reference.map((r) => r.id)).toEqual(['uci1320', 'uci1500']);

    const health = (await (await app().fetch(new Request('http://x/api/health'))).json()) as { ladder: { version: number; calibrated: boolean } };
    expect(health.ladder).toEqual({ version: 2, calibrated: true });

    const ladder = (await (await app().fetch(new Request('http://x/api/ladder'))).json()) as { version: number; levels: unknown[] };
    expect(ladder.version).toBe(2);
    expect(ladder.levels).toHaveLength(2);
  });

  it('exports answer with the promised body and content type', async () => {
    const pgn = await calls('/api/games/S0G0/pgn');
    expect(pgn.type).toContain('text/plain');
    expect(pgn.body).toContain('[Event "ChessDecide"]');
    expect(pgn.body).toContain('[Site "chessdecide"]');
    expect(pgn.body.trimEnd().endsWith('1-0')).toBe(true);

    const json = await calls('/api/series/S0/export.json');
    expect(json.type).toContain('application/json');
    const body = JSON.parse(json.body) as { id: string; games: unknown[] };
    expect(body.id).toBe('S0');
    expect(body.games).toHaveLength(2);

    const seriesCsvOut = await calls('/api/series/S0/export.csv');
    expect(seriesCsvOut.type).toContain('text/csv');
    expect(seriesCsvOut.body.split('\n')[0]).toBe('index,block,level_id,level_elo,model_color,result,model_score,termination,adjudicated,plies,acpl,cost_usd,game_id');
    expect(seriesCsvOut.body.trimEnd().split('\n')).toHaveLength(3);

    const boardCsv = await calls('/api/leaderboard/export.csv');
    expect(boardCsv.type).toContain('text/csv');
    expect(boardCsv.body.split('\n')[0]).toBe('arm_id,model,arm,series_id,status,games,elo_mean,elo_lo,elo_hi,w,d,l,score_pct,acpl,acceptable_rate,blunder_rate,cost_usd');
    expect(boardCsv.body.trimEnd().split('\n')).toHaveLength(5);
  });

  it('public mode exposes no control or catalog routes', async () => {
    expect((await calls('/api/models')).status).toBe(404);
    expect((await calls('/api/spend')).status).toBe(404);
    expect((await app().request('/api/games', { method: 'POST', body: '{}' })).status).toBe(404);
  });
});
