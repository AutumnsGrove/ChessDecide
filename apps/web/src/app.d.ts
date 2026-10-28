import type { D1Database } from '@cloudflare/workers-types';

declare global {
  // Bindings from wrangler.jsonc, read via `import { env } from 'cloudflare:workers'`.
  namespace Cloudflare {
    interface Env {
      DB: D1Database;
      CHESSDECIDE_MODE?: 'local' | 'public' | 'live';
    }
  }
}
export {};
