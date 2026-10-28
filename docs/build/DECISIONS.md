# Decisions (all pre-made; follow them)

If a task contradicts this file, this file wins and you note it in `docs/QUESTIONS.md`.
Numbers are exact unless a task says otherwise.

## 1. Toolchain

| # | Decision |
| --- | --- |
| D1 | **pnpm 10.28.0 only.** `packageManager` pinned in the root `package.json`. Never type `npm`, `npx`, `yarn`, `bun`. Use `pnpm add`, `pnpm exec`, `pnpm dlx`, `pnpm run`, `pnpm -r`, `pnpm --filter`. Node ≥ 22 is only pnpm's runtime. The guard script `scripts/no-other-lockfiles.mjs` must pass. |
| D2 | **Pinned versions** (exact, no `^`): typescript **6.0.3**, vitest 5.0.5, tsx 4.23.15, chess.js 1.4.0, drizzle-orm 0.45.4, drizzle-kit 0.31.11, wrangler 4.154.0, hono 4.13.14, @hono/node-server 2.1.5, ulid 3.0.2, svelte 5.57.3, @sveltejs/kit 3.1.0, @sveltejs/adapter-cloudflare 8.0.1, @sveltejs/vite-plugin-svelte 7.3.1, vite 8.3.5, svelte-check 4.7.7, chessground 9.2.1, @cloudflare/workers-types 5.20261027.1, @types/node 22, @playwright/test 1.64.1 (T02), @resvg/resvg-js 2.6.2 (T12). **Do not use TypeScript 7**: SvelteKit 3 cannot load its tsconfig with it. |
| D3 | pnpm 10 blocks dependency build scripts. The root `package.json` carries `pnpm.onlyBuiltDependencies: ["esbuild","workerd","@resvg/resvg-js","sharp"]`. Keep it. |
| D4 | TypeScript strict, ESM, `.ts` extensions in relative imports, `noUncheckedIndexedAccess` on. |
| D5 | Layout is the reference layout. Package scope `@chessdecide/*`. File names kebab-case. In `apps/web`, import from `src/lib` with `#lib/…` (SvelteKit 3 removed `$lib`). |
| D6 | **Raw CSS only.** Tokens in `apps/web/src/app.css`. No Tailwind, no UI kit, no chart library (charts are hand-written SVG). Svelte scoped `<style>` blocks are fine. |

## 2. Data and conventions

