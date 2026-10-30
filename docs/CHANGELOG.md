# Changelog

## T13 — Headless bench runs

- `packages/core/src/bench.ts` (pure): `parseBenchPlan` (every rule + field name, unknown keys
  rejected, `image` accepted now that T12 is merged), `expandCells` (models × arms × repeat, stable
  names), `planPrefix`, `seriesCapFor`, `cellState`, `benchReport` (markdown, deterministic: intervals
  never bare, `≈` for overlapping pairs, ladder walk, not-finished list, MOCK/uncalibrated banners) and
  `benchSummary` (fixed key order). +11 tests, one report snapshot.
- `packages/runner/src/bench.ts`: preflight (git identity, key, Stockfish, catalog/prices, ladder file
  + `ladder_levels` import, DB schema, disk, estimate gate), resume from `data/bench/<run>/manifest.json`,
  per-cell cap `min(series_cap, run_cap − spent)` recomputed from the DB, sequential cells through the
  existing `SeriesControlPlane`, per-game log to stdout and `run.log`, a cell watchdog that pauses
  (state `timeout`), fail-forward (or `--stop-on-error`), and the artifact bundle: `report.md`,
  `summary.json`, `leaderboard.csv` (filtered to the run), `series/<id>.json`, `sql/part-001.sql`.
  The SQL step refuses to write when `ladder_levels` lack the run's version.
- CLI: `bench run|status|report|models`; `bench models` lists prices, `bench status` reads
  `status.json` + the DB with an ETA, exit codes 0/2/3/130. Plan paths resolve from the invocation
  directory (`INIT_CWD`), not `packages/runner`.
- Fixed while wiring: `outputPaths` now always numbers its files (`…-001.sql`), so a single-file run
  matches the DEPLOY runbook. Ladder tests that drive `calibrate` got explicit 60 s timeouts (the new
  bench suite made the 5 s default flaky under load).
- Tests: core 11 (bench), runner 13 (smoke bundle, finished cells skipped, resume of a paused series,
  dry run, `--no-sql`, ladder guard, run cap, status, preflight key/model/cap/schema); `pnpm verify`
  green (runner 46 + 3 skipped).
- Deviation: with `--mock` games cost $0, so the run-cap stop is exercised as “cap leaves < $0.05”
  (zero cells) plus the pure `seriesCapFor` tests; a mid-run budget stop needs real spend.

## T12 — Image arm

- New `@chessdecide/render`: `boardSvg` / `boardPng` / `boardDataUrl` (resvg, 512×512, `#f0d9b5`/`#b58863`,
  White at the bottom, coordinates, no highlights or arrows). Byte-stable output: the start-position SVG
  and PNG are snapshotted/hash-pinned in tests. Piece SVGs are extracted at build time from
  `chessground.cburnett.css` by `scripts/extract-pieces.ts` into a committed `src/pieces.ts`; the
  renderer never reads CSS at runtime.
- Wiring: `runtime.ts` passes `renderImage: boardDataUrl` to `ModelPlayer` for `arm.interface === 'image'`
  and the “arrives in T12” error is gone. The running budget adds 600 input tokens per call for an image
  side until a measured mean exists. `estimateGame` already priced the +600 (now covered by a test).
- Found and fixed while wiring: `attempts.request_gz` was always null — `ModelPlayer` never put the
  request body in the row. It now records `request_json` (local-only, gzipped by the sink), so the raw
  request/response pair D13 promises is actually stored. `attempts.interface` is `'image'` for image calls.
- UI: Image is a real arm option in New game and New series, with the one-line caveat; the caveat only
  shows when Image is selected.
- Tests: render (6: SVG snapshots for start + Italian, determinism, 512×512, pinned sha256, promoted
  queen, bad FEN), providers (image message via `renderImage`, +600 tokens), runner mock game with the
  image arm, and `image.live.test.ts` (two real calls, `LIVE=1` only).
- Live: Jev 1,480 in / 220 out / $0.000062 / 1,088 ms; D1 Ultra 633 in / $0.000027 / 392 ms, both `e2e4`.
  One real game (cap $0.05, game `01M66ZFTK1JS9WTJ41KDHT7T9Y`): 0-1 adjudicated, 40 plies, 50 s,
  $0.001467. Image costs ~22 % more per game than clean with no visible gain (`docs/SPIKE.md` §10).

