# ChessDecide — Implementation guide

**Audience: the implementing model.** Read in this order: `PLAN.md` → `ARCHITECTURE.md` →
`METRICS.md` → `PROMPTS.md` → `API.md` → `UI.md` → this file, then open
`docs/mockups/simple.html` (the target look and flow) in a browser. `mockups/index.html` holds
the older, denser screens for reference.
These documents are normative. When something is ambiguous, **stop and ask** (or write the
question into `docs/QUESTIONS.md` and continue with the most conservative interpretation).
When you change behaviour, change the doc in the same commit.

**Build order is viewer-first.** The goal is to *watch a model play* as early and as cheaply as
possible (mock provider, $0), run one real game (about half a cent), and only then build the
ladder, Series and Elo.

## 0. Ground rules

**Stack**: TypeScript (strict, ESM), **pnpm** workspaces (`pnpm-workspace.yaml`, `packageManager` pinned in the root
`package.json`, `engines` set; Corepack or `pnpm self-update`), Node 22+ as the runtime pnpm
itself needs (the runner runs through `pnpm exec tsx` / `pnpm run`), `chess.js` for rules, `drizzle-orm` + `drizzle-kit` (SQLite dialect), `vitest` for tests,
SvelteKit + Svelte 5 + `adapter-cloudflare`, `chessground@9.2.1`, `wrangler`. Stockfish 19 from
`STOCKFISH_PATH` or `PATH`. **Raw CSS only: no Tailwind, no UI kit, no chart library.**
**Package manager: pnpm only.** Never write `npm`, `npx`, `yarn` or `bun` in scripts, docs or CI;
use `pnpm add`, `pnpm exec`, `pnpm dlx`, `pnpm run`, `pnpm -r`, `pnpm --filter`. Wrangler runs as
`pnpm exec wrangler`.

**Conventions**

- `packages/core` is pure: no `node:*` imports, no `fetch`, no `Date.now()` or randomness
  except through injected `clock` and seeded `rng`. It must run in Workers and the browser.
- Everything with I/O lives behind the ports in `ARCHITECTURE.md` §2. Core takes ports as
  arguments; it never imports adapters.
- Moves: canonical id is **UCI**; SAN only for display and `hinted` keys.
- Money is a number in USD parsed from `usage.cost`; never recomputed from tokens. Missing → `null`.
- All randomness is seeded (`mulberry32`) and the seed is stored on the row it affects.
- JSON field names `snake_case`; times ISO 8601 UTC strings.
- Never log or persist the API key; never send it to the browser or to published data.
- Python (tools only): run with `uv run`, format with Black.
- Commit messages: present tense, first line < 50 chars. The user uses she/her pronouns.
- **Never spend money in tests.** Tests use fixtures, a fake `fetch`, and the mock provider.
  A network test sits behind `LIVE=1` and reads the key from the environment.

**Definition of done (every task)**: code + tests + doc updates + a note in `docs/CHANGELOG.md`;
the task's acceptance check passes; `pnpm test`, `pnpm typecheck` and (web) `pnpm check` pass.

## 1. Core types (`packages/core/src/types.ts`)

