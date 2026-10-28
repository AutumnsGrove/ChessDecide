import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/d1';
import { getPlatformProxy } from 'wrangler';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { START_FEN, DEFAULT_LADDER, type Game, type GameConfig } from '@chessdecide/core';
import type { ModelInfo } from '@chessdecide/providers';
import * as schema from '@chessdecide/db/schema';
import { saveGame, savePly, type Db } from '@chessdecide/db';
import { createApi, EventHub, type ApiDeps } from '../src/index.ts';

let db: Db; let dispose: () => Promise<void>;
beforeAll(async () => {
  const proxy = await getPlatformProxy<{ DB: D1Database }>({
    configPath: fileURLToPath(new URL('../../../apps/web/wrangler.jsonc', import.meta.url)),
    persist: { path: mkdtempSync(join(tmpdir(), 'cd-api-')) },
  });
  dispose = proxy.dispose;
  const dir = fileURLToPath(new URL('../../db/migrations/', import.meta.url));
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort())
    for (const st of readFileSync(dir + f, 'utf8').split('--> statement-breakpoint')) if (st.trim()) await proxy.env.DB.exec(st.trim().replace(/\s+/g, ' '));
  db = drizzle(proxy.env.DB, { schema });
  const g: Game = { id: 'g1', status: 'finished', config: { white: { type: 'model', model: 'm', arm: 'clean' }, black: { type: 'ladder', level: 'eps15' }, opening: { type: 'startpos' }, pace_ms: 0, budget_usd: 1, judge_depth: 14, max_plies: 200, adjudicate: true, seed: 1 }, start_fen: START_FEN, adjudicated: false, result: '1-0', termination: 'checkmate', cost_usd: 0.001, created_at: '2026-01-01T00:00:00Z', plies: [] };
  await saveGame(db, g);
  await savePly(db, 'g1', { ply: 1, side: 'white', by: 'model', uci: 'e2e4', san: 'e4', fen_after: 'x', created_at: 't' });
}, 60_000);
afterAll(async () => { await dispose?.(); });

describe('api (read-only)', () => {
  const app = () => createApi({ db, mode: 'public' });
  it('health reports mode and no control', async () => {
    const r = await app().request('/api/health');
    expect(await r.json()).toMatchObject({ ok: true, mode: 'public', control: false });
  });
  it('lists and fetches games; 404 uses the error envelope', async () => {
    const list = await (await app().request('/api/games')).json() as any[];
    expect(list[0]).toMatchObject({ id: 'g1', result: '1-0' });
    const g = await (await app().request('/api/games/g1')).json() as Game;
    expect(g.plies).toHaveLength(1);
    const nf = await app().request('/api/games/nope');
    expect(nf.status).toBe(404); expect(await nf.json()).toMatchObject({ error: { code: 'not_found', retryable: false } });
  });
  it('control routes and live events are not available when read-only', async () => {
    expect((await app().request('/api/games', { method: 'POST', body: '{}' })).status).toBe(404);
    expect((await app().request('/api/games/g1/events')).status).toBe(404);
  });
});

describe('api (control + SSE)', () => {
  it('delegates control calls and streams snapshot then hub events', async () => {
    const hub = new EventHub(); const calls: string[] = [];
    const app = createApi({ db, mode: 'local', hub, control: {
      async createGame(c) { calls.push('create'); return { id: 'new', status: 'ready', config: c, start_fen: START_FEN, adjudicated: false, plies: [], result: '*', termination: '', cost_usd: 0, created_at: '' }; },
      async auto(id, pace) { calls.push(`auto:${id}:${pace}`); }, async pause(id) { calls.push('pause:' + id); }, async step(id) { calls.push('step:' + id); }, async stop(id) { calls.push('stop:' + id); },
    } });
    expect((await app.request('/api/games', { method: 'POST', body: JSON.stringify(gameConfig()) })).status).toBe(201);
    await app.request('/api/games/g1/auto', { method: 'POST', body: JSON.stringify({ pace_ms: 600 }) });
    await app.request('/api/games/g1/pause', { method: 'POST' });
    expect(calls).toEqual(['create', 'auto:g1:600', 'pause:g1']);
    const res = await app.request('/api/games/g1/events');
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const reader = res.body!.getReader(); const dec = new TextDecoder();
    let text = ''; const read = async () => { const { value } = await reader.read(); text += dec.decode(value); };
    await read(); expect(text).toContain('event: snapshot');
    hub.emit('g1', { event: 'status', data: { status: 'paused' } });
    await read(); expect(text).toContain('event: status');
    await reader.cancel();
  });
});

// ---- T01: catalog, estimate, spend, ladder, validation, health ----

const MODELS: ModelInfo[] = [
  { slug: 'typesafe/jev-1.14', canonical_slug: null, name: 'Jev 1.14', context_length: 262144, price_in_per_m: 0.042, input_modalities: ['text', 'image'], roster: true, disabled_reason: null },
  { slug: 'cheap/model', canonical_slug: null, name: 'Cheap', context_length: 32768, price_in_per_m: 0.01, input_modalities: ['text'], roster: false, disabled_reason: null },
];

const gameConfig = (over: Record<string, unknown> = {}): GameConfig => ({
  white: { type: 'model', model: 'typesafe/jev-1.14', arm: 'clean' },
  black: { type: 'ladder', level: 'eps15' },
  opening: { type: 'startpos' },
  pace_ms: 0, budget_usd: 1, judge_depth: 14, max_plies: 200, adjudicate: true, seed: 1,
  ...over,
} as GameConfig);

const stubGame = (config: GameConfig): Game => ({
  id: 'new', status: 'ready', config, start_fen: START_FEN, adjudicated: false,
  plies: [], result: '*', termination: '', cost_usd: 0, created_at: '',
});

