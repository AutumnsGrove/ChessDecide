import { expect, test, type APIRequestContext } from '@playwright/test';

const seriesConfig = (over: Record<string, unknown> = {}) => ({
  model: 'typesafe/jev-1.14', arm: 'clean',
  size: { preset: 'custom', games: 3 },
  ladder: { mode: 'fixed', level: 'random' },
  seed: 5, budget_usd: 1, concurrency: 2, judge_depth: 6,
  ...over,
});

/** Create and finish a tiny series so the leaderboard has a row (mock mode: no spend). */
async function finishedSeries(request: APIRequestContext, over: Record<string, unknown> = {}) {
  const res = await request.post('/api/series', { data: seriesConfig(over) });
  expect(res.status()).toBe(201);
  const s = await res.json() as { id: string };
  expect((await request.post(`/api/series/${s.id}/start`)).ok()).toBe(true);
  await expect.poll(async () => (await (await request.get(`/api/series/${s.id}`)).json()).status, { timeout: 90_000 }).toBe('finished');
  return s;
}

const stubBoard = (rows: unknown[], calibrated = true) => ({
  ladder: { version: 2, calibrated },
  rows,
  reference: [
    { id: 'random', label: 'Random mover', elo: 250 },
    { id: 'eps50', label: 'Stockfish 1320, 50% random', elo: 614 },
    { id: 'uci1320', label: 'Stockfish 1320', elo: 1320 },
  ],
});

const row = (arm: string, mean: number, hw: number, separated: string[]) => ({
  arm_id: `typesafe/jev-1.14#${arm}`, model: 'typesafe/jev-1.14', arm, series_id: `s-${arm}`, status: 'finished',
  games: 25,
  elo: { mean, lo: mean - hw, hi: mean + hw, half_width: hw, games: 25, w: 8, d: 2, l: 15, score_pct: 0.36 },
  w: 8, d: 2, l: 15, score_pct: 0.36, acpl: 231.5, acceptable_rate: 0.762, blunder_rate: 0.196,
  cost_usd: 0.0299, cost_per_game: 0.0012, separated_from: separated,
});

test('the home page is the leaderboard, with finished arms on the axis and in the table', async ({ page, request }) => {
  test.setTimeout(120_000);
  await finishedSeries(request, { arm: 'clean', seed: 21 });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Leaderboard' })).toBeVisible();
  const table = page.locator('table');
  await expect(table.getByRole('columnheader', { name: 'Elo' })).toBeVisible();
  // Other specs may leave arms behind, so look for this one instead of assuming it is first.
  await expect(page.locator('tbody tr.arm', { hasText: 'jev-1.14 · clean' }).first()).toBeVisible();
  await expect(page.locator('.axis .row').first()).toBeVisible();
  await expect(page.getByText('Elo on the ChessDecide ladder').first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Download CSV' })).toHaveAttribute('href', '/api/leaderboard/export.csv');
});

test('two arms get a comparison with a probability and an Elo gap', async ({ page, request }) => {
  test.setTimeout(150_000);
  await finishedSeries(request, { arm: 'clean', seed: 31 });
  await finishedSeries(request, { arm: 'hinted', seed: 32 });

  await page.goto('/');
  const clean = page.locator('tbody tr.arm', { hasText: 'jev-1.14 · clean' }).first();
  const hinted = page.locator('tbody tr.arm', { hasText: 'jev-1.14 · hinted' }).first();
  await expect(clean).toBeVisible();
  await expect(hinted).toBeVisible();

  const box = page.locator('section', { hasText: 'Compare two arms' });
  const selects = box.locator('select');
  await expect(selects).toHaveCount(2);
  await expect(box.locator('.sentence')).toContainText('stronger');
  await expect(box.locator('.gap')).toContainText('95 %');

  // Swapping the pair flips the probability.
  const before = await box.locator('.sentence').innerText();
  await selects.nth(0).selectOption('typesafe/jev-1.14#hinted');
  await selects.nth(1).selectOption('typesafe/jev-1.14#clean');
  await expect(box.locator('.sentence')).not.toHaveText(before);
});

test('overlapping arms say "not separable yet" and get an ≈ marker', async ({ page }) => {
  await page.route('**/api/leaderboard', async (route) => {
    if (route.request().url().includes('/compare')) return route.continue();
    await route.fulfill({ json: stubBoard([row('clean', 532, 160, []), row('hinted', 620, 150, [])]) });
  });
  await page.goto('/');
  await expect(page.locator('tbody tr.arm')).toHaveCount(2);
  await expect(page.locator('.notsep')).toContainText('Not separable yet');
  await expect(page.locator('tbody .approx')).toHaveCount(2);
  await expect(page.locator('.notsep li')).toHaveCount(1);
});

test('separated arms name who they are apart from', async ({ page }) => {
  await page.route('**/api/leaderboard', async (route) => {
    if (route.request().url().includes('/compare')) return route.continue();
    await route.fulfill({ json: stubBoard([row('clean', 532, 90, ['typesafe/jev-1.14#hinted']), row('hinted', 980, 90, ['typesafe/jev-1.14#clean'])]) });
  });
  await page.goto('/');
  const details = page.locator('tbody tr.detail');
  await expect(details.first()).toContainText('separated from jev-1.14 · hinted');
  await expect(details.nth(1)).toContainText('separated from jev-1.14 · clean');
  await expect(page.locator('.notsep')).toHaveCount(0);
});

test('empty state and the uncalibrated notice', async ({ page }) => {
  await page.route('**/api/leaderboard', async (route) => {
    if (route.request().url().includes('/compare')) return route.continue();
    await route.fulfill({ json: stubBoard([], false) });
  });
  await page.goto('/');
  await expect(page.getByText('No finished series yet')).toBeVisible();
  await expect(page.locator('.notice')).toContainText('Ladder uncalibrated');
  await expect(page.locator('table')).toHaveCount(0);
});

test('400 px leaderboard does not scroll horizontally', async ({ page }) => {
  await page.route('**/api/leaderboard', async (route) => {
    if (route.request().url().includes('/compare')) return route.continue();
    await route.fulfill({ json: stubBoard([row('clean', 532, 160, []), row('hinted', 620, 150, [])]) });
  });
  await page.goto('/');
  await expect(page.locator('tbody tr.arm').first()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
