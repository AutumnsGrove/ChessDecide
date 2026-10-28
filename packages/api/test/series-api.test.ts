import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/d1';
import { getPlatformProxy } from 'wrangler';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_LADDER, type Series, type SeriesConfig, type SeriesEvent } from '@chessdecide/core';
import type { ModelInfo } from '@chessdecide/providers';
import * as schema from '@chessdecide/db/schema';
import { saveSeries, type Db, type SeriesRow } from '@chessdecide/db';
import { createApi, EventHub, type ApiDeps } from '../src/index.ts';

let db: Db; let dispose: () => Promise<void>;
beforeAll(async () => {
  const proxy = await getPlatformProxy<{ DB: D1Database }>({
    configPath: fileURLToPath(new URL('../../../apps/web/wrangler.jsonc', import.meta.url)),
    persist: { path: mkdtempSync(join(tmpdir(), 'cd-series-api-')) },
  });
  dispose = proxy.dispose;
  const dir = fileURLToPath(new URL('../../db/migrations/', import.meta.url));
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort())
    for (const st of readFileSync(dir + f, 'utf8').split('--> statement-breakpoint')) if (st.trim()) await proxy.env.DB.exec(st.trim().replace(/\s+/g, ' '));
  db = drizzle(proxy.env.DB, { schema });
}, 60_000);
afterAll(async () => { await dispose?.(); });

const MODELS: ModelInfo[] = [
  { slug: 'typesafe/jev-1.14', canonical_slug: null, name: 'Jev', context_length: 262144, price_in_per_m: 0.042, input_modalities: ['text'], roster: true, disabled_reason: null },
];

const row = (id: string): SeriesRow => ({
  id, name: 'Jev · clean · quick', model_slug: 'typesafe/jev-1.14', arm_id: 'clean', arm_json: '{}',
  status: 'created', status_reason: null, size_json: JSON.stringify({ preset: 'quick' }),
  ladder_mode: 'adaptive', ladder_level: null, ladder_version: 0, seed: 1, budget_usd: 1,
  concurrency: 2, judge_depth: 14, cost_usd: 0, elo_mean: null, elo_lo: null, elo_hi: null, w: 0, d: 0, l: 0,
  elo_history_json: null, blocks_json: null, catalog_snapshot_json: null,
  created_at: '2026-01-01T00:00:00Z', finished_at: null,
});

const sCfg = (over: Record<string, unknown> = {}): SeriesConfig => ({
  model: 'typesafe/jev-1.14', arm: 'clean', size: { preset: 'quick' }, ladder: { mode: 'adaptive' },
  seed: 1, budget_usd: 1, concurrency: 2, judge_depth: 14, ...over,
} as SeriesConfig);

const stub = (cfg: SeriesConfig): Series => ({
  id: 'new', name: 'new', model: cfg.model, arm: 'clean', status: 'created', size: cfg.size,
  ladder_version: 0, seed: 1, budget_usd: cfg.budget_usd, cost_usd: 0, games: [], blocks: [],
  elo: null, elo_history: [], secondary: {} as Series['secondary'], created_at: '',
});

function app(over: Partial<ApiDeps> = {}) {
  const calls: string[] = [];
  const seriesHub = new EventHub<SeriesEvent>();
  const deps: ApiDeps = {
    db, mode: 'local', mock: false, hasKey: () => true,
    catalog: { async list() { return MODELS; } },
    ladder: () => DEFAULT_LADDER,
    series: {
      async create(c) { calls.push('create'); return stub(c); },
      async start(id) { calls.push('start:' + id); },
      async pause(id) { calls.push('pause:' + id); },
      async stop(id) { calls.push('stop:' + id); },
    },
    seriesHub,
    ...over,
  };
  return { api: createApi(deps), calls, seriesHub };
}

const post = (api: ReturnType<typeof app>['api'], path: string, body?: unknown) =>
  api.request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

