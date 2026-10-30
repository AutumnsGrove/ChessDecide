import { expect, test, type APIRequestContext } from '@playwright/test';

const seriesConfig = (over: Record<string, unknown> = {}) => ({
  model: 'typesafe/jev-1.14', arm: 'clean',
  size: { preset: 'custom', games: 8 },
  ladder: { mode: 'fixed', level: 'random' },
  seed: 5, budget_usd: 1, concurrency: 2, judge_depth: 6,
  ...over,
});

async function startSeries(request: APIRequestContext, over: Record<string, unknown> = {}) {
  const res = await request.post('/api/series', { data: seriesConfig(over) });
  expect(res.status()).toBe(201);
  const s = await res.json() as { id: string };
  expect((await request.post(`/api/series/${s.id}/start`)).ok()).toBe(true);
  return s;
}

async function waitStatus(request: APIRequestContext, id: string, status: string, timeout = 90_000) {
  await expect.poll(async () => (await (await request.get(`/api/series/${id}`)).json()).status, { timeout }).toBe(status);
}

test('start a series from the dialog and watch the rating form', async ({ page }) => {
  // Use the real dialog but make the series small and fast for the test.
  await page.route('**/api/series', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    const body = route.request().postDataJSON() as Record<string, unknown>;
    await route.continue({ postData: JSON.stringify({ ...body, size: { preset: 'custom', games: 8 }, ladder: { mode: 'fixed', level: 'random' }, judge_depth: 6 }) });
  });

  await page.goto('/series');
  await page.getByRole('button', { name: 'New series' }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Model', { exact: true })).toBeVisible();
  await expect(dialog.locator('.estimate')).toContainText(/games/);
  await dialog.getByRole('button', { name: 'Start series' }).click();

  await expect(page).toHaveURL(/\/series\/[0-9A-Z]+$/);
  await expect(page.locator('.rating .big')).toBeVisible({ timeout: 90_000 });
  await expect(page.locator('.head .chip')).toHaveText('finished', { timeout: 90_000 });
  await expect(page.locator('.strip .cell')).toHaveCount(8, { timeout: 90_000 });
  await expect(page.getByRole('link', { name: 'Download JSON' })).toHaveAttribute('href', /\/api\/series\/[0-9A-Z]+\/export\.json$/);
  await expect(page.getByRole('link', { name: 'Download CSV' })).toHaveAttribute('href', /\/api\/series\/[0-9A-Z]+\/export\.csv$/);
});

test('pause, resume and stop change the series status', async ({ page, request }) => {
  const s = await startSeries(request, { size: { preset: 'custom', games: 100 } });
  await page.goto(`/series/${s.id}`);
  await expect(page.locator('.viewer, .rating')).toBeVisible();

  await page.getByRole('button', { name: 'Pause' }).click();
  await waitStatus(request, s.id, 'paused');
  await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible();

  await page.getByRole('button', { name: 'Resume' }).click();
  await waitStatus(request, s.id, 'running');

  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(page.getByRole('button', { name: 'Confirm stop' })).toBeVisible();
  await page.getByRole('button', { name: 'Confirm stop' }).click();
  await waitStatus(request, s.id, 'aborted');
});

test('list shows series on the ladder axis and marks overlaps', async ({ page, request }) => {
  const a = await startSeries(request, { seed: 11, name: 'overlap-a' });
  const b = await startSeries(request, { seed: 12, name: 'overlap-b' });
  await waitStatus(request, a.id, 'finished');
  await waitStatus(request, b.id, 'finished');

  await page.goto('/series');
  await expect(page.getByText('overlap-a').first()).toBeVisible();
  await expect(page.getByText('overlap-b').first()).toBeVisible();
  expect(await page.locator('.axis .row').count()).toBeGreaterThanOrEqual(2);
  await expect(page.getByText('not separable yet').first()).toBeVisible();
});

test('400px series screens do not scroll horizontally', async ({ page, request }) => {
  const s = await startSeries(request);
  await waitStatus(request, s.id, 'finished');
  for (const path of ['/series', `/series/${s.id}`]) {
    await page.goto(path);
    await expect(page.locator('.page')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  }
});
