import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/d1';
import { getPlatformProxy } from 'wrangler';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { START_FEN, type Game } from '@chessdecide/core';
import * as schema from '@chessdecide/db/schema';
import { saveGame, savePly, type Db } from '@chessdecide/db';
import { createApi, EventHub } from '../src/index.ts';

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
    expect((await app.request('/api/games', { method: 'POST', body: JSON.stringify({}) })).status).toBe(201);
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
