# Changelog

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
