import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/d1';
import { getPlatformProxy } from 'wrangler';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { START_FEN, type Game } from '@chessdecide/core';
import * as schema from '@chessdecide/db/schema';
import { loadGame, saveSeries, setGameSeriesFields, type Db } from '@chessdecide/db';
import {
  MAX_STATEMENT_BYTES, PUBLISH_ORDER, assertRemoteReady, chunkStatements, collectPublishRows, outputPaths, planPublish, runPublish,
  sanitizeConfigJson, sqlLiteral, stripJsonComments,
} from '../src/publish.ts';

const MIGRATIONS = fileURLToPath(new URL('../../db/migrations/', import.meta.url));
const CONFIG = fileURLToPath(new URL('../../../apps/web/wrangler.jsonc', import.meta.url));

interface Local { db: Db; raw: D1Database; dispose: () => Promise<void> }

async function openLocal(tag: string): Promise<Local> {
  const proxy = await getPlatformProxy<{ DB: D1Database }>({
    configPath: CONFIG,
    persist: { path: mkdtempSync(join(tmpdir(), `cd-publish-${tag}-`)) },
  });
  for (const f of readdirSync(MIGRATIONS).filter((x) => x.endsWith('.sql')).sort())
    for (const st of readFileSync(MIGRATIONS + f, 'utf8').split('--> statement-breakpoint'))
      if (st.trim()) await proxy.env.DB.exec(st.trim().replace(/\s+/g, ' '));
  return { db: drizzle(proxy.env.DB, { schema }), raw: proxy.env.DB, dispose: proxy.dispose };
}

const count = async (db: D1Database, table: string): Promise<number> => {
  const row = await db.prepare(`select count(*) as n from ${table}`).first<{ n: number }>();
  return row?.n ?? 0;
};

const game = (id: string, over: Partial<Game> = {}): Game => ({
  id, status: 'finished',
  config: {
    white: { type: 'model', model: 'liquid/d1-ultra', arm: 'hinted' },
    black: { type: 'ladder', level: 'uci1500' },
    opening: { type: 'random4', seed: 3 },
    pace_ms: 0, budget_usd: 0.5, judge_depth: 14, max_plies: 200, adjudicate: true, seed: 7,
  },
  start_fen: START_FEN, series_id: 'S1', series_index: 1,
  level_id: 'uci1500', level_elo: 1500, model_color: 'white',
  adjudicated: false, result: '1-0', termination: 'checkmate', cost_usd: 0.002,
  created_at: '2026-02-01T00:00:00Z',
  plies: [
    {
      ply: 1, side: 'white', by: 'model', uci: 'e2e4', san: 'e4', fen_after: 'fen-1',
      decision: {
        model_slug: 'liquid/d1-ultra', arm: 'hinted', pick_uci: 'e2e4', p_pick: 0.42, n_options: 2,
        top_options: [{ uci: 'e2e4', san: 'e4', p: 0.42 }], latency_ms: 900,
        usage: { input_tokens: 1500, output_tokens: 40, cost_usd: 0.002 }, cache_hit: false, retries: 0, attempt_id: 12,
      },
      engine_info: null, eval: { depth: 14, white_eval_cp: 20, wdl: [100, 800, 100] }, judge: null, created_at: 't',
    },
    {
      ply: 2, side: 'black', by: 'engine', uci: 'e7e5', san: 'e5', fen_after: 'fen-2',
      decision: null,
      engine_info: { engine_id: 'stockfish', level_id: 'uci1500', elo: 1500, time_ms: 50, random: false },
      eval: { depth: 14, white_eval_cp: 15, wdl: [90, 810, 100] }, judge: null, created_at: 't',
    },
  ],
  ...over,
});

let src: Local; let dst: Local;