```ts
export type Uci = string;
export interface Move { uci: Uci; san: string; from: string; to: string; promo?: string;
  capture: boolean; ep: boolean; castle: boolean; check: boolean; mate: boolean;
  piece: string; captured?: string }
export interface Position { fen: string; historySan: string[] }

export interface Arm {
  interface: 'text' | 'image';
  keyFormat: 'uci' | 'san'; descriptor: 'plain' | 'annotated';
  stateVariant: 'slim' | 'full'; template: 'neutral' | 'instructive' | 'minimal';
}   // presets: clean, hinted, image (PROMPTS.md §12)

export interface MoveRequest { position: Position; legal: Move[]; arm: Arm; seed: number;
  repeat: number; purpose: 'game' | 'ladder' | 'probe'; gameId?: string; ply?: number; seriesId?: string }
export interface AttemptMeta { attemptId?: number; modelSlug: string; returnedModel?: string;
  provider?: string; latencyMs: number; inputTokens?: number; outputTokens?: number;
  retries: number; costUsd: number | null; cacheHit: boolean; requestHash: string }
export interface MoveResponse { move: Move; probs?: Record<Uci, number>; confidence?: number;
  probSum?: number; meta: AttemptMeta; raw?: unknown }

export interface MoveProvider { id(): string; move(req: MoveRequest, signal?: AbortSignal): Promise<MoveResponse> }
export interface Opponent { move(pos: Position, signal?: AbortSignal): Promise<{ uci: Uci; info: OpponentInfo }>; close(): Promise<void> }
export interface Player { move(g: GameState, signal?: AbortSignal): Promise<PlayerMove>; describe(): PlayerDesc }

export interface Ports { engine: EngineFactory; provider: (p: PlayerDesc) => MoveProvider;
  store: Store; events: EventSink; clock: () => number; rng: (seed: number) => () => number }

/** Plays exactly one ply. Pure apart from the ports. */
export function stepGame(state: GameState, ports: Ports, signal?: AbortSignal): Promise<GameState>;
```

A game is `(white: Player, black: Player)`; both sides implement `Player`, so the loop never
branches on type and model-vs-model (M8) needs no new game code.

## 2. M0.5 — Spikes (before M1 code that depends on them)

- **S1** — **done, passed** (`SPIKE.md` §8; scripts in `spikes/s1-d1/`). Original brief: a Node script that opens local D1 via `getPlatformProxy()`,
  applies a Drizzle migration, inserts and reads 10,000 ply rows. Pass if < 5 s; else adopt the
  `better-sqlite3` fallback behind the same `Store` interface and record why.
- **S2**: one paid probe (≤ $0.01): send a board PNG to `typesafe/jev-1.14` and `liquid/d1-ultra`
  with bare text options; record the exact request shape that works, latency, tokens, cost, and
  whether the pick differs from the text arm. Write results into `SPIKE.md`.

## 3. M1 — Core, engine, store (no UI)

### T1.0 Bootstrap
Workspace skeleton per `ARCHITECTURE.md` §3, `vitest`, `tsconfig` strict, `docs/CHANGELOG.md`,
`docs/QUESTIONS.md`, `.env.example`, `.gitignore` (`data/`, `.wrangler/`, `.env`, `spikes/out/`).
**Accept:** `pnpm install --frozen-lockfile`, `pnpm test` and `pnpm typecheck` green on the empty skeleton; `pnpm-lock.yaml` committed; a CI/lint check fails if `package-lock.json`, `yarn.lock` or `bun.lockb` appears.

### T1.1 Chess rules + golden tests (`packages/core/chess`)
1. Wrap `chess.js`: `parse(fen)`, `legal(pos)` (sorted by UCI ascending), `apply(pos, uci)`, SAN/UCI,
   `outcome` (threefold by FEN fields 1–4 history; fifty-move from halfmove clock; insufficient
   material; stalemate; checkmate). Castling UCI is the king move (`e1g1`); promotions `e7e8q`.
2. Descriptors per `PROMPTS.md` §4: `plain` is fully bare, `annotated` adds capture/check/mate.
3. `tools/gen_golden.py` (python-chess via `uv run --with chess`): ≥ 3,000 positions from seeded
   random games plus edge cases (promotions incl. captures, en passant, both castles, pins,
   discovered check, stalemate, insufficient material, mate in 1, 60+ moves) →
   `packages/core/test/golden.jsonl` of `{fen, legal:[{uci,san,plain,annotated}], outcome}`.
   The Python script implements the descriptor grammar **independently** of the TS code.
**Accept:** golden test matches 100 %; perft startpos depth 4 = 197,281; any mismatch is a TS bug.

