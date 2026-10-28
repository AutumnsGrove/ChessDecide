import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

// Isolated D1 per run: migrate a fresh temp directory, then point the daemon and Vite at it.
const d1Dir = mkdtempSync(join(tmpdir(), 'chessdecide-e2e-'));
const d1Path = join(d1Dir, 'v3');
const daemonUrl = 'http://127.0.0.1:8731';
const webUrl = 'http://127.0.0.1:5273';
const migrate = `pnpm --filter @chessdecide/web exec wrangler d1 migrations apply DB --local --persist-to ${d1Dir}`;
const env = { ...process.env, CHESSDECIDE_MOCK: '1', CHESSDECIDE_D1_PATH: d1Path } as Record<string, string>;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: 'list',
  use: { baseURL: webUrl, trace: 'retain-on-failure' },
  projects: [
    { name: 'phone', use: { ...devices['Desktop Chrome'], viewport: { width: 400, height: 800 } } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
  ],
  webServer: [
    {
      command: `${migrate} && pnpm --filter @chessdecide/runner dev`,
      url: `${daemonUrl}/api/health`,
      timeout: 120_000,
      reuseExistingServer: false,
      env,
    },
    {
      command: 'pnpm --filter @chessdecide/web dev',
      url: `${webUrl}/games`,
      timeout: 120_000,
      reuseExistingServer: false,
      env,
    },
  ],
});