beforeAll(async () => {
  [src, dst] = await Promise.all([openLocal('src'), openLocal('dst')]);

  // Ladder for the version the series used.
  await src.db.insert(schema.ladder_levels).values([
    { ladder_version: 2, id: 'uci1500', kind: 'uci', params_json: JSON.stringify({ movetime_ms: 50 }), elo: 1500, se: 40, games: 200 },
    { ladder_version: 2, id: 'eps30', kind: 'eps', params_json: JSON.stringify({ eps: 0.3 }), elo: 1010, se: 60, games: 200 },
    { ladder_version: 1, id: 'uci1500', kind: 'uci', params_json: '{}', elo: 1490, se: 40, games: 200 },
  ]);

  // Two verdicts get published; the running one does not.
  await saveSeries(src.db, {
    id: 'S1', name: "Jev's clean run", model_slug: 'typesafe/jev-1.14', arm_id: 'clean', arm_json: '{}',
    status: 'finished', status_reason: null, size_json: JSON.stringify({ preset: 'quick' }),
    ladder_mode: 'adaptive', ladder_level: null, ladder_version: 2, seed: 1, budget_usd: 0.5,
    cost_usd: 0.006, elo_mean: 700, elo_lo: 550, elo_hi: 850, w: 2, d: 0, l: 1,
    created_at: '2026-02-01T00:00:00Z', finished_at: '2026-02-01T01:00:00Z',
  });
  await saveSeries(src.db, {
    id: 'S2', name: 'Still going', model_slug: 'liquid/d1-ultra', arm_id: 'hinted', arm_json: '{}',
    status: 'running', status_reason: null, size_json: JSON.stringify({ preset: 'quick' }),
    ladder_mode: 'adaptive', ladder_level: null, ladder_version: 2, seed: 2, budget_usd: 0.5,
    cost_usd: 0.001, created_at: '2026-02-02T00:00:00Z', finished_at: null,
  });

  for (const [i, id] of ['G1', 'G2', 'G3'].entries()) {
    const g = game(id, { series_index: i, ...(i === 2 ? { model_color: 'black' } : {}) });
    await src.db.insert(schema.games).values({
      id: g.id, status: g.status, status_reason: null, config_json: JSON.stringify(g.config),
      white_player: JSON.stringify(g.config.white), black_player: JSON.stringify(g.config.black),
      series_id: g.series_id!, series_index: g.series_index!, block_index: Math.floor(i / 25),
      level_id: g.level_id!, level_elo: g.level_elo!, model_color: g.model_color!,
      model_score: i === 2 ? 0 : 1, adjudicated: 0, start_fen: g.start_fen,
      result: g.result, termination: g.termination, budget_usd: g.config.budget_usd, cost_usd: g.cost_usd,
      created_at: g.created_at, finished_at: '2026-02-01T00:30:00Z',
    });
    for (const p of g.plies) await src.db.insert(schema.plies).values({
      game_id: g.id, ply: p.ply, side: p.side, by: p.by, uci: p.uci, san: p.san, fen_after: p.fen_after,
      forced: 0, attempt_id: p.decision?.attempt_id ?? null, decision_json: JSON.stringify(p.decision),
      engine_json: JSON.stringify(p.engine_info), eval_json: JSON.stringify(p.eval), judge_json: null, created_at: 't',
    });
  }

  // A finished game outside any series, and plenty of local-only data.
  await src.db.insert(schema.games).values({
    id: 'LONE', status: 'finished', config_json: JSON.stringify(game('LONE').config),
    white_player: '{}', black_player: '{}', series_id: null, start_fen: START_FEN,
    result: '1/2-1/2', termination: 'stalemate', created_at: '2026-02-03T00:00:00Z',
  });
  await src.db.insert(schema.attempts).values({
    created_at: '2026-02-01T00:00:00Z', purpose: 'game', model_slug: 'typesafe/jev-1.14', arm_id: 'clean',
    status: 'ok', request_gz: 'sk-or-v1-SHOULD-NEVER-BE-PUBLISHED',
  });
  await src.db.insert(schema.oracle_moves).values({
    position_hash: 'h', sf_version: '19', depth: 14, hash_mb: 16, threads: 1, uci: 'e2e4', san: 'e4',
    cp: 20, wp: 0.52, wdl_json: '[100,800,100]',
  });
  await src.db.insert(schema.ladder_games).values({ ladder_version: 2, level_a: 'uci1500', level_b: 'eps30', game_index: 0 });
  await src.db.insert(schema.settings).values({ key: 'secret', value: 'sk-or-v1-SHOULD-NEVER-BE-PUBLISHED' });
  await src.db.insert(schema.models_snapshot).values({ slug: 'liquid/d1-ultra', captured_at: '2026-02-01T00:00:00Z' });
}, 120_000);

