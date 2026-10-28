# Changelog

## T06 — Series runner, store and API

- `packages/core/src/series-events.ts`: `SeriesConfig`, `Series`, `SeriesGame`, `Block`, `EloPoint`,
  `SeriesEvent` and `SeriesSummary` (API.md §3.3). `EventHub` is now generic; game and series feeds are
  separate instances.
- `packages/db/src/series-store.ts`: `saveSeries`, `loadSeriesRow`, `listSeriesRows`, `seriesGames`
  (paused/ready count as in-flight), `setGameSeriesFields`, `buildSeries` (games, blocks, posterior
  before/after, Elo history, `seriesStats`) and `seriesSummaries`. Migration `0002_harsh_tarantula.sql`
  adds `series.concurrency` and `series.judge_depth`.
- `packages/runner/src/series.ts`: `SeriesControlPlane` — create/start/pause/stop/idle; `nextAction`
  loop with a per-series task pool (≤ concurrency, max 2), seeded openings cached by index (paired games
  share a FEN), `game_started`/`block`/`game_finished`/`elo`/`spend`/`status` events, per-game budget =
  remaining series cap, transport retries (3) then abort, budget stop + resume, `recoverSeries` at
  startup, and immutable finished series. `serve.ts` wires the series plane and its hub.
- `packages/providers/src/estimate-series.ts`: typical/worst-case series estimate; `POST /api/estimate`
  now detects a `size` field and returns `{typical, worst_case, over_cap_typical, over_cap_worst}`.
- `packages/api`: `POST /api/series` (validation, 402/424/400), `GET /api/series`, `GET /api/series/:id`,
  `GET /api/series/:id/games`, `GET /api/series/:id/events` (SSE), and `start|pause|stop|resume` actions.
  Public mode keeps the three GET routes and hides controls/events.
- Tests: core 57, db 8 (+series store), api 18 (+5 series API), runner 18 (+8 control plane). Series
  tests use a fake judge that is always +10 for White, so games adjudicate at ply 30 instead of 200.
- `pnpm verify` and `pnpm e2e` (22) green. E2E now points `CHESSDECIDE_DATA` at a temp dir so the
  calibrated ladder does not change the header assertion.
- Deviations: `series.concurrency`/`judge_depth` were not in the original schema, so migration 0002 adds
  them; `stop` also aborts a game that was launched while the stop was in flight.

## T05 — Ladder calibration job

- `packages/core/src/ladder-warnings.ts`: warnings for uci gaps > 100 Elo off nominal and for measured
  Elo that is not strictly increasing in nominal order (+ table tests).
- `packages/db/src/ladder-store.ts`: `saveLadderLevels`, `loadLadderLevels`, `addLadderGame`,
  `ladderGameCount`, `ladderGameIndexes`, `clearLadderGames`, `scoreFor`, `loadCalibrationGames`.
  Migration `0001_same_umar.sql` adds `ladder_games.game_index` (needed for exact resume).
- `packages/runner/src/ladder.ts`: `loadLadder` (highest valid `data/ladder/ladder-vN.json`, corrupt files
  warned and skipped), `nextLadderVersion`, and `calibrate`: 100 seeded depth-10 openings, all
  `calibrationPairs`, `--workers` game pool, per-game engines closed after the game, rows written as
  games finish, ETA after the first 20, exact `--resume` by `game_index`, `fitLadder` with the `uci1320`
  anchor, JSON file + `ladder_levels` rows, printed table and warnings.
- `pnpm cli ladder calibrate [--games-per-pair 200] [--workers 4] [--movetime 50] [--seed 1] [--resume]`;
  refuses while a game is `running`. `GET /api/ladder` and `/api/health` now read the calibrated file
  through `loadLadder(dataDir())` instead of always returning `DEFAULT_LADDER`.
- Tests: core 57 (+4 warnings), db 6 (+3 ladder store), runner 10 (+4 calibration, including a real
  Stockfish pair at 20 ms). `pnpm verify` green.
- **Full run (2026-10-28):** 4,200 games in **2 h 6 m** (1.81 s/game), 50 ms, 4 workers, Stockfish 19.
  Measured (nominal → measured ± se): random 250 → 160 ± 26; eps75 560 → 391 ± 19; eps50 790 → 614 ± 18;
  eps30 980 → 819 ± 18; eps15 1150 → 1037 ± 19; uci1320 1320 (anchor); uci1500 1500 → 1583 ± 17;
  uci1700 1700 → 1744 ± 15; uci1900 1900 → 1879 ± 15; uci2100 2100 → 2016 ± 17; uci2400 2400 → 2250 ± 21;
  uci2800 2800 → 2669 ± 39. No `ladderWarnings`. Wrote `data/ladder/ladder-v2.json`; full table in
  `docs/SPIKE.md` §9.