function localApi(over: Partial<ApiDeps> = {}) {
  const created: GameConfig[] = [];
  const app = createApi({
    db, mode: 'local', mock: false, hasKey: () => true,
    catalog: { async list() { return MODELS; } },
    ladder: () => DEFAULT_LADDER,
    spend: async () => ({ usd: 0.002, calls: 3, cache_hits: 1 }),
    sessionStart: '2026-01-01T00:00:00Z',
    engine: { ok: true, version: 'Stockfish 19' },
    control: {
      async createGame(c) { created.push(c); return stubGame(c); },
      async auto() {}, async pause() {}, async step() {}, async stop() {},
    },
    ...over,
  });
  return { app, created };
}

const post = (app: ReturnType<typeof localApi>['app'], path: string, body: unknown) =>
  app.request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

describe('api (T01 local capabilities)', () => {
  it('serves the catalog and 404s without it', async () => {
    const { app } = localApi();
    const r = await app.request('/api/models');
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject([{ slug: 'typesafe/jev-1.14', roster: true }, { slug: 'cheap/model', roster: false }]);
    expect((await localApi({ catalog: undefined }).app.request('/api/models')).status).toBe(404);
  });

  it('maps a catalog failure to 502 upstream_error', async () => {
    const app = localApi({ catalog: { async list() { throw new Error('boom'); } } }).app;
    const r = await app.request('/api/models');
    expect(r.status).toBe(502);
    expect(await r.json()).toMatchObject({ error: { code: 'upstream_error', retryable: true } });
  });

  it('estimates a game and rejects an unknown model', async () => {
    const { app } = localApi();
    const ok = await post(app, '/api/estimate', gameConfig());
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ calls: 40, cap_usd: 1, over_cap: false, breakdown: [{ model: 'typesafe/jev-1.14', arm: 'clean', calls: 40 }] });
    const bad = await post(app, '/api/estimate', gameConfig({ white: { type: 'model', model: 'nope/nope', arm: 'clean' } }));
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ error: { code: 'invalid_config' } });
    expect((await post(localApi({ catalog: undefined }).app, '/api/estimate', gameConfig())).status).toBe(404);
  });

  it('reports spend with the requested window', async () => {
    const seen: Array<string | undefined> = [];
    const app = localApi({ spend: async (since) => { seen.push(since); return { usd: 0.002, calls: 3, cache_hits: 1 }; } }).app;
    expect(await (await app.request('/api/spend?since=session')).json()).toEqual({ usd: 0.002, calls: 3, cache_hits: 1 });
    expect(seen[0]).toBe('2026-01-01T00:00:00Z');
    await app.request('/api/spend?since=today');
    expect(seen[1]).toMatch(/T00:00:00\.000Z$/);
    await app.request('/api/spend?since=all');
    expect(seen[2]).toBeUndefined();
    expect((await app.request('/api/spend?since=nope')).status).toBe(400);
    expect((await localApi({ spend: undefined }).app.request('/api/spend')).status).toBe(404);
  });

  it('serves the ladder file and 404s without one', async () => {
    const { app } = localApi();
    expect(await (await app.request('/api/ladder')).json()).toMatchObject({ version: 0, calibrated: false });
    expect((await localApi({ ladder: undefined }).app.request('/api/ladder')).status).toBe(404);
  });

  it('health reports engine, key, ladder and spend', async () => {
    const { app } = localApi();
    expect(await (await app.request('/api/health')).json()).toMatchObject({
      ok: true, mode: 'local', control: true, mock: false,
      engine: { ok: true, version: 'Stockfish 19' },
      openrouter: { key_present: true },
      ladder: { version: 0, calibrated: false },
      budget: { session_usd: 0.002, today_usd: 0.002, total_usd: 0.002 },
    });
  });

  it('validates a new game config', async () => {
    const { app, created } = localApi();
    const ok = await post(app, '/api/games', gameConfig());
    expect(ok.status).toBe(201);
    expect(created).toHaveLength(1);
    for (const bad of [
      gameConfig({ max_plies: 5 }),
      gameConfig({ max_plies: 401 }),
      gameConfig({ budget_usd: 0.0001 }),
      gameConfig({ budget_usd: 51 }),
      gameConfig({ judge_depth: 5 }),
      gameConfig({ judge_depth: 21 }),
      gameConfig({ white: { type: 'nope' } }),
      gameConfig({ opening: null }),
    ]) {
      const r = await post(app, '/api/games', bad);
      expect(r.status).toBe(400);
      expect(await r.json()).toMatchObject({ error: { code: 'invalid_config' } });
    }
    expect(created).toHaveLength(1);
  });

  it('rejects an unknown model, a missing key and an over-cap estimate', async () => {
    const unknown = await post(localApi().app, '/api/games', gameConfig({ white: { type: 'model', model: 'nope/nope', arm: 'clean' } }));
    expect(unknown.status).toBe(400);
    expect(await unknown.json()).toMatchObject({ error: { code: 'invalid_config' } });

    const noKey = await post(localApi({ hasKey: () => false }).app, '/api/games', gameConfig());
    expect(noKey.status).toBe(424);
    expect(await noKey.json()).toMatchObject({ error: { code: 'no_api_key' } });

    const over = await post(localApi().app, '/api/games', gameConfig({ budget_usd: 0.001 }));
    expect(over.status).toBe(402);
    const body = await over.json() as any;
    expect(body.error.code).toBe('budget_exceeded');
    expect(body.error.detail.est_cost_usd).toBeGreaterThan(0.001);
  });

  it('lets mock mode run without a key', async () => {
    const { app, created } = localApi({ mock: true, hasKey: () => false });
    expect((await post(app, '/api/games', gameConfig())).status).toBe(201);
    expect(created).toHaveLength(1);
  });
});