afterAll(async () => { await src?.dispose(); await dst?.dispose(); });

const loadAll = async (local: Local) => ({
  series: await local.raw.prepare('select * from series').all(),
  games: await local.raw.prepare('select * from games').all(),
  plies: await local.raw.prepare('select * from plies').all(),
  ladder_levels: await local.raw.prepare('select * from ladder_levels').all(),
});

describe('publish SQL generator', () => {
  it('selects only verdict series, their games, plies and ladder rows', async () => {
    const plan = await planPublish(src.db, {});
    expect(plan.counts).toEqual({ ladder_levels: 2, series: 1, games: 3, plies: 6 });
    expect(plan.tables.series.map((r) => r.id)).toEqual(['S1']);
    expect(plan.tables.games.map((r) => r.id).sort()).toEqual(['G1', 'G2', 'G3']);
    expect(plan.tables.ladder_levels.map((r) => r.id)).toEqual(['eps30', 'uci1500']);

    const sql = plan.chunks.join('\n');
    expect(sql).not.toContain('attempts');
    expect(sql).not.toContain('oracle_moves');
    expect(sql).not.toContain('sk-or-');
    expect(sql.startsWith('INSERT OR REPLACE INTO "ladder_levels"')).toBe(true);
    expect(sql.indexOf('INTO "series"')).toBeLessThan(sql.indexOf('INTO "games"'));
    expect(sql.indexOf('INTO "games"')).toBeLessThan(sql.indexOf('INTO "plies"'));
    expect(PUBLISH_ORDER).toEqual(['ladder_levels', 'series', 'games', 'plies']);
  });

  it('includes finished standalone games only with --all-games', async () => {
    const plan = await planPublish(src.db, { allGames: true });
    expect(plan.counts.games).toBe(4);
    expect(plan.tables.games.map((r) => r.id)).toContain('LONE');
  });

  it('accepts explicit series ids, including ones that are still running', async () => {
    const plan = await planPublish(src.db, { seriesIds: ['S2'] });
    expect(plan.counts.series).toBe(1);
    expect(plan.tables.series[0]!.id).toBe('S2');
    expect(plan.counts.games).toBe(0);
  });

  it('round-trips into a second local D1 without attempts or keys, and is idempotent', async () => {
    const plan = await planPublish(src.db, { allGames: true });
    for (const st of plan.statements) await dst.raw.exec(st.sql);

    for (const table of ['series', 'games', 'plies', 'ladder_levels'] as const)
      expect(await count(dst.raw, table)).toBe(plan.counts[table]);
    for (const table of ['attempts', 'oracle_moves', 'settings', 'models_snapshot', 'ladder_games'])
      expect(await count(dst.raw, table)).toBe(0);

    const dump = JSON.stringify(await loadAll(dst));
    expect(dump).not.toContain('sk-or-');

    const nulls = await dst.raw.prepare('select count(*) as n from plies where attempt_id is not null').first<{ n: number }>();
    expect(nulls?.n).toBe(0);

    // The apostrophe in the series name survives the doubling.
    const series = await dst.raw.prepare("select name from series where id = 'S1'").first<{ name: string }>();
    expect(series?.name).toBe("Jev's clean run");

    // Running again replaces rows instead of duplicating them.
    for (const st of plan.statements) await dst.raw.exec(st.sql);
    for (const table of ['series', 'games', 'plies', 'ladder_levels'] as const)
      expect(await count(dst.raw, table)).toBe(plan.counts[table]);

    const strip = (g: Game | undefined): Game | undefined => JSON.parse(JSON.stringify(g), (key, value) => (key === 'attempt_id' ? undefined : value));
    expect(strip(await loadGame(dst.db, 'G1'))).toEqual(strip(await loadGame(src.db, 'G1')));
    expect(strip(await loadGame(dst.db, 'G2'))).toEqual(strip(await loadGame(src.db, 'G2')));
  });

  it('--dry-run writes nothing', async () => {
    const outBase = join(mkdtempSync(join(tmpdir(), 'cd-publish-out-')), 'nested', 'publish.sql');
    const lines: string[] = [];
    const summary = await runPublish({ db: src.db, outBase, dryRun: true, log: (l) => lines.push(l) });
    expect(summary.dryRun).toBe(true);
    expect(summary.files).toEqual([]);
    expect(existsSync(dirname(outBase))).toBe(false);
    expect(lines.join('\n')).toContain('plies');
    expect(lines.join('\n')).toContain(String(summary.bytes));
  });

  it('writes chunked files and prints their paths when not dry', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cd-publish-write-'));
    const outBase = join(dir, 'publish.sql');
    const lines: string[] = [];
    const summary = await runPublish({ db: src.db, outBase, log: (l) => lines.push(l) });
    expect(summary.files).toHaveLength(1);
    const text = readFileSync(summary.files[0]!, 'utf8');
    expect(text.trim().endsWith(';')).toBe(true);
    expect(outputPaths('/tmp/x/publish.sql', 2)).toEqual(['/tmp/x/publish-001.sql', '/tmp/x/publish-002.sql']);
    expect(lines.some((l) => l.includes('wrote'))).toBe(true);
  });
});