## T04 — First real game (checkpoint)

- Fixed `loadEnv()` to resolve the repo-root `.env` (pnpm runs the CLI from `packages/runner`, so the
  cwd default missed it); added `packages/runner/test/config.test.ts`.
- Probe (`typesafe/jev-1.14`, clean, startpos): e4 at p 0.89, 704 ms, 769 in / 220 out tokens,
  $0.000032, 778-byte request, 0 retries.
- One real game via the New game dialog, Jev White vs `eps75`, Watch pace, cap $0.05, `max_plies` 120
  for the checkpoint: **1-0 checkmate** (`Qxf7#`, ply 21), 11 model calls, 0 forced, 0 retries,
  **$0.000544782**, ≈ 71 s wall clock, avg 430 ms and 1,179 input tokens per call.
- Quality (depth 14): ACPL 198.2 cp, acceptable 81.8 %, 0 inaccuracies, 0 mistakes, 1 blunder
  (ply 7 `Nxd4`, cpl 132; still winning). Large raw CPLs later are slower mates in a won position.
- Estimate $0.00294 vs actual $0.000545 (440 % conservative); rolling mean will tighten it.
- Report + 400 px start/mid/end screenshots + raw game JSON in `docs/build/reports/T04-*`.
- No illegal moves, no `invalid_choice`, no 429s. Recommendation: continue to T05/T06.
- Extra game before calibration (requested): Jev vs `eps30` — 1-0 adjudicated, 35 plies, 16 real calls
  + 2 cache hits, $0.000711, ≈ 62 s, ACPL 198.2, acceptable 88.9 %, 2 blunders, 0 errors. Combined T04
  spend $0.001288; raw data and screenshots in `docs/build/reports/T04b-*`.

## T03 — Viewer extras: decision panel, live controls, e2e

- `viewer-model.ts`: `decisionRows(ply)` (up to 9 rows, sorted by P, pick and Stockfish best always
  included, best synthesized when the annotator did not append it) and `cplTone` (0 = best, ≤ 0.2 pawns
  neutral, then inaccuracy/mistake/blunder). Unit tests for sorting, inclusion, tones and hidden states.
- `DecisionPanel.svelte`: collapsed `<details>` below the status card; SAN · probability bar · P ·
  Stockfish-loss chip, picked row outlined, ★ on the best move, footer with confidence, options, cost,
  latency, model and `Cached`. Forced plies say "Only one legal move: no model call"; engine and unjudged
  plies hide it.
- `LiveControls.svelte`: Pause when running; Resume + Step when paused/ready; Stop with an inline
  3 s "Confirm stop". Pending requests disable the buttons; failures become banners. Status follows the
  SSE `status` events through the parent's reactive game object.
- `Viewer.svelte`: shows a paused banner with the reason and a budget-stop hint, places the live controls
  under the player bar, and renders the decision panel for the shown ply. Spend refresh already wired in T02.
- `apps/web/e2e/viewer.spec.ts`: replay keys + Space autoplay, graph seek, live detach/pill/re-attach,
  pause/resume/stop against the API, decision panel (rows, pick, ★, probabilities ≤ 100 %), and a 400 px
  screenshot at `apps/web/e2e/__screens__/viewer-400.png` (committed for review, not asserted).
- Tests: `pnpm verify` green (web unit 8); `pnpm e2e` 22 passed (11 tests × 2 viewports).

## T02 — Web: New game, spend chip, banners, Playwright

- `apps/web/src/lib/api.ts`: typed fetch helpers (`getJson`, `postJson`) with `ApiClientError` from the
  error envelope; wrappers for games, models, estimate, spend, health and ladder.
- `stores.svelte.ts`: rune store for health, session spend, the New game dialog flag and global banners;
  `refreshSpend()` is called from the Viewer's SSE handlers.
- Header (`+layout.svelte`): nav, OpenRouter/Stockfish/ladder chips (amber when the ladder is
  uncalibrated), session `SpendChip` (10 s poll + event refresh), New game button. All local-only
  controls and chips are hidden when `health.control === false` (public read-only mode).
