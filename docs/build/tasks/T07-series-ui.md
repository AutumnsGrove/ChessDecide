# T07 — Series UI

**Goal:** start a series from the browser and watch its rating form. Phone-first, same tokens, raw CSS, hand-written SVG charts.
Reference visuals: `docs/mockups/series.html` and `series-list.html` (older, denser) and the Ratings tab of `docs/mockups/simple.html`.

## Files

`apps/web/src/routes/series/+page.svelte|+page.ts`, `apps/web/src/routes/series/[id]/+page.svelte|+page.ts`, `apps/web/src/lib/{NewSeriesDialog,EloChart,LadderAxis,GameStrip,SeriesCard}.svelte`,
`apps/web/src/lib/series-model.ts` (+ tests), `apps/web/e2e/series.spec.ts`, header nav gets `Series`.

## Screens

### `/series` (list, local and public)
- `LadderAxis`: horizontal Elo axis (0–3000, ticks at the ladder levels with labels), one 95 % bar per series (white tick = mean, label `Jev · clean 980 ±120`).
  A persistent amber notice when the ladder is uncalibrated.
- Cards per series: model, arm chip (`clean`/`hinted`/`image`), status chip, `games_done / target`, Elo `mean ± half-width`, cost. Tap → detail.
- "New series" button (hidden in public mode) → `NewSeriesDialog`: model, arm, size (Quick 25 · Standard 50 · To completion), ladder (Adaptive / Fixed level), budget (default 1.00),
  live estimate line (typical and worst case, red when over cap), Start → `POST /api/series` then `POST /api/series/:id/start` → navigate to the detail.

### `/series/[id]` (detail, live)
1. Header card: name, status chip, controls (Pause / Resume / Stop with confirm) in local mode.
2. **Rating card**: big `980 ±120`, `W-D-L`, score %, "95 % interval 860–1100", and the precision hint (`METRICS.md` B5). Never show the number without the interval.
   Uncalibrated notice if the ladder is uncalibrated.
3. `EloChart`: Elo mean line with interval band over games played, ladder level ticks on the y-axis, current opponent level highlighted (SVG, viewBox scaling, no library).
4. `GameStrip`: one small cell per game in play order coloured win/draw/loss (running = pulsing outline, aborted = hatched), tap opens `/games/:id`.
5. Blocks table: block, opponent level, games, score.
6. Secondary metrics card (from `secondary`): ACPL (mean/median), acceptable-move rate, mistake rate, blunder rate, score as White/Black, avg plies, cost per game, latency p50/p95.
   Each metric has a one-line plain-language label (see `series-model.ts` `METRIC_LABELS`), no jargon without a gloss.
7. Games table (cap 25 rows, "show all"), with result chip, level, colour, plies, cost.
8. While running: subscribe to `GET /api/series/:id/events`; update on `elo`, `game_finished`, `status`, `spend`; show up to 2 mini boards of the games in flight
   (each subscribes to its game SSE, read-only, tap opens the Viewer).

### Comparison rule
If two series' intervals overlap, the list shows "not separable yet" next to both and **never** a rank order.

## `series-model.ts` (pure, unit-tested)
`targetGames(size)`, `progressLabel(series)`, `intervalLabel(elo)` (`980 ±120`), `precisionHint(n)` (≈ ±136 at 25, ±96 at 50, ±68 at 100, ±48 at 200),
`overlap(a, b)`, `ladderAxisScale(width)`, `eloChartPoints(history, w, h)`, `blockRows(series)`, `METRIC_LABELS`.

## Playwright (`series.spec.ts`, mock mode, judge depth 6, custom size 8 games to stay fast)
1. Start a series from the dialog → detail page → games appear in the strip → rating card shows an interval → status `finished`.
2. Pause and Resume change the status; Stop ends it.
3. List shows the series on the ladder axis; two overlapping series show "not separable yet".
4. 400 px: no horizontal scroll on list and detail.

## Acceptance
`pnpm verify` + `pnpm e2e` green. Commit: `Add series screens`.
