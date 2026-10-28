import { expect, test, type APIRequestContext } from '@playwright/test';

/** Fast, deterministic-ish mock games for the specs: 12 plies, shallow judging, no pace. */
async function createFastGame(request: APIRequestContext, over: Record<string, unknown> = {}) {
  const config = {
    white: { type: 'model', model: 'typesafe/jev-1.14', arm: 'clean' },
    black: { type: 'ladder', level: 'random' },
    opening: { type: 'startpos' },
    pace_ms: 0, budget_usd: 1, judge_depth: 6, max_plies: 12, adjudicate: true, seed: 7,
    ...over,
  };
  const res = await request.post('/api/games', { data: config });
  expect(res.status()).toBe(201);
  const game = await res.json();
  expect((await request.post(`/api/games/${game.id}/auto`, { data: { pace_ms: 0 } })).ok()).toBe(true);
  return game as { id: string };
}

async function waitFinished(request: APIRequestContext, id: string) {
  await expect.poll(async () => {
    const g = await (await request.get(`/api/games/${id}`)).json();
    return g.status;
  }, { timeout: 60_000 }).toBe('finished');
}

test('create a game from the dialog and watch it finish', async ({ page }) => {
  // The dialog sends production defaults; rewrite the create call to fast test settings.
  await page.route('**/api/games', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    const body = route.request().postDataJSON() as Record<string, unknown>;
    await route.continue({ postData: JSON.stringify({ ...body, max_plies: 12, judge_depth: 6, pace_ms: 0 }) });
  });

  await page.goto('/games');
  await page.getByRole('button', { name: 'New game' }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Model', { exact: true })).toBeVisible();
  await expect(dialog.locator('.estimate')).toContainText(/model calls/);

  await dialog.getByLabel('Pace').selectOption('0');
  await dialog.getByRole('button', { name: 'Start game' }).click();

  await expect(page).toHaveURL(/\/games\/[0-9A-Z]+$/);
  await expect(page.locator('.caption .mv')).not.toHaveText('Start');
  await expect(page.locator('.stat').first()).toContainText(/Draw|Model won|Model lost/, { timeout: 60_000 });
});

test('estimate turns red over the cap and the server rejects the game', async ({ page }) => {
  await page.goto('/games');
  await page.getByRole('button', { name: 'New game' }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('.estimate')).toContainText(/≈ \$/);

  await dialog.getByLabel('Budget cap (USD)').fill('0.001');
  await expect(dialog.locator('.estimate')).toHaveClass(/over/);

  await dialog.getByRole('button', { name: 'Start game' }).click();
  await expect(page.locator('.banner.error')).toContainText(/exceeds your cap/);
});

test('list shows a finished game and opens the viewer', async ({ page, request }) => {
  const game = await createFastGame(request);
  await waitFinished(request, game.id);

  await page.goto('/games');
  const row = page.locator(`a[href="/games/${game.id}"]`);
  await expect(row).toBeVisible();
  await expect(row.locator('.chip')).toHaveText(/Draw|Model won|Model lost/);

  await row.click();
  await expect(page).toHaveURL(new RegExp(`/games/${game.id}$`));
  await expect(page.locator('.viewer')).toBeVisible();
});

test('header shows health chips and the uncalibrated ladder notice', async ({ page }) => {
  await page.goto('/games');
  const header = page.locator('header.top');
  await expect(header.locator('.chip', { hasText: 'OpenRouter' })).toBeVisible();
  await expect(header.locator('.chip', { hasText: 'Stockfish' })).toBeVisible();
  await expect(header.locator('.chip', { hasText: 'uncalibrated' })).toBeVisible();
});

test('phone layout does not scroll horizontally', async ({ page, request }) => {
  const game = await createFastGame(request);
  for (const path of ['/games', `/games/${game.id}`]) {
    await page.goto(path);
    await expect(page.locator('.page')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  }
});
