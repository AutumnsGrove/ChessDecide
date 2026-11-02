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
import { eq } from 'drizzle-orm';
import * as schema from '@chessdecide/db/schema';
import { freezeSecondary, saveSeries, type Db } from '@chessdecide/db';
import { createApi } from '../src/index.ts';

const MIGRATIONS = fileURLToPath(new URL('../../db/migrations/', import.meta.url));
const CONFIG = fileURLToPath(new URL('../../../apps/web/wrangler.jsonc', import.meta.url));

/** A D1 binding that counts statements, so a route's query budget is observable. */
function counting(raw: D1Database) {
  let queries = 0;
  const seen: string[] = [];
  const target = {
    prepare(sql: string) { queries++; seen.push(sql); return raw.prepare(sql); },
    exec(sql: string) { queries++; seen.push(sql); return raw.exec(sql); },
    batch(stmts: D1PreparedStatement[]) { queries++; return raw.batch(stmts); },
    dump: () => raw.dump(),
  } as unknown as D1Database;
  const db = drizzle(target, { schema });
  return { db, reset: () => { queries = 0; seen.length = 0; }, count: () => queries, statements: () => [...seen] };
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
    // A settled series is frozen when it ends; seed it the way the runner does.
    await freezeSecondary(db, id);
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
    '/api/games/browse',
    '/api/games/browse?model=liquid%2Fd1-ultra&arm=hinted&outcome=won&sort=strongest&page=1&per=5',
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
    // series rows + finished-game counts + game summaries, plus the published ladder (version + levels).
    // Frozen stats mean no plies query, and nothing here is per arm, so this does not move when arms are added.
    expect(queries).toBe(5);
  });

  it('the leaderboard and its CSV never scan plies', async () => {
    for (const path of ['/api/leaderboard', '/api/leaderboard/export.csv', '/api/leaderboard/compare?a=liquid/d1-ultra%23hinted&b=typesafe/jev-1.14%23clean']) {
      await calls(path);
      expect(counted.statements().filter((q) => /\bplies\b/.test(q)), path).toEqual([]);
    }
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

describe('GET /api/games/browse', () => {
  const app = () => createApi({ db: counted.db, mode: 'public' });
  const get = async (qs: string) => {
    counted.reset();
    const res = await app().fetch(new Request(`http://x/api/games/browse${qs}`));
    return { status: res.status, queries: counted.count(), body: (await res.json()) as any };
  };

  it('is two statements (tally, page) however it is filtered', async () => {
    expect((await get('')).queries).toBe(2);
    expect((await get('?model=liquid%2Fd1-ultra&arm=hinted&outcome=lost&sort=weakest&level=uci1500')).queries).toBe(2);
  });

  it('pages and tallies the whole filtered set, not just the page', async () => {
    const all = (await get('?per=3&page=1')).body;
    expect(all.total).toBe(8);
    expect(all.items).toHaveLength(3);
    expect(all.tally).toEqual({ w: 4, d: 0, l: 4 });
    const last = (await get('?per=3&page=3')).body;
    expect(last.items).toHaveLength(2);
    expect((await get('?per=3&page=9')).body.items).toEqual([]);
  });

  it('filters by model + arm through the series, and by outcome', async () => {
    const one = (await get('?model=liquid%2Fd1-ultra&arm=hinted')).body;
    expect(one.total).toBe(2);
    expect(one.items.every((g: any) => g.white.model === 'liquid/d1-ultra' || g.black.model === 'liquid/d1-ultra')).toBe(true);
    const won = (await get('?outcome=won')).body;
    expect(won.total).toBe(4);
    expect(won.items.every((g: any) => g.model_score === 1)).toBe(true);
    expect((await get('?arm=clean')).body.total).toBe(4);
    expect((await get('?model=nobody%2Fhome')).body).toMatchObject({ total: 0, items: [], tally: { w: 0, d: 0, l: 0 } });
  });

  it('defaults to the best results first and can sort the other ways', async () => {
    const dflt = (await get('?per=8')).body.items.map((g: any) => g.model_score);
    expect(dflt).toEqual([1, 1, 1, 1, 0, 0, 0, 0]);
    const newest = (await get('?sort=new&per=8')).body.items.map((g: any) => g.created_at);
    expect(newest).toEqual([...newest].sort().reverse());
    expect((await get('?sort=strongest&per=2')).status).toBe(200);
  });

  it('keeps a game played by hand on the first page, ahead of the best series games', async () => {
    const config = JSON.stringify({ white: { type: 'model', model: 'liquid/d1-ultra', arm: 'clean' }, black: { type: 'ladder', level: 'uci1500' } });
    await db.insert(schema.games).values({
      id: 'HANDPLAYED', status: 'finished', config_json: config, white_player: JSON.stringify({ type: 'model', model: 'liquid/d1-ultra', arm: 'clean' }),
      black_player: JSON.stringify({ type: 'ladder', level: 'uci1500' }), start_fen: 'start', result: '1/2-1/2', termination: 'repetition',
      created_at: '2026-04-01T00:00:00Z',
    });
    try {
      expect((await get('?per=3')).body.items[0].id).toBe('HANDPLAYED');
      // Sorted by anything else it is just one more game.
      expect((await get('?sort=weakest&per=1')).status).toBe(200);
    } finally {
      await db.delete(schema.games).where(eq(schema.games.id, 'HANDPLAYED'));
    }
  });

  it('carries the final position so the list can draw a thumbnail', async () => {
    const g = (await get('?per=1')).body.items[0];
    expect(g).toMatchObject({ plies: 2, final_fen: 'f', level_id: 'uci1500', level_elo: 1500 });
  });

  it('rejects malformed parameters with a 400 instead of guessing', async () => {
    for (const qs of ['?sort=plies', '?outcome=maybe', '?page=0', '?page=x', '?per=500', `?model=${'a'.repeat(201)}`])
      expect((await get(qs)).status, qs).toBe(400);
  });
});
