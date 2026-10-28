import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { Game, GameConfig } from '@chessdecide/core';
import { listGames, loadGame, type Db } from '@chessdecide/db';
import type { EventHub } from './hub.ts';

export type Mode = 'local' | 'public' | 'live';

/** Present only where games can actually run (local daemon, phase-2 Worker). Absent in `public` mode. */
export interface ControlPlane {
  createGame(config: GameConfig): Promise<Game>;
  auto(id: string, paceMs?: number): Promise<void>;
  pause(id: string): Promise<void>;
  step(id: string): Promise<void>;
  stop(id: string): Promise<void>;
}

export interface ApiDeps { db: Db; mode: Mode; control?: ControlPlane; hub?: EventHub; version?: string }

const err = (code: string, message: string, retryable = false, detail: unknown = {}) => ({ error: { code, message, retryable, detail } });

export function createApi(deps: ApiDeps): Hono {
  const app = new Hono().basePath('/api');

  app.get('/health', (c) => c.json({ ok: true, mode: deps.mode, version: deps.version ?? '0.1.0', control: !!deps.control }));

  app.get('/games', async (c) => {
    const limit = Math.min(200, Math.max(1, Number(c.req.query('limit') ?? 50)));
    const rows = await listGames(deps.db, limit);
    return c.json(rows.map((g) => ({
      id: g.id, status: g.status, result: g.result, termination: g.termination, white: JSON.parse(g.white_player), black: JSON.parse(g.black_player),
      series_id: g.series_id, level_id: g.level_id, cost_usd: g.cost_usd, created_at: g.created_at,
    })));
  });

  app.get('/games/:id', async (c) => {
    const g = await loadGame(deps.db, c.req.param('id'));
    return g ? c.json(g) : c.json(err('not_found', 'game not found'), 404);
  });

  // Live events. On connect: a full `snapshot`, then hub events. Reconnecting clients simply get a fresh snapshot.
  app.get('/games/:id/events', async (c) => {
    if (!deps.hub) return c.json(err('not_available', 'live events are not available in this mode'), 404);
    const id = c.req.param('id');
    const g = await loadGame(deps.db, id);
    if (!g) return c.json(err('not_found', 'game not found'), 404);
    return streamSSE(c, async (stream) => {
      let seq = 0;
      const send = (event: string, data: unknown) => stream.writeSSE({ id: String(++seq), event, data: JSON.stringify(data) });
      const off = deps.hub!.subscribe(id, (e) => { void send(e.event, e.data); });
      stream.onAbort(off);
      await send('snapshot', g);
      while (!stream.aborted) { await stream.sleep(15_000); await stream.write(': ping\n\n'); }
      off();
    });
  });

  // ---- control (only when a ControlPlane exists) ----
  const needControl = (c: any) => (deps.control ? null : c.json(err('not_available', 'this deployment is read-only'), 404));

  app.post('/games', async (c) => {
    const no = needControl(c); if (no) return no;
    const config = (await c.req.json()) as GameConfig;
    return c.json(await deps.control!.createGame(config), 201);
  });
  for (const action of ['auto', 'pause', 'step', 'stop'] as const) {
    app.post(`/games/:id/${action}`, async (c) => {
      const no = needControl(c); if (no) return no;
      const id = c.req.param('id');
      if (!(await loadGame(deps.db, id))) return c.json(err('not_found', 'game not found'), 404);
      if (action === 'auto') { const b = await c.req.json().catch(() => ({})); await deps.control!.auto(id, (b as any).pace_ms); }
      else await deps.control![action](id);
      const g = (await loadGame(deps.db, id))!;
      return c.json({ id, status: g.status, status_reason: g.status_reason });
    });
  }

  app.notFound((c) => c.json(err('not_found', 'no such route'), 404));
  app.onError((e, c) => c.json(err('internal', e instanceof Error ? e.message : 'internal error'), 500));
  return app;
}