- `NewGameDialog.svelte`: native `<dialog>`, roster-first model select with disabled reasons, arm /
  opponent / colour / opening / pace / budget fields, debounced live estimate (red over cap), Start
  posts the game, auto-starts it and navigates to the Viewer. 402/424/400 errors become banners.
  Random colour and the seed use `crypto.getRandomValues`.
- `Banner.svelte` (info/warn/error, dismissible, `role=status|alert`).
- Games list: result chips, model/opponent, plies, cost, time ago, 5 s polling, empty state with a
  New game button.
- `GET /api/games` now includes `plies` (counted in `listGames`) for the list row.
- Playwright: `playwright.config.ts` migrates a fresh temp D1, starts the mock daemon and Vite, and runs
  the five specs at 400×800 and 1280×800. Root script `pnpm e2e`; not part of `pnpm verify`.
  `apps/web/test-results/` is gitignored.
- Fix found by e2e: the budget input used `min=0.001` with `step=0.01`, so the default `1` failed native
  step validation and the form never submitted. Now `step="any"`.
- Deviation: the "Mock model" checkbox is informational and shown checked+disabled, because mock mode is
  a daemon-wide flag (`CHESSDECIDE_MOCK=1`), not a per-game setting. Specs rewrite the create body to
  `max_plies 12`, `judge_depth 6`, `pace_ms 0` via route interception so games finish quickly.
- `app.html` wraps `%sveltekit.body%` in a div (silences the SvelteKit 3 `app_body_unwrapped` warning).
- Tests: `pnpm verify` green (api 13, providers 25, db 3, runner 3+1 skipped, web 5); `pnpm e2e` 10 passed
  (5 specs × 2 viewports).

## T01 — Real model wiring, catalog, estimate, probe

- `packages/providers/src/catalog.ts`: cached OpenRouter Decisions catalog (public, no key); roster-first sort,
  per-million input price, `disabled_reason` for tiny contexts / no text input. Fixture copied to
  `packages/providers/test/fixtures/` (32 models).
- `packages/providers/src/estimate.ts`: typical (≤ 40 calls) and worst-case game cost, image arm +600 input
  tokens per call, both-model sides priced separately. Unknown slug throws `unknown model`.
- `packages/runner/src/runtime.ts`: real `ModelPlayer`s (one shared `DecisionsClient` and catalog per process),
  per-model rolling-mean input tokens, combined budget port for two model sides, `ApiError` for unknown model /
  missing key / image arm. Mock mode still uses `MockPlayer`.
- `packages/runner/src/config.ts`: dependency-free `.env` loader (`loadEnv`), `openRouterKey`, `isMock`.
- `packages/api`: `ApiError` + error mapping, `GET /api/models`, `POST /api/estimate`, `GET /api/spend`,
  `GET /api/ladder`, extended `GET /api/health`, and `POST /api/games` validation (ranges, unknown model,
  424 no key, 402 over cap with `detail.est_cost_usd`). Catalog failures map to 502 `upstream_error`.
  `@chessdecide/providers` added as a workspace dependency.
- `packages/db`: `meanInputTokens(db, model, arm)` — last 100 real ok attempts, `undefined` below 20.
- `packages/runner/src/cli.ts`: `probe` command (one real call, prints pick, p_pick, latency, tokens, cost,
  request bytes; exit 2 without a key) and `LIVE=1` test `probe.live.test.ts` (skipped in `pnpm verify`).
- Tests: providers 25, db 3, api 13, runner 3 (+1 live skipped); `pnpm verify` green. No test touches the network.
- Manual: live catalog returned 32 models; daemon `GET /api/models` 200, `POST /api/estimate` and
  `POST /api/games` 201; mock game via the daemon finished in 9 plies (checkmate). Probe without a key exits 2.
- Deviation: `POST /api/games` now validates the config, so the existing control/SSE test sends a valid config.

## T00 — Install foundation

- Copied `docs/build/reference/` to the repo root; merged `.gitignore` (kept root lines, added node/svelte/wrangler/log).
- `pnpm install --frozen-lockfile`, `pnpm db:migrate` and `pnpm verify` are green on Node 26.7.0, pnpm 10.28.0, Stockfish 19.
- Tests: core 53 (1 skipped), providers 11, db 2, engine 6, api 4, runner 3, web 5.
- Mock smoke game: 20 plies, 1/2-1/2 max_plies, reloaded from D1.
