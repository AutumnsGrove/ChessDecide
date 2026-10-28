import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/d1';
import { getPlatformProxy } from 'wrangler';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { START_FEN, type Game } from '@chessdecide/core';
import * as schema from '../src/schema.ts';
import { d1AttemptSink, d1GameStore, listGames, loadGame, meanInputTokens, spendSince, type Db } from '../src/store.ts';

let db: Db; let dispose: () => Promise<void>;
const migDir = fileURLToPath(new URL('../migrations/', import.meta.url));

beforeAll(async () => {
  const proxy = await getPlatformProxy<{ DB: D1Database }>({
    configPath: fileURLToPath(new URL('../../../apps/web/wrangler.jsonc', import.meta.url)),
    persist: { path: mkdtempSync(join(tmpdir(), 'cd-')) },
  });
  dispose = proxy.dispose;
  for (const f of readdirSync(migDir).filter((x) => x.endsWith('.sql')).sort())
    for (const st of readFileSync(migDir + f, 'utf8').split('--> statement-breakpoint')) if (st.trim()) await proxy.env.DB.exec(st.trim().replace(/\s+/g, ' '));
  db = drizzle(proxy.env.DB, { schema });
}, 60_000);
afterAll(async () => { await dispose?.(); });

const game = (): Game => ({
  id: 'g1', status: 'running', config: { white: { type: 'model', model: 'm', arm: 'clean' }, black: { type: 'ladder', level: 'eps15' }, opening: { type: 'startpos' }, pace_ms: 0, budget_usd: 1, judge_depth: 14, max_plies: 200, adjudicate: true, seed: 1 },
  start_fen: START_FEN, adjudicated: false, result: '*', termination: '', cost_usd: 0.0001, created_at: '2026-01-01T00:00:00Z',
  plies: [{ ply: 1, side: 'white', by: 'model', uci: 'e2e4', san: 'e4', fen_after: 'x', forced: false, decision: null, engine_info: null, eval: { depth: 14, white_eval_cp: 30, wdl: [100, 800, 100] }, judge: null, created_at: 't' }],
});

describe('d1 store', () => {
  it('round-trips a game and upserts plies idempotently', async () => {
    const store = d1GameStore(db); const g = game();
    await store.saveGame(g); await store.savePly(g.id, g.plies[0]!);
    await store.savePly(g.id, { ...g.plies[0]!, judge: { depth: 14, best_uci: 'e2e4', best_san: 'e4', best_cp: 30, played_cp: 30, cpl: 0, win_loss: 0, class: 'ok', acceptable: true } });
    await store.saveGame({ ...g, status: 'finished', result: '1-0', termination: 'checkmate' });
    const back = (await loadGame(db, 'g1'))!;
    expect(back.status).toBe('finished'); expect(back.result).toBe('1-0'); expect(back.plies).toHaveLength(1);
    expect(back.plies[0]!.judge?.class).toBe('ok'); expect(back.plies[0]!.eval?.white_eval_cp).toBe(30);
    expect(back.config.white).toEqual(g.config.white);
    expect((await listGames(db)).length).toBe(1);
  });
  it('attempt sink: gzip round trip, cache lookup, spend ignores cache hits', async () => {
    const sink = d1AttemptSink(db, () => '2026-01-02T00:00:00Z');
    const base = { purpose: 'game', model_slug: 'm', arm_id: 'clean', request_hash: 'h1', latency_ms: 10 };
    const id = await sink.record({ ...base, cache_hit: false, status: 'ok', cost_usd: 0.0002, response_json: JSON.stringify({ a: 1 }) });
    expect(id).toBeGreaterThan(0);
    expect((await sink.findCached('h1'))?.response).toEqual({ a: 1 });
    expect(await sink.findCached('nope')).toBeUndefined();
    await sink.record({ ...base, cache_hit: true, status: 'ok', cost_usd: 0 });
    await sink.record({ ...base, request_hash: 'h2', cache_hit: false, status: 'error', http_status: 502, cost_usd: null });
    const sp = await spendSince(db);
    expect(sp.usd).toBeCloseTo(0.0002, 12); expect(sp.calls).toBe(1); expect(sp.cache_hits).toBe(1);
    expect((await spendSince(db, '2027-01-01T00:00:00Z')).usd).toBe(0);
  });
  it('rolling mean input tokens needs 20 real ok attempts', async () => {
    const sink = d1AttemptSink(db, () => '2026-01-03T00:00:00Z');
    const row = (i: number, over: Record<string, unknown> = {}) => ({
      purpose: 'game', model_slug: 'rolling/model', arm_id: 'clean', request_hash: `r${i}`,
      cache_hit: false, status: 'ok', latency_ms: 1, input_tokens: 1000, cost_usd: 0.0001, ...over,
    });
    for (let i = 0; i < 19; i++) await sink.record(row(i));
    expect(await meanInputTokens(db, 'rolling/model', 'clean')).toBeUndefined();
    await sink.record(row(19, { input_tokens: 1020 }));
    expect(await meanInputTokens(db, 'rolling/model', 'clean')).toBeCloseTo(1001, 6);
    // cached, failed and other-arm rows never move the mean
    await sink.record(row(20, { cache_hit: true, input_tokens: 99999 }));
    await sink.record(row(21, { status: 'error', input_tokens: 99999 }));
    await sink.record(row(22, { arm_id: 'hinted', input_tokens: 99999 }));
    expect(await meanInputTokens(db, 'rolling/model', 'clean')).toBeCloseTo(1001, 6);
  });
});
