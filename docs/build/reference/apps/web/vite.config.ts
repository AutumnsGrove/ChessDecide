import { sveltekit } from '@sveltejs/kit/vite';
import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// Same local D1 state as `wrangler d1 migrations apply --persist-to ../../data/d1` and the runner CLI.
const d1State = process.env.CHESSDECIDE_D1_PATH ?? fileURLToPath(new URL('../../data/d1/v3', import.meta.url));

const daemon = process.env.CHESSDECIDE_DAEMON_URL ?? 'http://127.0.0.1:8787';
const publicMode = process.env.CHESSDECIDE_MODE === 'public';

export default defineConfig({
  // Local dev: the runner daemon (Node, native Stockfish) serves /api. Public mode: SvelteKit's own read-only route.
  server: { proxy: publicMode ? {} : { '/api': { target: daemon, changeOrigin: false } } },
  plugins: [
    sveltekit({
      preprocess: vitePreprocess(),
      adapter: adapter({ platformProxy: { configPath: 'wrangler.jsonc', persist: { path: d1State } } }),
    }),
  ],
});
