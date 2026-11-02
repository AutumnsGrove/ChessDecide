import { env, waitUntil } from 'cloudflare:workers';
import { drizzle } from 'drizzle-orm/d1';
import { createApi, type Mode } from '@chessdecide/api';
import * as schema from '@chessdecide/db/schema';
import type { RequestHandler } from './$types';

/** The only route worth an edge cache: identical for every visitor, changes only on a publish. */
const EDGE_CACHED = '/api/leaderboard';

/**
 * Read-only API host (public mode, phase 1 deployment). Control routes are absent because no ControlPlane is passed.
 * In local development `vite dev` proxies /api to the runner daemon instead (see vite.config.ts).
 */
export const fallback: RequestHandler = async ({ request }) => {
  const mode: Mode = (env.CHESSDECIDE_MODE as Mode | undefined) ?? 'public';
  const handle = () => createApi({ db: drizzle(env.DB, { schema }), mode }).fetch(request);
  const url = new URL(request.url);
  // `caches.default` only exists on the deployed Worker, so a missing cache just means "compute it".
  const edge = typeof caches !== 'undefined' ? (caches as unknown as { default?: Cache }).default : undefined;
  if (mode !== 'public' || request.method !== 'GET' || url.pathname !== EDGE_CACHED || !edge) return handle();

  const key = new Request(url.toString(), { method: 'GET' });
  const hit = await edge.match(key);
  if (hit) return hit;
  const res = await handle();
  if (res.status === 200) {
    const store = edge.put(key, res.clone());
    // Don't hold the response for the cache write; the runtime keeps the Worker alive until it lands.
    waitUntil(store);
  }
  return res;
};
