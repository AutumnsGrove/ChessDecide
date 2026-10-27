import { getPlatformProxy } from 'wrangler';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '@chessdecide/db/schema';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));

/** Opens the same local D1 that `wrangler dev` uses (persist path <repo>/data/d1). */
export async function openLocalDb() {
  const proxy = await getPlatformProxy<{ DB: D1Database }>({
    configPath: root + 'apps/web/wrangler.jsonc',
    persist: { path: process.env.CHESSDECIDE_D1_PATH ?? root + 'data/d1/v3' },   // wrangler CLI nests state under v3; the proxy does not,
  });
  return { db: drizzle(proxy.env.DB, { schema }), raw: proxy.env.DB, close: () => proxy.dispose() };
}