### T1.2 Prompt builders and parser (`packages/core/prompts`)
Implement `PROMPTS.md` §2–§9 and §12 exactly, as pure functions:
`build(req) → { body, keyToUci, order }`, `parse(json, keyToUci) → parts | TypedError`.
Fixtures per `PROMPTS.md` §11, **byte-exact** for `clean`, `hinted`, `image`.
**Accept:** fixtures pass; changing one character of a description fails a test; each of
`invalid_choice`, `missing_answer`, `unexpected_type`, `invalid_probs`, `prob_sum_warn` is covered.

### T1.3 Store (`packages/db`)
Drizzle schema = `API.md` §4. `Store` interface in core; Drizzle implementation here;
`drizzle-kit` migrations. **Accept:** migrations apply to an empty DB twice; CRUD tests on an
in-memory/local DB; spend aggregation correct with `cache_hit` rows; no transaction held across
a network call.

### T1.4 Engine port + native UCI adapter (`packages/engine`)
1. `NativeUciEngine`: spawn, `uci`/`uciok`, `setoption`, `isready`/`readyok`, `ucinewgame`,
   `position fen …`, `go depth D | movetime M`; parse `info … depth … score cp|mate … wdl W D L … multipv N … pv …`
   keeping the last line per multipv at the greatest depth; read until `bestmove`; per-search
   timeout; restart once if the process dies; `close` sends `quit`.
2. Opponents on top of `Engine`: `StockfishOpponent{elo, movetimeMs}` (`UCI_LimitStrength`,
   `UCI_Elo`, `Threads=1`, `Hash=32`), `EpsOpponent{eps, inner, rng}`, `RandomOpponent`.
3. `JudgePool`: N = min(4, cores − 2) engines (`Threads=1`, `Hash=64`, `UCI_ShowWDL=true`), queue.
**Accept (needs stockfish; skip with a clear message if absent):** mate-in-1 FEN `h5f7`; WDL parsed;
`UCI_Elo` 1320 vs 2800 over 20 games at 50 ms → 2800 wins ≥ 18; `EpsOpponent(ε=1)` is uniform over
legal moves (chi-square on 2,000 draws); killing the process mid-search recovers.

### T1.5 Oracle / judge (`packages/core/oracle` + engine)
Implement `METRICS.md` §3 exactly. Cache table `oracle_moves`. API: `evaluate(engine, pos, depth)`
and `judgePlayed(oracle, playedUci) → Judge`.
**Accept:** on the mate-in-1 FEN `h5f7` has `cp=1000`, `wp=100`, best; CPL of the best move is 0 and
`wl ≥ 0` for every move (property test, 200 random positions); second call is a pure cache hit;
record oracle seconds per position at depth 14 and 18 in `CHANGELOG`.

### T1.6 Mock provider
Deterministic given `(fen, seed)`: softmax over a cheap heuristic (material after the move + centre
control), temperature 1.0, realistic `probs`, `confidence`, fake `meta` (cost from fake tokens ×
$0.042/M). `MOCK_FAIL` env injects 429/502 reproducibly by seed; latency 300–1200 ms (0 in tests).
**Accept:** same input → same output; failure injection reproducible by seed.

### T1.7 Game stepper and local runner
`stepGame` per §1 and `API.md` §3.2 state machine: decide player → budget check → `move` →
apply → persist ply (transaction) → publish `ply` → judge → persist judge → publish `judged` →
adjudication and termination checks. `packages/runner` CLI: `chessdecide game --white mock --black uci1500`
(loop `stepGame` until terminal, write to DB, print PGN and totals).
**Accept (mock, no network):** 10 games × 2 concurrent finish with correct terminations; Step/Pause/
Stop and restart recovery tests; budget stop at the cap boundary; adjudication triggers on a scripted
sequence; PGN export round-trips through python-chess in a golden test.

## 4. M2 — Viewer, one real game, go/no-go

### T2.1 Web scaffold
`apps/web` SvelteKit (Svelte 5, TS strict, `adapter-cloudflare`), tokens from `UI.md` in `app.css`,
`chessground` CSS/JS vendored from `docs/mockups/vendor/`, app shell, `types.ts` mirroring `API.md`.
**Accept:** `pnpm check` clean; shell renders; `wrangler dev` serves it.