| # | Decision |
| --- | --- |
| D7 | IDs: games and series use **ULID** (`ulid` package). `attempts.id` is autoincrement. |
| D8 | Times: ISO 8601 UTC strings. Money: JS number in USD from `usage.cost`; missing → `null`, never `0`. |
| D9 | Randomness: only `mulberry32` and `subSeed` from `packages/core/src/rng.ts`; the seed is stored on the row it affects. No `Math.random` in logic (the HTTP client's jitter default is the one exception). |
| D10 | Canonical move id is **UCI**; SAN is display only. Castling is the king move (`e1g1`); promotions lowercase (`e7e8q`). |
| D11 | Database: **Drizzle over SQLite**, running on local **D1** through wrangler's `getPlatformProxy`, state in `<repo>/data/d1/v3` (the proxy's `persist.path` must end in `/v3`; the wrangler CLI's `--persist-to ../../data/d1` adds it). Schema changes = edit `packages/db/src/schema.ts`, run `pnpm db:generate`, commit the new migration, run `pnpm db:migrate`. **Never edit a migration that has been applied.** D1 allows ≤ 100 bound parameters per statement and rows ≤ 2 MB. |
| D12 | The `games` row must exist before its `plies` rows (foreign key). `playToEnd` saves it first. |
| D13 | Raw request/response bodies (`attempts.request_gz`/`response_gz`) stay **local**; they are never published. |

## 3. Game rules and numbers

| # | Decision |
| --- | --- |
| D14 | `judge_depth` default **14**; `max_plies` 200; `adjudicate` true (|eval| ≥ 900 cp for 6 plies from ply 30). Measured here (Stockfish 16, 2 workers): ≈ 2.3 s per judged model ply at depth 14, so a 60-ply game ≈ 70 s judging on a 4-core box; faster on Autumn's machine. If one real game takes > 3 min wall-clock, **ask** before lowering depth. |
| D15 | Ladder `movetime_ms` **50**, `Threads=1`, `Hash=32`; judge `Threads=1`, `Hash=64`, `UCI_ShowWDL=true`, full strength. Judge workers = `min(4, cores − 2)`, at least 1. |
| D16 | Forced moves (exactly one legal move) are played without a model call, no cost, `forced: true`, excluded from model-quality metrics (`PROMPTS.md` §8b). |
| D17 | A `choice` question needs ≥ 2 options. `build()` throws on fewer; `stepGame` never calls it then. |
| D18 | Terminations and results exactly as implemented in `stepGame`: checkmate (mover wins), stalemate/insufficient/repetition/fifty_move/max_plies (draw), adjudicated (side ahead wins, flagged). Aborted games are **excluded** from ratings, never scored as losses. |
| D19 | Opponents: ladder levels in `packages/core/src/ladder.ts`. Until a calibrated `data/ladder/ladder-vN.json` exists the nominal `DEFAULT_LADDER` is used and every Elo shows an "uncalibrated ladder" notice. |
| D20 | Series: block size 5, ≤ 2 games in parallel, first block faces the level nearest 1200, later blocks the level nearest the posterior mean, a block waits for the previous block, colours alternate by game index (even index = model is White), openings paired by `floor(index/2)`, opening seeds `subSeed(seed, openingIndex)`. Quick 25, Standard 50, custom N, completion (target half-width 75, min 25, max 200). Stop on budget cap (`stopped_budget`, resumable) and on 3 consecutive aborted games (`stopped_error`). Implemented by `nextAction`; do not reimplement. |
| D21 | Opening generator `randomOpening`: 4 random legal plies, accept if the depth-14 eval is within ±100 cp (White POV), up to 50 sub-seeds, else the closest candidate. Series games always use it; single games default to `startpos`. |
| D22 | A game paused by a transport error (after the client's retries) is retried **from its last ply** up to 3 times inside a series, then marked `aborted`. Outside a series it stays `paused` with the reason. |

## 4. Model calls and money

| # | Decision |
| --- | --- |
| D23 | Endpoint `POST https://openrouter.ai/api/alpha/decisions`, headers `Authorization`, `Content-Type`, `X-Title: ChessDecide`. No `session_id`, no `user`. Timeout 60 s. |
| D24 | Retry: up to **3 retries** (4 HTTP calls) on 429, 5xx and network errors, waits 1 s, 2 s, 4 s ±20 % jitter, `Retry-After` wins; other 4xx never retried; `invalid_choice` retried once. Per-model concurrency **2**, ≤ **4** requests/s; a 429 halves concurrency for 60 s. Already implemented. |
| D25 | Cost = `usage.cost` from the response (input-only). Cache hits cost 0 and still write an `attempts` row. The cache key is `sha256(model \0 request body \0 repeat)`. |
| D26 | Roster: `typesafe/jev-1.14`, `liquid/d1-ultra` (flagged `roster:true`); the rest of the catalog is selectable under "More models". Price per million input tokens comes from the catalog (`pricing.prompt × 1e6`), fixture in `fixtures/`. |
| D27 | Budget: hard cap per game and per series, **default $1.00**. Estimate per call = `(400 + 45·n_options)/1e6 × price` (slim), replaced by the rolling mean of real input tokens after 20 non-cached attempts. A call is allowed iff `spent + estimate ≤ cap` (equality allowed). Game estimate: `calls = ceil(max_plies/2)` capped at 40 typical, worst case `ceil(max_plies/2)`; series estimate = games × game estimate. `POST /api/games` returns 402 when the typical estimate exceeds the cap. |
| D28 | The API key is read from `OPENROUTER_API_KEY` by the **daemon only**; never logged, never in an API response, never in published data. Without a key a non-mock model game fails with `424 no_api_key`. |
| D29 | Tests never touch the network. Use a fake `fetch`, fixtures, `MockPlayer`. Live tests live behind `LIVE=1` and are excluded from `pnpm verify`. |
| D30 | **Image arm** (T12): 512×512 PNG from SVG via `@resvg/resvg-js`, cburnett pieces, brown board, coordinates, White at the bottom, no last-move highlight, no arrows; request per `PROMPTS.md` §12; sent as an `image_url` data URL inside the `state` array. Reported as its own arm. |

## 5. API and UI

| # | Decision |
| --- | --- |
| D31 | One API implementation (`packages/api`), two hosts: the Node daemon (local) and a SvelteKit route (deployed, read-only). Error envelope `{error:{code,message,retryable,detail}}`; codes in `API.md` §1. Control routes exist only when a `ControlPlane` is passed. |
| D32 | SSE: on connect send `snapshot`, then hub events; clients reconnect and get a fresh snapshot (no `Last-Event-ID` replay). Heartbeat `: ping` every 15 s. |
| D33 | The daemon binds `127.0.0.1:8731` and refuses other addresses unless `CHESSDECIDE_ALLOW_REMOTE=1`. `vite dev` proxies `/api` to it; `CHESSDECIDE_MODE=public` disables the proxy and uses the in-app read-only route. |
| D34 | UI: dark lichess-like tokens from `app.css`; **works at 400 px width first**; Svelte 5 runes; client-rendered (`ssr = false`); chessground view-only board; no animation beyond chessground's. **No generated commentary**: text beside a move comes from fixed templates over Stockfish numbers (`viewer-model.ts`). Every rating shows its interval; overlapping arms are never ranked. |
| D35 | Number formats: Elo rounded to integers with ± half-width; money 3–6 decimals (`$0.003`); pawns with 1 decimal. |

## 6. Process

| # | Decision |
| --- | --- |
| D36 | Branch: work on the branch you are given; one commit per task; never force-push; never open a PR unless asked. |
| D37 | Tests: vitest. Engine tests skip with a clear message when Stockfish is absent (`STOCKFISH_PATH`, `/opt/homebrew/bin/stockfish`, `/usr/games/stockfish`). UI tests: Playwright against the daemon in mock mode (`CHESSDECIDE_MOCK=1`). |
| D38 | Checkpoints that **stop and ask**: end of T04 (first real game), end of T08 (first real series), the Cloudflare credential step in T10. Report: what ran, cost, wall-clock, what looked wrong, and a recommendation. |
| D39 | Out of scope until told otherwise: hosted live runs, model-vs-model, position suite, text-model arm, auth, per-model prompt tuning, Compare tool. |

## 7. Known gotchas (each cost time once)

1. **SvelteKit 3:** no `svelte.config.js` (pass `sveltekit({ adapter, preprocess })` in `vite.config.ts`); no `$lib` (use `#lib/*` via `package.json` `imports`); `tsconfig.json` must `extends: "$app/tsconfig"` and keep `"$app/types"` in `types`; bindings come from `import { env } from 'cloudflare:workers'`, not `platform.env`.
2. **`getPlatformProxy` vs wrangler CLI state path:** the CLI nests under `v3`, the proxy does not; pass `…/data/d1/v3` to the proxy.
3. **Foreign keys:** save the `games` row before any ply; D1 enforces FKs.
4. **D1 bound-parameter limit 100:** batch inserts with ≤ 10 rows of 10 columns, or use single inserts per ply.
5. **Workers cannot spawn Stockfish:** all engine work is in the Node daemon/CLI.
6. **Clef** reads only roughly the first 2,000 tokens of text in `state` and drops the rest silently; **Jev** treats any image as long-context mode; **D1/D1 Ultra/Clef** reject a one-option `choice` (HTTP 422).
7. Wrangler prints "Proxy environment variables detected" in the sandbox; harmless.
8. A forced mate in the oracle is ±1000 cp; clamp everywhere.
9. `chess.js` perft depth 4 takes ~40 s; unit tests use depth 3.
10. `svelte-check` peer-warns about TypeScript versions other than 5/6; keep 6.0.3.