## T11 — PGN, JSON and CSV exports

- `packages/core/src/pgn.ts`: `gameToPgn(game, { site })` writes tags in the spec order (Event, Site,
  Date, Round, White, Black, Result, Termination, then `SetUp`/`FEN` for a non-standard start, Model,
  Arm, Level, CostUSD) and movetext wrapped at 80 columns. Every judged ply gets
  `{[%eval 0.23] p=0.31}` — eval in pawns from White POV, clamped to ±10.00, `p=` only for a real
  model pick (never engine or forced). Judged model plies carry `?!`/`?`/`??`. Move numbers follow the
  starting FEN's side and fullmove number, so random-opening games export as `3. e4`, not `1. e4`.
- `packages/core/src/csv.ts`: RFC 4180 quoting with `\n` newlines and empty fields for null. Fixed
  headers for `seriesCsv` (one row per game) and `leaderboardCsv` (one row per arm).
- `packages/core/src/labels.ts`: `playerLabel` moved out of the web app so PGN tags, CSV and the Viewer
  share one label (`liquid/d1-ultra`, `Ladder uci1500`, `Stockfish 1500`); the web re-exports it.
- `packages/api`: `GET /api/games/:id/pgn` (`text/plain`), `GET /api/series/:id/export.json`,
  `GET /api/series/:id/export.csv`, `GET /api/leaderboard/export.csv` (`text/csv`), all with
  `Content-Disposition: attachment` and all available in public mode.
- `apps/web`: plain download links — Viewer “Download PGN”, series detail “Download JSON / CSV”,
  leaderboard “Download CSV”. No scripting; they are normal links to the API.
- Tests: `packages/core/test/exports.test.ts` (+13) replays each PGN with chess.js to the same final
  FEN and ply count, checks tags/comments/glyphs/forced/custom FEN/black-to-move/wrapping, CSV quoting,
  and rebuilds `RatedGame[]` from the series CSV (`estimate` within ±0.5 of `Series.elo`). API exports
  are covered by `query-budget.test.ts` (body, header and ≤ 10 queries); e2e asserts the three links.
- Deployed the same day (`pnpm build` + `wrangler deploy --config wrangler.production.jsonc`); the live
  PGN uses `[Site "chessdecide"]` and starts from the game's real opening FEN.
- Tests: core 83 (+13), api 40 (+5), db 12, runner 31 (+1 skipped), web 22; `pnpm verify` and `pnpm e2e`
  (42) green, `pnpm build` green.


## T10 — Publish command, deploy runbook, query budget

- `packages/runner/src/publish.ts`: `pnpm cli publish` reads the local D1 and writes re-runnable SQL
  (`INSERT OR REPLACE`) for `ladder_levels`, `series`, `games`, `plies` in that order. It selects series
  with a verdict (`finished`, `stopped_budget`, `stopped_error`) or explicit `--series <id>...`, adds
  finished games outside any series with `--all-games`, and never touches `attempts`, `oracle_moves`,
  `settings`, `models_snapshot` or `ladder_games`. Column lists are explicit, so a new local column
  cannot leak by accident.
- Publish safety: `config_json` is parsed and refused if any field name or value looks like a key;
  `plies.attempt_id` is nulled; strings use doubled quotes; rows are rendered with an explicit single
  table per statement. Files are chunked under 2 MB and a single row over D1's 100 KB statement cap
  fails with the table and key named. `--dry-run` prints counts and bytes and writes nothing.
- `--remote` refuses to run unless the config it is given holds a real Cloudflare D1 id (a UUID), so
  `wrangler.jsonc` (`local-dev`) cannot receive production SQL. It then runs `wrangler d1 execute DB
  --remote --config <file> --file <chunk>` per file. `--config` resolves against `apps/web/`.
- `apps/web/wrangler.production.jsonc`: separate production config (its own `database_id` placeholder,
  `vars.CHESSDECIDE_MODE=public`, same migrations dir). `docs/DEPLOY.md`: ordered runbook (login, create
  D1, migrate, build + deploy, publish twice, verify `/api/health`, `/`, `/series`, replay, 400 px) with
  the expected output at each step and what is never published.