### T2.2 Local control API + SSE
Endpoints from `API.md` §3.1–§3.2 as SvelteKit `+server.ts` routes, enabled only when
`CHESSDECIDE_MODE=local`; SSE with `Last-Event-ID` replay from the DB. The runner and the web app
share `packages/db`. **Accept:** vitest end-to-end with the mock: create game → open SSE → `auto` →
`snapshot`, `thinking`, `ply`, `judged`, `status` in order → `GET /api/games/{id}` equals the
SSE-built state.

### T2.3 Viewer
Match `docs/mockups/simple.html` first (board, transport, eval bar, tappable eval graph, plain
one-line status, stats), then the denser parts of `UI.md` §5–§6 (move list, decision panel).
Build **replay first**, then **live attach**. **No generated commentary** (it costs money);
text beside a move comes from fixed templates over Judge numbers only.
**Accept (Playwright, mock):** load game; `→` ×5 advances 5 plies; `Home`/`End`; space autoplays and
stops at the end; clicking the graph seeks; live game follows new plies and stops following after `←`.
Works at 400 px width.

### T2.4 Games list and New game dialog
Table + filters; dialog with live estimate and cap; banners for retry/error/budget; no-key and
empty states. **Accept:** each row of the `UI.md` §7 state table has a test.

### T2.5 OpenRouter client + budget
`DecisionsProvider` using `fetch`: catalog (public, 1 h cache), request build, retry/backoff/
limiter/cache per `PROMPTS.md` §9 (per-slug concurrency 2, ≤ 4 req/s, 429 halves concurrency for
60 s, `Retry-After`, ±20 % jitter), every HTTP call → `attempts` row. Budget estimator
(`PROMPTS.md` §10), `check(cap, spent, estNext)`, ledger. `GET /api/v1/key` probe, tolerate failure.
**Accept:** fake-`fetch` tests for success, 429→200, 502×3→error, invalid JSON, timeout, cache hit
(no second call), concurrency ≤ 2; cap boundary (`spent + est == cap` allowed, `>` not).

### T2.6 First real game (**go/no-go**)
One game, `typesafe/jev-1.14`, `clean` arm, vs `uci1500` (or an ε level if too strong), watched live
in the viewer. Expected ≈ $0.003–0.006. Record cost, latency, how it played, and whether the
estimate matched. **Stop here and ask Autumn whether to continue to Series.**

### T2.7 M1 experiments (≤ $0.05 total)
On 20 oracle positions: `slim` vs `full` picks and tokens; SAN history 16 vs none; `session_id`
on/off. Record in `SPIKE.md`.

## 5. M3 — Ladder and Series (the headline)

### T3.1 Ladder definitions
Level recipes (`METRICS.md` B2), `default_ladder.json` (nominal, `calibrated:false`), loader for
`data/ladder/ladder-vN.json`, `resolve(id) → Opponent`. **Accept:** all levels play a legal move from
the start; ε-levels reproducible per seed.

### T3.2 Calibration job
`chessdecide ladder calibrate`: schedule games (`METRICS.md` B2), run on a CPU worker pool (4),
persist `ladder_games`, fit Elo (quasi-likelihood, `uci1320` anchored at 1320, coordinate ascent
until max change < 0.5), write `ladder-vN.json`, print nominal-vs-measured. Resumable.
**Accept:** synthetic results from known Elos are recovered within 25; a real run completes (record
wall-clock).

### T3.3 Elo posterior (`packages/core/elo`)
Implement `METRICS.md` B3 literally. **Accept:** reproduces the worked-example table
(751/220–1150, 681/368–949, 733/518–933, prior 1233/196–2381) to ±1; more games never widen the
interval on consistent data; 0–5 and 5–0 blocks give finite estimates.

