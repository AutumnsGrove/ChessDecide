import { env } from 'cloudflare:workers';
import { drizzle } from 'drizzle-orm/d1';
import { createApi, type Mode } from '@chessdecide/api';
import * as schema from '@chessdecide/db/schema';
import type { RequestHandler } from './$types';

/**
 * Read-only API host (public mode, phase 1 deployment). Control routes are absent because no ControlPlane is passed.
 * In local development `vite dev` proxies /api to the runner daemon instead (see vite.config.ts).
 */
export const fallback: RequestHandler = ({ request }) => {
  const mode: Mode = (env.CHESSDECIDE_MODE as Mode | undefined) ?? 'public';
  return createApi({ db: drizzle(env.DB, { schema }), mode }).fetch(request);
};
