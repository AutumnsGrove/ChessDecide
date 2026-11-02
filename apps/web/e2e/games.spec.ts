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
  await expect(row.locator('.chip')).toHaveText(/Won|Drew|Lost/);

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

const startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const item = (i: number, over: Record<string, unknown> = {}) => ({
  id: `G${String(i).padStart(25, '0')}`, status: 'finished', result: '0-1', termination: 'checkmate', adjudicated: false,
  white: { type: 'model', model: 'x/alpha', arm: 'hinted' }, black: { type: 'ladder', level: 'eps50' },
  series_id: 's1', series_index: i, level_id: 'eps50', level_elo: 614, model_color: 'white', model_score: 0,
  plies: 30 + i, cost_usd: 0.001, created_at: '2026-01-01T00:00:00Z', final_fen: startFen, ...over,
});
const stubBoard = { ladder: { version: 2, calibrated: true }, reference: [{ id: 'eps50', label: 'Stockfish 1320, 50% random', elo: 614 }],
  rows: [{ model: 'x/alpha', arm: 'hinted', arm_id: 'x/alpha#hinted' }, { model: 'y/beta', arm: 'clean', arm_id: 'y/beta#clean' }] };

/** Serve the browse endpoint from the request's own query, so URL state is what the test observes. */
async function stubBrowse(page: import('@playwright/test').Page, seen: string[] = [], total = 100) {
  await page.route('**/api/leaderboard', (r) => r.fulfill({ json: stubBoard }));
  await page.route('**/api/games/browse**', (r) => {
    const u = new URL(r.request().url());
    seen.push(u.search);
    const pg = Number(u.searchParams.get('page') ?? 1);
    const n = total === 0 ? 0 : Math.min(24, total - (pg - 1) * 24);
    return r.fulfill({ json: { total, page: pg, per: 24, tally: { w: 3, d: 1, l: total ? total - 4 : 0 }, items: Array.from({ length: Math.max(0, n) }, (_, i) => item(i + (pg - 1) * 24)) } });
  });
}

test('the list shows who played, the opponent and how it ended, with a thumbnail', async ({ page }) => {
  await stubBrowse(page);
  await page.goto('/games');
  const first = page.locator('a.game').first();
  await expect(first).toContainText('alpha');
  await expect(first).toContainText('hinted');
  await expect(first).toContainText('vs Stockfish 1320, 50% random');
  await expect(first).toContainText('Lost by checkmate');
  await expect(first.locator('.thumb cg-board')).toBeAttached();
  await expect(page.getByText('3 won')).toBeVisible();
});

test('filters are links that live in the URL, and a change asks the server', async ({ page }) => {
  const seen: string[] = [];
  await stubBrowse(page, seen);
  await page.goto('/games');
  // On a phone the filters start folded; open them the way a visitor would.
  await expect(page.locator('a.game').first()).toBeVisible();
  const fold = page.locator('summary', { hasText: 'Filters' });
  if (await fold.isVisible()) await fold.click();
  await page.getByRole('link', { name: 'Hinted', exact: true }).click();
  await expect(page).toHaveURL(/\/games\?arm=hinted$/);
  await page.getByRole('link', { name: 'Won', exact: true }).click();
  await expect(page).toHaveURL(/arm=hinted&outcome=won$/);
  expect(seen.at(-1)).toContain('outcome=won');
  await page.getByLabel('Sort').selectOption('new');
  await expect(page).toHaveURL(/sort=new/);
  await page.getByRole('link', { name: 'Clear filters' }).click();
  await expect(page).toHaveURL(/\/games$/);
});

test('paging walks the whole set and keeps the filters', async ({ page }) => {
  await stubBrowse(page, [], 60);
  await page.goto('/games?arm=hinted');
  await expect(page.getByText(/1 to 24 of 60 · page 1 of 3/)).toBeVisible();
  await expect(page.locator('.pager .off', { hasText: 'Previous' })).toBeVisible();
  await page.getByRole('link', { name: 'Next' }).click();
  await expect(page).toHaveURL(/arm=hinted&page=2$/);
  await expect(page.getByText(/25 to 48 of 60 · page 2 of 3/)).toBeVisible();
  await page.getByRole('link', { name: 'Next' }).click();
  await expect(page.getByText(/49 to 60 of 60/)).toBeVisible();
  await expect(page.locator('.pager .off', { hasText: 'Next' })).toBeVisible();
});

test('no matches gives a way out instead of an empty page', async ({ page }) => {
  await stubBrowse(page, [], 0);
  await page.goto('/games?model=nobody%2Fhome');
  await expect(page.getByText('No games match these filters.')).toBeVisible();
  await expect(page.locator('.empty').getByRole('link', { name: 'Clear filters' })).toBeVisible();
});

test('on a phone the filters fold away so a game is on the first screen', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'phone only');
  await stubBrowse(page);
  await page.goto('/games');
  await expect(page.locator('summary', { hasText: 'Filters' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Hinted', exact: true })).toBeHidden();
  const box = await page.locator('a.game').first().boundingBox();
  expect(box!.y + box!.height).toBeLessThanOrEqual(800);
  await page.locator('summary', { hasText: 'Filters' }).click();
  await expect(page.getByRole('link', { name: 'Hinted', exact: true })).toBeVisible();
});
