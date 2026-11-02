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

const modelRow = (model: string, arm: string, mean: number, hw = 100) => ({
  ...row(arm, mean, hw, []), arm_id: `${model}#${arm}`, model, series_id: `s-${model}-${arm}`,
});

test('the home page leads with champions and tiers, then the full table', async ({ page, request }) => {
  test.setTimeout(120_000);
  await finishedSeries(request, { arm: 'clean', seed: 21 });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Leaderboard' })).toBeVisible();
  await expect(page.getByLabel('Best arm in each condition')).toBeVisible();
  await expect(page.getByRole('heading', { name: /Tier 1/ })).toBeVisible();
  const table = page.locator('table');
  await expect(table.getByRole('columnheader', { name: /Elo/ })).toBeAttached();
  // Other specs may leave arms behind, so look for this one instead of assuming it is first.
  await expect(page.locator('tbody tr.arm', { hasText: 'jev-1.14' }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Download CSV' })).toHaveAttribute('href', '/api/leaderboard/export.csv');
});

test('ticking two rows opens a comparison with a probability and an Elo gap', async ({ page, request }) => {
  test.setTimeout(150_000);
  await finishedSeries(request, { arm: 'clean', seed: 31 });
  await finishedSeries(request, { arm: 'hinted', seed: 32 });

  await page.goto('/');
  const clean = page.locator('tbody tr.arm', { hasText: 'jev-1.14' }).filter({ hasText: 'clean' }).first();
  const hinted = page.locator('tbody tr.arm', { hasText: 'jev-1.14' }).filter({ hasText: 'hinted' }).first();
  await clean.scrollIntoViewIfNeeded();
  await clean.getByRole('checkbox').check();
  await hinted.getByRole('checkbox').check();
  await page.getByRole('link', { name: 'Compare', exact: true }).click();

  await expect(page).toHaveURL(/\/compare\?a=.*&b=/);
  await expect(page.locator('.sentence')).toContainText('stronger');
  await expect(page.locator('.gap')).toContainText('95 %');

  // Swapping the pair flips the probability.
  const before = await page.locator('.sentence').innerText();
  const [a, b] = await page.locator('select').evaluateAll((els) => els.map((e) => (e as HTMLSelectElement).value));
  await page.locator('select').nth(0).selectOption(b!);
  await page.locator('select').nth(1).selectOption(a!);
  await expect(page.locator('.sentence')).not.toHaveText(before);
});

test('overlapping arms land in one tier and are not ranked apart', async ({ page }) => {
  await page.route('**/api/leaderboard', async (route) => {
    await route.fulfill({ json: stubBoard([row('clean', 532, 160, []), row('hinted', 620, 150, [])]) });
  });
  await page.goto('/');
  await expect(page.locator('tbody tr.arm')).toHaveCount(2);
  await expect(page.getByRole('heading', { name: /Tier 1/ })).toContainText('2 of 2 arms');
  await expect(page.getByRole('heading', { name: /Tier 2/ })).toHaveCount(0);
});

test('separated arms fall into different tiers', async ({ page }) => {
  await page.route('**/api/leaderboard', async (route) => {
    await route.fulfill({ json: stubBoard([row('clean', 532, 90, ['typesafe/jev-1.14#hinted']), row('hinted', 980, 90, ['typesafe/jev-1.14#clean'])]) });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Tier 1/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Tier 2/ })).toBeVisible();
});

test('clean vs hinted is its own section, and a model page exists and links back', async ({ page }) => {
  await page.route('**/api/leaderboard', async (route) => {
    await route.fulfill({ json: stubBoard([modelRow('x/alpha', 'clean', 400), modelRow('x/alpha', 'hinted', 700), modelRow('y/beta', 'clean', 300), modelRow('y/beta', 'hinted', 650)]) });
  });
  await page.route('**/api/series/*', (route) => route.fulfill({ status: 404, json: { error: { code: 'not_found', message: 'x', retryable: false, detail: {} } } }));
  await page.goto('/');
  const section = page.locator('section', { has: page.getByRole('heading', { name: 'Clean vs hinted' }) });
  await expect(section.getByRole('link', { name: /alpha: clean .*hinted .*hints \+300 Elo/ })).toBeVisible();
  await section.getByRole('link', { name: /^alpha:/ }).click();
  await expect(page).toHaveURL(/\/models\/x\/alpha$/);
  await expect(page.getByRole('heading', { name: 'alpha' })).toBeVisible();
  await expect(page.getByText('Hints change its rating by')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Compare the two arms' })).toBeVisible();
});

test('a model with no rated arm is a 404, not a blank page', async ({ page }) => {
  await page.route('**/api/leaderboard', (route) => route.fulfill({ json: stubBoard([]) }));
  await page.goto('/models/nobody/home');
  await expect(page.getByText('No rated arm for nobody/home')).toBeVisible();
});

test('empty state and the uncalibrated notice', async ({ page }) => {
  await page.route('**/api/leaderboard', async (route) => {
    await route.fulfill({ json: stubBoard([], false) });
  });
  await page.goto('/');
  await expect(page.getByText('No finished series yet')).toBeVisible();
  await expect(page.locator('.notice')).toContainText('Ladder uncalibrated');
  await expect(page.locator('table')).toHaveCount(0);
});

test('400 px leaderboard and model pages do not scroll horizontally', async ({ page }) => {
  const many = Array.from({ length: 12 }, (_, i) => [modelRow(`p${i}/some-long-model-name-${i}`, 'clean', 300 + i * 20), modelRow(`p${i}/some-long-model-name-${i}`, 'hinted', 600 + i * 20)]).flat();
  await page.route('**/api/leaderboard', (route) => route.fulfill({ json: stubBoard(many) }));
  await page.route('**/api/series/*', (route) => route.fulfill({ status: 404, json: { error: { code: 'not_found', message: 'x', retryable: false, detail: {} } } }));
  for (const path of ['/', '/models', '/models/p3/some-long-model-name-3', '/paper']) {
    await page.goto(path);
    await expect(page.locator('h1').first()).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});

test('the first phone screen shows the top five arms', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'phone only');
  const many = Array.from({ length: 12 }, (_, i) => [modelRow(`p${i}/model-${i}`, 'clean', 300 + i * 20), modelRow(`p${i}/model-${i}`, 'hinted', 600 + i * 20)]).flat();
  await page.route('**/api/leaderboard', (route) => route.fulfill({ json: stubBoard(many) }));
  await page.goto('/');
  const tier = page.locator('section.tier').first();
  await expect(tier.locator('li')).toHaveCount(5);
  const last = await tier.locator('li').nth(4).boundingBox();
  expect(last!.y + last!.height).toBeLessThanOrEqual(800);
});

test('the paper tab shows the abstract, offers the PDF, and /method lands on its method section', async ({ page, request }) => {
  await page.goto('/paper');
  await expect(page.getByRole('heading', { name: /Benchmarking Decision Models at Chess/ })).toBeVisible();
  await expect(page.getByText('20 catalog models this way, 50 games per model per arm')).toBeVisible();
  const pdf = page.getByRole('link', { name: 'Download the paper (PDF)' });
  await expect(pdf).toHaveAttribute('href', '/chessdecide-benchmark-report.pdf');
  const res = await request.get('/chessdecide-benchmark-report.pdf');
  expect(res.status()).toBe(200);
  expect((await res.body()).subarray(0, 4).toString()).toBe('%PDF');
  await page.goto('/method');
  await expect(page).toHaveURL(/\/paper#method$/);
  await expect(page.getByRole('heading', { name: 'How the numbers are produced' })).toBeVisible();
});

test('the footer says what the site is and links the data, with no internal jargon', async ({ page }) => {
  await page.goto('/paper');
  const foot = page.locator('footer.foot');
  await expect(foot).toContainText('rates AI decision models at chess');
  await expect(foot).not.toContainText('template over a number');
  await expect(foot.getByRole('link', { name: 'GitHub', exact: true })).toHaveAttribute('href', 'https://github.com/AutumnsGrove/ChessDecide');
  for (const name of ['Paper', 'CSV', 'JSON', 'All series']) await expect(foot.getByRole('link', { name, exact: true })).toBeVisible();
});

test('the header links back to the repo on screens wide enough for it', async ({ page }, info) => {
  await page.goto('/paper');
  const gh = page.locator('header.top').getByRole('link', { name: 'ChessDecide on GitHub' });
  if (info.project.name === 'phone') { await expect(gh).toBeHidden(); return; }   // the footer link covers phones
  await expect(gh).toHaveAttribute('href', 'https://github.com/AutumnsGrove/ChessDecide');
  const box = await gh.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(40);
});
