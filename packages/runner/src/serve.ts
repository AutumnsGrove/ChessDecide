import { serve } from '@hono/node-server';
import { createApi, EventHub } from '@chessdecide/api';
import { LocalControlPlane, recoverGames } from './control.ts';
import { openLocalDb } from './d1.ts';
import { createRuntime } from './runtime.ts';

export async function startDaemon(opts: { port?: number; host?: string; mock?: boolean } = {}) {
  const host = opts.host ?? '127.0.0.1';
  if (!['127.0.0.1', 'localhost', '::1'].includes(host) && process.env.CHESSDECIDE_ALLOW_REMOTE !== '1')
    throw new Error('refusing to bind a non-loopback address (set CHESSDECIDE_ALLOW_REMOTE=1 to override)');
  const { db, close: closeDb } = await openLocalDb();
  const recovered = await recoverGames(db);
  const rt = await createRuntime();
  const hub = new EventHub();
  const control = new LocalControlPlane(rt, db, hub, opts.mock ?? process.env.CHESSDECIDE_MOCK === '1');
  const app = createApi({ db, mode: 'local', control, hub });
  const server = serve({ fetch: app.fetch, hostname: host, port: opts.port ?? 8731 });
  console.log(`chessdecide daemon on http://${host}:${opts.port ?? 8731} (recovered ${recovered} paused games)`);
  return { control, db, hub, close: async () => { server.close(); await rt.close(); await closeDb(); } };
}