describe('series API', () => {
  it('creates, lists, reads, lists games and delegates controls', async () => {
    await saveSeries(db, row('s1'));
    const { api, calls } = app();
    expect((await post(api, '/api/series', sCfg())).status).toBe(201);
    const list = await (await api.request('/api/series')).json() as any[];
    expect(list.find((x) => x.id === 's1')).toMatchObject({ model: 'typesafe/jev-1.14', games_done: 0 });
    const full = await (await api.request('/api/series/s1')).json() as Series;
    expect(full).toMatchObject({ id: 's1', status: 'created', games: [] });
    expect(await (await api.request('/api/series/s1/games')).json()).toEqual([]);
    await post(api, '/api/series/s1/start');
    await post(api, '/api/series/s1/pause');
    await post(api, '/api/series/s1/stop');
    await post(api, '/api/series/s1/resume');
    expect(calls).toEqual(['create', 'start:s1', 'pause:s1', 'stop:s1', 'start:s1']);
    expect((await api.request('/api/series/nope')).status).toBe(404);
  });

  it('validates the series config and the budget/key paths', async () => {
    const { api } = app();
    for (const bad of [
      sCfg({ model: 'nope/nope' }),
      sCfg({ size: { preset: 'nope' } }),
      sCfg({ size: { preset: 'custom', games: 0 } }),
      sCfg({ budget_usd: 0.001 }),
      sCfg({ ladder: { mode: 'fixed', level: 'nope' } }),
      sCfg({ concurrency: 3 }),
      sCfg({ judge_depth: 99 }),
    ]) {
      const r = await post(api, '/api/series', bad);
      expect(r.status).toBe(400);
      expect(await r.json()).toMatchObject({ error: { code: 'invalid_config' } });
    }
    const over = await post(api, '/api/series', sCfg({ budget_usd: 0.01 }));
    expect(over.status).toBe(402);
    expect(await over.json()).toMatchObject({ error: { code: 'budget_exceeded', detail: { est_cost_usd: expect.any(Number) } } });
    const noKey = await post(app({ hasKey: () => false }).api, '/api/series', sCfg());
    expect(noKey.status).toBe(424);
    expect(await noKey.json()).toMatchObject({ error: { code: 'no_api_key' } });
    expect((await post(app({ mock: true, hasKey: () => false }).api, '/api/series', sCfg())).status).toBe(201);
  });

  it('estimates a series (typical and worst case)', async () => {
    const { api } = app();
    const r = await post(api, '/api/estimate', sCfg());
    expect(r.status).toBe(200);
    const e = await r.json() as any;
    expect(e.typical.calls).toBeGreaterThan(0);
    expect(e.worst_case.est_cost_usd).toBeGreaterThan(e.typical.est_cost_usd);
    expect(e.over_cap_typical).toBe(false);
  });

  it('streams a snapshot then series events', async () => {
    await saveSeries(db, row('s2'));
    const { api, seriesHub } = app();
    const res = await api.request('/api/series/s2/events');
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const reader = res.body!.getReader(); const dec = new TextDecoder();
    let text = '';
    const read = async () => { const { value } = await reader.read(); text += dec.decode(value); };
    await read(); expect(text).toContain('event: snapshot');
    seriesHub.emit('s2', { event: 'status', data: { status: 'running' } });
    await read(); expect(text).toContain('event: status');
    await reader.cancel();
  });

  it('is read-only in public mode', async () => {
    const { api } = app({ mode: 'public', series: undefined, seriesHub: undefined });
    expect((await post(api, '/api/series', sCfg())).status).toBe(404);
    expect((await post(api, '/api/series/s1/start')).status).toBe(404);
    expect((await api.request('/api/series/s1/events')).status).toBe(404);
    expect((await api.request('/api/series')).status).toBe(200);
    expect((await api.request('/api/series/s1')).status).toBe(200);
  });
});
