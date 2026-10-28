import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { DEFAULT_LADDER, type Game, type GameConfig, type LadderFile } from '@chessdecide/core';
import { estimateGame, type ModelInfo } from '@chessdecide/providers';
import { listGames, loadGame, type Db } from '@chessdecide/db';
import type { EventHub } from './hub.ts';
import { ApiError } from './errors.ts';

export type Mode = 'local' | 'public' | 'live';

/** Present only where games can actually run (local daemon, phase-2 Worker). Absent in `public` mode. */
export interface ControlPlane {
  createGame(config: GameConfig): Promise<Game>;
  auto(id: string, paceMs?: number): Promise<void>;
  pause(id: string): Promise<void>;
  step(id: string): Promise<void>;
  stop(id: string): Promise<void>;
}

export interface ApiDeps {
  db: Db; mode: Mode; control?: ControlPlane; hub?: EventHub; version?: string;
  /** Local-only capabilities; absent in `public` mode (the routes then answer 404 `not_available`). */
  catalog?: { list(): Promise<ModelInfo[]> };
  ladder?: () => LadderFile;
  spend?: (since?: string) => Promise<{ usd: number; calls: number; cache_hits: number }>;
  hasKey?: () => boolean;
  mock?: boolean;
  sessionStart?: string;                                  // ISO; start of the daemon process
  engine?: { ok: boolean; version?: string };
}

const err = (code: string, message: string, retryable = false, detail: unknown = {}) => ({ error: { code, message, retryable, detail } });

const MODEL_TYPES = ['model', 'ladder', 'engine'];

function validateGameConfig(config: unknown): asserts config is GameConfig {
  const c = config as Record<string, any>;
  if (!c || typeof c !== 'object' || Array.isArray(c)) throw new ApiError('invalid_config', 'body must be a game config');
  for (const side of ['white', 'black'] as const) {
    const p = c[side];
    if (!p || typeof p !== 'object' || !MODEL_TYPES.includes(p.type)) throw new ApiError('invalid_config', `${side} player is missing or invalid`);
    if (p.type === 'model' && (typeof p.model !== 'string' || !p.model || !p.arm)) throw new ApiError('invalid_config', `${side} model player needs model and arm`);
    if (p.type === 'ladder' && typeof p.level !== 'string') throw new ApiError('invalid_config', `${side} ladder player needs a level`);
  }
  if (!c.opening || typeof c.opening !== 'object' || typeof c.opening.type !== 'string') throw new ApiError('invalid_config', 'opening is missing or invalid');
  if (!Number.isInteger(c.max_plies) || c.max_plies < 10 || c.max_plies > 400) throw new ApiError('invalid_config', 'max_plies must be an integer in 10..400');
  if (typeof c.budget_usd !== 'number' || !(c.budget_usd >= 0.001 && c.budget_usd <= 50)) throw new ApiError('invalid_config', 'budget_usd must be in 0.001..50');
  if (!Number.isInteger(c.judge_depth) || c.judge_depth < 6 || c.judge_depth > 20) throw new ApiError('invalid_config', 'judge_depth must be an integer in 6..20');
}

export function createApi(deps: ApiDeps): Hono {
  const app = new Hono().basePath('/api');

  const notAvailable = (c: any) => c.json(err('not_available', 'this deployment is read-only'), 404);

  /** Catalog fetch failures are upstream errors (502), never 500s. */
  async function catalogList(): Promise<ModelInfo[]> {
    try { return await deps.catalog!.list(); }
    catch (e) { throw new ApiError('upstream_error', e instanceof Error ? e.message : 'model catalog unavailable', 502); }
  }

  app.get('/health', async (c) => {
    const ladder = deps.ladder?.() ?? DEFAULT_LADDER;
    let budget = { session_usd: 0, today_usd: 0, total_usd: 0 };
    if (deps.spend) {
      const zero = { usd: 0, calls: 0, cache_hits: 0 };
      const today = new Date(); today.setUTCHours(0, 0, 0, 0);
      const [s, t, a] = await Promise.all([
        deps.sessionStart ? deps.spend(deps.sessionStart) : Promise.resolve(zero),
        deps.spend(today.toISOString()),
        deps.spend(),
      ]);
      budget = { session_usd: s.usd, today_usd: t.usd, total_usd: a.usd };
    }
    return c.json({
      ok: true, mode: deps.mode, version: deps.version ?? '0.1.0', control: !!deps.control, mock: deps.mock ?? false,
      engine: { ok: deps.engine?.ok ?? false, version: deps.engine?.version ?? 'unknown' },
      openrouter: { key_present: deps.hasKey?.() ?? false },
      ladder: { version: ladder.version, calibrated: ladder.calibrated },
      budget,
    });
  });

  app.get('/models', async (c) => {
    if (!deps.catalog) return notAvailable(c);
    return c.json(await catalogList());
  });

  app.post('/estimate', async (c) => {
    if (!deps.catalog) return notAvailable(c);
    const config = (await c.req.json().catch(() => { throw new ApiError('bad_request', 'invalid JSON body'); })) as GameConfig;
    const models = await catalogList();
    try { return c.json(estimateGame(config, models)); }
    catch (e) {
      if (e instanceof Error && e.message === 'unknown model') throw new ApiError('invalid_config', 'unknown model');
      throw e;
    }
  });

  app.get('/spend', async (c) => {
    if (!deps.spend) return notAvailable(c);
    const since = c.req.query('since') ?? 'all';
    let iso: string | undefined;
    if (since === 'session') iso = deps.sessionStart;
    else if (since === 'today') { const d = new Date(); d.setUTCHours(0, 0, 0, 0); iso = d.toISOString(); }
    else if (since !== 'all') throw new ApiError('bad_request', 'since must be session, today or all');
    return c.json(await deps.spend(iso));
  });

  app.get('/ladder', (c) => {
    if (!deps.ladder) return notAvailable(c);
    return c.json(deps.ladder());
  });

  app.get('/games', async (c) => {
    const limit = Math.min(200, Math.max(1, Number(c.req.query('limit') ?? 50)));
    const rows = await listGames(deps.db, limit);
    return c.json(rows.map((g) => ({
      id: g.id, status: g.status, result: g.result, termination: g.termination, white: JSON.parse(g.white_player), black: JSON.parse(g.black_player),
      series_id: g.series_id, level_id: g.level_id, cost_usd: g.cost_usd, created_at: g.created_at, plies: g.plies,
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
    const config = await c.req.json().catch(() => { throw new ApiError('bad_request', 'invalid JSON body'); });
    validateGameConfig(config);
    const modelDescs = [config.white, config.black].filter((p) => p.type === 'model');
    if (deps.catalog) {
      const models = await catalogList();
      for (const d of modelDescs) if (!models.some((m) => m.slug === d.model)) throw new ApiError('invalid_config', `unknown model ${d.model}`);
      if (!deps.mock && modelDescs.length > 0 && !(deps.hasKey?.() ?? false)) throw new ApiError('no_api_key', 'OPENROUTER_API_KEY is not set', 424);
      const estimate = estimateGame(config, models);
      if (estimate.over_cap) throw new ApiError('budget_exceeded', `Estimated $${estimate.est_cost_usd.toFixed(4)} exceeds cap $${estimate.cap_usd}`, 402, { est_cost_usd: estimate.est_cost_usd });
    }
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
  app.onError((e, c) => {
    if (e instanceof ApiError) return c.json(err(e.code, e.message, e.retryable, e.detail), e.status as any);
    return c.json(err('internal', e instanceof Error ? e.message : 'internal error'), 500);
  });
  return app;
}
