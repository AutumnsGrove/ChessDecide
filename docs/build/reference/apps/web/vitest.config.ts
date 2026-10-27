import { defineConfig } from 'vitest/config';
// Separate from vite.config.ts so unit tests do not load the SvelteKit/Cloudflare plugins.
export default defineConfig({ test: { include: ['test/**/*.test.ts'] } });