- `packages/db`: `buildSeries` split into `assembleSeries` (pure projection) plus a batched
  `leaderboardInput`, so the leaderboard reads all chosen series, games and plies in a fixed number of
  queries instead of three per arm. `packages/api/test/query-budget.test.ts` wraps `DB.prepare` and
  asserts every public route ≤ 10 queries (leaderboard is exactly 6 with four arms).
- Real dry run on the four real series: `ladder_levels 12, series 4, games 100, plies 5088`, 5.5 MB in
  three files (2.0, 2.0, 1.3 MB); no `sk-or-` string anywhere in the output.
- `apps/web`: added the `cookie` dependency (2.0.1, the ESM release SvelteKit 3 externalises in the
  server build). `pnpm build` was failing at SvelteKit's "Analysing routes" step because the emitted
  chunk imported a bare `cookie` and resolved to a stray CJS copy outside the repo; with the dependency
  declared, `apps/web/node_modules/cookie` is the ESM one and the build is reproducible.
- Tests: runner 31 (+12 publish), api 35 (+11 query budget), db 12; `pnpm verify` green, `pnpm build` green.
- **Deployed** with Autumn: D1 `chessdecide` (`394e0101-…`, ENAM), migrations 0000–0002 applied
  remotely, Worker at `https://chessdecide-web.m7jv4v7npb.workers.dev`. Published twice; remote counts
  identical both times (4 series / 100 games / 5088 plies / 12 ladder levels).
- Fix found by the deploy: public mode defaulted to the nominal ladder (v0) while the series were rated
  on v2, so `/` came up empty. `publishedLadderVersion`/`loadPublishedLadder` now derive the ruler from
  the published `ladder_levels` (highest version with a finished series; `calibrated` when > 0), and
  `GET /api/ladder` serves it read-only. The deployed leaderboard shows all four arms on v2 with the
  calibrated ticks; health reports `ladder: {version: 2, calibrated: true}`.
- Phone check on the deployed site (400×800): leaderboard shows four arms, no horizontal scroll, no New
  game/series buttons; a published game replays with board, eval graph, controls and the decision panel.


## T08b — Four arms on one ladder

- Ran three more Quick 25 series after the first one: Jev `hinted` (**775 ± 159**, 11-1-13, $0.0210),
  D1 Ultra `clean` (**733 ± 158**, 8-2-15, $0.0099), D1 Ultra `hinted` (**895 ± 162**, 11-2-12, $0.0091).
  All on ladder v2, cap $0.50, 0 aborts, 0 illegal moves, 0 × 429. Total for the four: $0.0709, ~67 min.
- The hinted arm moves both models up (Jev +243 Elo, separated; D1 Ultra +162, not separated yet).
  D1 Ultra is 2–3× cheaper per game ($0.00037) and ~2× lighter on input tokens than Jev.
- Report `docs/build/reports/T08b-arms-and-models.md` + three series screenshots.

## T09 — Leaderboard

- `packages/core/src/leaderboard.ts` (+14 unit tests): `buildLeaderboard` (one row per arm = **model +
  arm**, latest finished else longest series, one ladder version), `separated_from` from non-overlapping
  95 % intervals, sorted by mean for display only, `reference` ticks from the loaded ladder, and
  `compareArms` (difference posterior by grid convolution → `P(A>B)`, gap mean and 2.5/97.5 %).
  Arms with no rated game are left out: an empty series is not evidence.
- `packages/db`: `leaderboardInput` picks per arm with a metadata-only rule first (no plies for series
  it will not show), then loads the chosen series' games and secondary stats. `arm_id` is
  `model#arm` so the same preset on two models is two rows (+4 db tests, +6 API tests).
- `packages/api`: `GET /api/leaderboard?ladder_version=N` and `GET /api/leaderboard/compare?a&b`;
  read-only, available in public mode, `ladder_version` validated (400) and unknown arms 404.
- `apps/web`: `/` is the leaderboard (was a redirect to `/games`); ladder axis + arms table (Elo ± ,
  W-D-L, score, cost, ACPL/accept/blunder, "not separable yet" with `≈` and the overlapping pairs
  listed), `CompareBox` (two selects → `P(A stronger)` + Elo gap), empty state, uncalibrated notice,
  10 s refresh; nav gained Leaderboard and links home.