### T3.4 Series scheduler
Block loop (`METRICS.md` B4): choose level, generate games (colour alternation, paired openings from
`seed`), ≤ 2 in parallel, recompute the posterior after each game, publish `elo`; stop rules (Quick 25,
Standard 50, completion, budget, 3 consecutive aborted games); restart recovery; immutability once
finished; `random4` opening generator (eval within ±100 cp at depth 14, else resample).
**Accept (mock, fast engine):** Quick = exactly 25 finished games, Standard 50; completion stops at
the target or 200; budget stop leaves a resumable series with no double-counting; aborted games are
excluded; deterministic given `seed`.

### T3.5 Series API + UI
`API.md` §3.3–§3.5; new-series dialog, Series list, Series detail (Elo chart, blocks, games table,
mini boards). **Accept:** Playwright on the mock: Quick series updates the Elo card as games finish;
budget stop → raise cap → continues; overlapping arms show "not separable yet".

### T3.6 First real series
One Quick series, `jev-1.14 · clean` (≈ $0.10–0.15). Record Elo, interval, cost, wall-clock in `SPIKE.md`.

## 6. M4 — Publish and leaderboard

T4.1 leaderboard computation (`separated_from`, `P(A>B)` by grid convolution). T4.2 `chessdecide publish`:
copy finished series, games, plies, ladder into remote D1 via the D1 HTTP API or `wrangler d1 execute`,
idempotent by id, **excluding** raw request/response blobs, keys and settings. T4.3 read-only deployed
build (`CHESSDECIDE_MODE=public`): routes load from D1, control endpoints absent. T4.4 exports
(JSON/CSV/PGN). **Accept:** publish twice → no duplicates; public site renders a published series and
replays a game with no local server; exports re-import and reproduce the Elo to ±0.5.

## 7. M5 — Image arm (optional)

Board renderer (SVG from position, cburnett pieces, coordinates) → PNG; request builder per
`PROMPTS.md` §12 using the shape found in S2; `image` arm in the New game/series dialogs; leaderboard
labels it separately. **Accept:** renderer output is byte-stable for a fixed position (golden PNG hash);
request fixture byte-exact; one paid game with the image arm completes and is recorded.

## 8. M6 — Live runs on Cloudflare (phase 2)

`apps/live` Worker + `RunDO` using `stepGame` per alarm; `HttpEngine` adapter + a small Stockfish
HTTP service (container or server); secrets as Worker secrets; Cloudflare Access on control routes;
viewers attach over SSE. **Accept:** a mock game runs entirely in `wrangler dev` via alarms; the same
game state and ply rows match the local runner for a fixed seed.

## 9. M7 — Scale (phase 3)
`SchedulerDO`/Workflows fan-out, per-model rate limiters, container pool, remote runner Docker image.
Outline only until M6 is proven.

## 10. M8 — Later (outline only)
Model-vs-model matches (`METRICS.md` B8), other engines via `NativeUciEngine` config, position suite and
ablations, calibration curves, text arm (`TEXT_ARM.md`).

## 11. Known gotchas (from the spikes)

- `liquid/d1-ultra` returned 429 on back-to-back calls; limiter and backoff are mandatory.
- Pick is stable across repeats but probabilities drift ≈ 0.02: never compare probabilities exactly;
  keep a fixed option order within a game ply.
- `confidence ≈ P(pick)`; do not present them as independent signals.
- Jev slows above ~32 KB of text **and for any image**; log the request byte length per attempt and
  expect the image arm to differ for reasons unrelated to chess.
- Stockfish `UCI_LimitStrength` minimum is 1320; weaker play comes from our ε levels.
- `go movetime` makes ladder games timing-dependent: calibrate on an otherwise idle machine,
  `Threads=1`, record `ladder_movetime_ms` and reuse it in series games.
- Do not let the judge pool starve opponent engines: opponents are separate processes.
- D1/SQLite: batch ply + attempt writes in one transaction; never hold one across a network call.
- Workers cap subrequests at 50 per invocation: one `stepGame` per alarm in phase 2.

## 12. Reporting back
At the end of each milestone append to `docs/CHANGELOG.md`: what was built, deviations from the docs (and
why), measured numbers (oracle seconds, judge plies/s, game wall-clock, spend), and open questions. Ask
before changing a locked decision in `PLAN.md` §0.
