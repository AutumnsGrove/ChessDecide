import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

/** Start a mock game through the API. 12 plies by default so tests stay fast. */
async function startGame(request: APIRequestContext, over: Record<string, unknown> = {}) {
  const config = {
    white: { type: 'model', model: 'typesafe/jev-1.14', arm: 'clean' },
    black: { type: 'ladder', level: 'random' },
    opening: { type: 'startpos' },
    pace_ms: 0, budget_usd: 1, judge_depth: 6, max_plies: 12, adjudicate: true, seed: 11,
    ...over,
  };
  const res = await request.post('/api/games', { data: config });
  expect(res.status()).toBe(201);
  const game = await res.json();
  expect((await request.post(`/api/games/${game.id}/auto`, { data: { pace_ms: config.pace_ms } })).ok()).toBe(true);
  return game as { id: string };
}

async function waitFinished(request: APIRequestContext, id: string) {
  await expect.poll(async () => (await (await request.get(`/api/games/${id}`)).json()).status, { timeout: 60_000 }).toBe('finished');
}

async function openFinished(request: APIRequestContext, page: Page) {
  const game = await startGame(request);
  await waitFinished(request, game.id);
  await page.goto(`/games/${game.id}`);
  await expect(page.locator('.viewer')).toBeVisible();
  return game;
}

const moveLabel = (page: Page) => page.locator('.lab');

test('replay keys step through the game and Space autoplays', async ({ page, request }) => {
  const game = await openFinished(request, page);
  await expect(moveLabel(page)).toContainText('Move 0 of 6');
  await expect(page.getByRole('link', { name: 'Download PGN' })).toHaveAttribute('href', `/api/games/${game.id}/pgn`);

  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
  await expect(moveLabel(page)).toContainText('Move 3 of 6');

  await page.keyboard.press('Home');
  await expect(moveLabel(page)).toContainText('Move 0 of 6');

  await page.keyboard.press('End');
  await expect(moveLabel(page)).toContainText('Move 6 of 6');

  await page.keyboard.press(' ');
  await expect(moveLabel(page)).toContainText('Move 6 of 6', { timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible({ timeout: 30_000 });
});

test('clicking the eval graph seeks to that ply', async ({ page, request }) => {
  await openFinished(request, page);
  const svg = page.locator('.graph svg');
  await svg.scrollIntoViewIfNeeded();
  const box = (await svg.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(moveLabel(page)).toContainText('Move 3 of 6');
});

test('live: left arrow detaches, the pill grows, clicking it follows again', async ({ page, request }) => {
  const game = await startGame(request, { pace_ms: 300 });
  await page.goto(`/games/${game.id}`);
  await expect(page.locator('.viewer')).toBeVisible();
  await expect(page.locator('.caption .mv')).not.toHaveText('Start');

  await page.keyboard.press('ArrowLeft');
  const pill = page.locator('.pill');
  await expect(pill).toBeVisible();
  const first = (await pill.textContent()) ?? '';
  await expect.poll(async () => (await pill.textContent()) ?? '', { timeout: 20_000 }).not.toBe(first);

  await pill.click();
  await expect(pill).toHaveCount(0);
});

test('pause, resume and stop change the game status', async ({ page, request }) => {
  const game = await startGame(request, { pace_ms: 300 });
  await page.goto(`/games/${game.id}`);
  const status = async () => (await (await request.get(`/api/games/${game.id}`)).json()).status;

  await page.getByRole('button', { name: 'Pause' }).click();
  await expect.poll(status, { timeout: 20_000 }).toBe('paused');
  await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Step' })).toBeVisible();

  await page.getByRole('button', { name: 'Resume' }).click();
  await expect.poll(status, { timeout: 20_000 }).toBe('running');

  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(page.getByRole('button', { name: 'Confirm stop' })).toBeVisible();
  await page.getByRole('button', { name: 'Confirm stop' }).click();
  await expect.poll(status, { timeout: 20_000 }).toBe('aborted');
});

test('decision panel explains the model pick', async ({ page, request }) => {
  await openFinished(request, page);
  await page.keyboard.press('ArrowRight');

  const panel = page.locator('details.dp');
  await expect(panel).toBeVisible();
  await panel.locator('summary').click();

  await expect(panel.locator('.row').first()).toBeVisible();
  await expect(panel.locator('.row.pick')).toBeVisible();
  await expect(panel.locator('.star').first()).toBeVisible();

  const percentages = (await panel.locator('.p').allTextContents()).map((t) => parseFloat(t));
  expect(percentages.length).toBeGreaterThan(0);
  expect(percentages.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(105);
});

test('400px viewer screenshot for review', async ({ page, request }) => {
  await openFinished(request, page);
  await page.setViewportSize({ width: 400, height: 800 });
  await page.keyboard.press('End');
  await page.keyboard.press('ArrowLeft');
  const panel = page.locator('details.dp');
  if (await panel.count()) await panel.locator('summary').click();
  await page.waitForTimeout(300);

  const dir = fileURLToPath(new URL('./__screens__/', import.meta.url));
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: join(dir, 'viewer-400.png'), fullPage: true });
});
