import { serve } from '@hono/node-server';
import type { GameEvent, SeriesEvent } from '@chessdecide/core';
import { createApi, EventHub } from '@chessdecide/api';
import { spendSince } from '@chessdecide/db';
import { LocalControlPlane, recoverGames } from './control.ts';
import { openLocalDb } from './d1.ts';
import { createRuntime, getCatalog } from './runtime.ts';
import { loadLadder } from './ladder.ts';
import { SeriesControlPlane, recoverSeries } from './series.ts';
import { dataDir, isMock, loadEnv, openRouterKey } from './config.ts';

export async function startDaemon(opts: { port?: number; host?: string; mock?: boolean } = {}) {
  loadEnv();
  const host = opts.host ?? '127.0.0.1';
  if (!['127.0.0.1', 'localhost', '::1'].includes(host) && process.env.CHESSDECIDE_ALLOW_REMOTE !== '1')
    throw new Error('refusing to bind a non-loopback address (set CHESSDECIDE_ALLOW_REMOTE=1 to override)');
  const sessionStart = new Date().toISOString();
  const mock = opts.mock ?? isMock();
  const { db, close: closeDb } = await openLocalDb();
  const recovered = await recoverGames(db);
  const recoveredSeries = await recoverSeries(db);
  const rt = await createRuntime();
  let engineVersion = 'unknown';
  try { engineVersion = (await rt.engines[0]?.version()) ?? 'unknown'; } catch { /* keep unknown */ }
  const hub = new EventHub<GameEvent>();
  const seriesHub = new EventHub<SeriesEvent>();
  const control = new LocalControlPlane(rt, db, hub, mock);
  const series = new SeriesControlPlane({ rt, db, hub: seriesHub, gameHub: hub, mock, ladder: () => loadLadder(dataDir()) });
  const app = createApi({
    db, mode: 'local', control, hub, series, seriesHub,
    catalog: getCatalog(),
    ladder: () => loadLadder(dataDir()),
    spend: (since) => spendSince(db, since),
    hasKey: () => !!openRouterKey(),
    mock, sessionStart,
    engine: { ok: rt.engines.length > 0, version: engineVersion },
  });
  const server = serve({ fetch: app.fetch, hostname: host, port: opts.port ?? 8731 });
  console.log(`chessdecide daemon on http://${host}:${opts.port ?? 8731} (recovered ${recovered} paused games, ${recoveredSeries} series, mock=${mock})`);
  return { control, series, db, hub, seriesHub, close: async () => { server.close(); await rt.close(); await closeDb(); } };
}