describe('publish helpers', () => {
  it('quotes SQL literals', () => {
    expect(sqlLiteral(null)).toBe('NULL');
    expect(sqlLiteral(undefined)).toBe('NULL');
    expect(sqlLiteral(true)).toBe('1');
    expect(sqlLiteral(0.5)).toBe('0.5');
    expect(sqlLiteral("O'Brien")).toBe("'O''Brien'");
    expect(() => sqlLiteral(Number.NaN)).toThrow(/SQL number/);
  });

  it('refuses a config that looks like it holds a key', () => {
    expect(sanitizeConfigJson('{"seed":1}')).toBe('{"seed":1}');
    expect(() => sanitizeConfigJson('{"api_key":"sk-or-v1-abcdef123456"}')).toThrow(/API key|api_key/);
    expect(() => sanitizeConfigJson('{"note":"sk-or-v1-abcdef123456"}')).toThrow(/API key/);
  });

  it('fails clearly when one row is over the D1 statement limit', () => {
    const big = [{ table: 'plies' as const, key: 'G1#300', sql: 'x'.repeat(MAX_STATEMENT_BYTES + 1) }];
    expect(() => chunkStatements(big)).toThrow(/over D1's 102400-byte statement limit/);
  });

  it('parses wrangler config with comments', () => {
    const text = '{\n // local dev\n "d1_databases": [{ "database_id": "local-dev" /* keep */ }]\n}';
    expect(JSON.parse(stripJsonComments(text)).d1_databases[0].database_id).toBe('local-dev');
  });

  it('refuses --remote against the local or a placeholder database id', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cd-publish-config-'));
    const write = (id: string) => {
      const path = join(dir, `w-${id.replace(/[^a-z0-9]/gi, '')}.jsonc`);
      writeFileSync(path, `{ "d1_databases": [{ "database_id": "${id}" }] }`);
      return path;
    };
    expect(() => assertRemoteReady(write('local-dev'))).toThrow(/local D1|not a Cloudflare D1 id/);
    expect(() => assertRemoteReady(write('REPLACE_WITH_D1_DATABASE_ID'))).toThrow(/not a Cloudflare D1 id/);
    expect(() => assertRemoteReady(write('11111111-2222-3333-4444-555555555555'))).not.toThrow();
  });

  it('collects nothing for an unknown series id', async () => {
    const rows = await collectPublishRows(src.db, { seriesIds: ['nope'] });
    expect(rows).toEqual({ ladder_levels: [], series: [], games: [], plies: [] });
  });

  it('leaves the source untouched', async () => {
    expect(await count(src.raw, 'attempts')).toBe(1);
    expect(await count(src.raw, 'plies')).toBe(6);
    const withAttempt = await src.raw.prepare('select count(*) as n from plies where attempt_id is not null').first<{ n: number }>();
    expect(withAttempt?.n).toBe(3);
  });
});