- `apps/web/e2e/leaderboard.spec.ts`: real finished arms on `/`, the compare box in both directions,
  `≈` + overlap copy, separated rows, empty state, 400 px no horizontal scroll.

## T08 — First real series (DONE)

- Started Jev `clean`, Quick 25, adaptive, cap $0.50, ladder v2, judge depth 14, from the New series
  dialog. Estimate $0.073 typical / $0.184 worst.
- Paused at **5 finished / 25** (2 `eps50` games in flight, paused): **0 W – 0 D – 5 L** vs `uci1320`,
  provisional Elo **668 ± 553**, **$0.0029** for finished games ($0.0053 all attempts), ~6.5 min.
- Adaptive worked: after 0-5 vs `uci1320` it dropped block 2 to `eps50` (614), 54 Elo from the
  provisional mean. 0 aborts, 0 illegal moves, 0 × 429; 9 transient network retries all recovered.
- Secondary: ACPL 97.9, acceptable 81.1 %, mistakes 14.9 %, blunders 9.5 %, avg 30.2 plies,
  80 % adjudicated, p50 531 ms, p95 1,787 ms, 928 input tokens, **$0.00058/game** (≈5× below estimate).
- Resume id `01M625J2GZ003DBZWK012ERQQ8`; report/screenshots in `docs/build/reports/T08-*`.
- `EngineJudge` now serializes judge calls; two series games judging at once used to crash with
  `NativeUciEngine is single-flight`. Regression test added.
- **Resumed and finished** (next session): the two paused `eps50` games continued from their saved
  plies (no replay, no double spend), then all 25 finished under the cap.
- Final: **Jev·clean = 532 ± 160 Elo** (370–690), **8 W – 2 D – 15 L** (36 %), **$0.029934**
  ($0.00120 / game), **$0.0247** of it in the resumed session, ~18 min total at concurrency 2.
  25 games / 5 adaptive blocks: `uci1320` 0 %, `eps50` 30 %, `eps75` 80 %, `eps50` 30 %, `eps50` 40 %.
- 812 ok calls (32.5 / game), 0 cache hits, 10 forced plies / 1,647, p50 393 ms, p95 963 ms.
  20 adjudicated, 3 checkmate, 1 stalemate, 1 max-plies; 0 aborts, 0 illegal moves, 0 × 429.
  Interval closed to ±160 vs the documented ±136 at 25 games; estimate was 2.4× conservative.
- Last block's level (`eps50`, 614) is 82 Elo from the final estimate; never reached the ladder floor.

## T07 — Series screens

- `series-model.ts` (+14 web unit tests): targets/progress, `intervalLabel`, `precisionHint`, `overlap`,
  ladder-axis scaling, Elo chart geometry, block rows, `METRIC_LABELS`, metric formatting and game chips.
- `LadderAxis` (HTML/CSS interval bars + level ticks), `EloChart` (hand-written SVG mean line + 95 % band
  with ladder ticks and the current opponent highlighted), `GameStrip` (W/D/L/running/aborted cells),
  `SeriesCard` (status, progress, Elo interval, cost, "not separable yet"), and `MiniBoard` (live 1:1
  board for up to two in-flight games, subscribed to the game SSE).
- `/series`: ladder axis, overlap marking, cards, 5 s polling, uncalibrated notice, New series.
  `/series/[id]`: rating card (number always with interval), Elo chart, strip, blocks, secondary metrics
  with plain-language labels, games table (25 + show all), live SSE updates, Pause/Resume/Stop with confirm.
- `NewSeriesDialog`: model/arm/size/ladder/budget, debounced typical + worst-case estimate (red over cap),
  Start → create → start → detail. Header nav gained Series and a New series button.
- API client wrappers for series; `SeriesSummary` now carries `size` (for the card target).
- Found by the new e2e: two series games judging at once hit `NativeUciEngine is single-flight`.
  `EngineJudge` now serializes `oracle`/`evalPosition` calls (and has a regression test).
- Tests: `pnpm verify` green (web 14, engine 7); `pnpm e2e` 30 passed (15 tests × 2 viewports), including
  the four series specs at 400 px and 1280 px.
- Deviation: e2e series use a fixed `random` ladder level and custom 8 games to stay fast; the dialog is
  still exercised via route interception.

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
