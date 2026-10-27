# ChessDecide — Implementation guide

**Audience: the implementing model.** Read in this order: `PLAN.md` → `METRICS.md` →
`PROMPTS.md` → `API.md` → `UI.md` → this file, then open `docs/mockups/index.html` in a browser.
These documents are normative. When something is ambiguous, **stop and ask** (or write the
question into `docs/QUESTIONS.md` and continue with the most conservative interpretation) —
do not invent behaviour. When you change behaviour, change the doc in the same commit.

## 0. Ground rules

**Stack**: Go 1.26 (no cgo), `github.com/corentings/chess/v2` v2.6.1, `modernc.org/sqlite`,
`github.com/oklog/ulid/v2`, stdlib `net/http` (1.22+ pattern routing), `log/slog`. Frontend:
SvelteKit + Svelte 5 + TypeScript strict, `chessground@9.2.1`, Vite, Bun or npm. Tests:
stdlib `testing` (table-driven). Stockfish from `STOCKFISH_PATH`/PATH (Stockfish 19).

**Conventions**

- Module name `chessdecide`. `gofmt` + `go vet` clean; `go test ./...` green before each commit.
- Every function that does I/O takes `context.Context` first. Errors are wrapped with `%w`
  and carry a typed `code` where the API exposes them (see `API.md` §1).
- Never log or persist the API key. Never send it to the browser. Do not print request
  headers.
- Money is `float64` USD parsed straight from `usage.cost`; never recompute it from tokens.
  Missing cost → NULL, not 0.
- Moves: canonical id is **UCI**; SAN only for display/hinted keys.
- All randomness is seeded and the seed is logged on the row it affects.
- JSON field names `snake_case`; times RFC 3339 UTC.
- Python (tools only): run with `uv run`, format with Black.
- Commit messages: present tense, first line < 50 chars. The user uses she/her pronouns.
- **Never spend money in tests.** Tests use `httptest` servers, fixtures, and the mock
  provider. A test that needs the network must be behind `-tags live` and read the key from env.

**Definition of done (every task)**: code + tests + doc updates + a note in
`docs/CHANGELOG.md`; the acceptance check listed in the task passes; `go test ./...` and (for
web) `npm run check && npm test` pass.

## 1. Core Go types (shared by all packages)

```go
// internal/chessx
type Position struct { FEN string; HistorySAN []string; hashHist []string /* for repetition */ }
type Move struct { UCI, SAN string; From, To string; Promo string; Capture, EP, Castle, Check, Mate bool; Piece, Captured string }
func Parse(fen string) (Position, error)
func (p Position) Legal() []Move                     // sorted by UCI ascending
func (p Position) Apply(uci string) (Position, error)
func (p Position) Outcome() Outcome                  // checkmate|stalemate|insufficient|threefold|fifty|none
func (m Move) DescPlain() string; func (m Move) DescAnnotated() string // PROMPTS.md §4

// internal/providers
type Arm struct { KeyFormat, Descriptor, StateVariant, Template string }
type MoveRequest struct {
    Position chessx.Position; Legal []chessx.Move; Arm Arm
    Seed int64; Repeat int; SessionID string
    Purpose string; GameID string; Ply int; SeriesID string
}
type AttemptMeta struct {
    AttemptID int64; ModelSlug, ReturnedModel, Provider string
    LatencyMS, InputTokens, OutputTokens, Retries int
    CostUSD *float64; CacheHit bool; RequestHash string
}
type MoveResponse struct {
    Move chessx.Move
    Probs map[string]float64   // keyed by UCI, renormalised; nil if absent
    Confidence float64; ProbSum float64
    Meta AttemptMeta; Raw json.RawMessage
}
type MoveProvider interface { ID() string; Move(ctx context.Context, r MoveRequest) (MoveResponse, error) }

// internal/engine
type Opponent interface { Move(ctx context.Context, pos chessx.Position) (uci string, info OpponentInfo, err error); Close() error }
// internal/game: a Player is either a MoveProvider-backed ModelPlayer or an Opponent-backed LadderPlayer.
type Player interface { Move(ctx context.Context, g *Game) (PlayerMove, error); Describe() PlayerDesc }
```

## 2. Milestone 1 — Go core (no UI)

### T1.0 Repo bootstrap
Files: `go.mod`, `Makefile` (`test`, `run`, `mock`, `lint`), `internal/config/config.go`
(env per `API.md` §5; refuse non-loopback bind), `.golangci.yml` optional, `docs/CHANGELOG.md`,
`docs/QUESTIONS.md`. **Accept:** `go build ./...` and `go test ./...` run green on an empty skeleton.

### T1.1 `chessx` + golden tests
1. Wrap `corentings/chess/v2`: `Parse`, `Legal` (sorted by UCI), `Apply`, SAN/UCI encoding,
   `Outcome` (threefold needs a hash history — key = FEN fields 1–4; 50-move from halfmove clock).
   Castling UCI must be the king move (`e1g1`); promotions `e7e8q`. Add `+`/`#` to SAN via
   applying the move and checking status.
2. Descriptors per `PROMPTS.md` §4 (piece names, capture, en passant, castles, promotion,
   check/checkmate for annotated).
3. `tools/gen_golden.py` (python-chess, `uv run --with chess`): generate
   `internal/chessx/testdata/golden.jsonl`, one JSON object per line:
   `{fen, legal:[{uci,san,plain,annotated}], outcome}` for ≥ 3,000 positions from seeded random
   games **plus** hand-picked edge cases (promotions incl. captures, en passant, both castles,
   pinned pieces, discovered check, stalemate, insufficient material, mate in 1, 60+ moves).
   The python script implements the descriptor grammar *independently* from the Go code.
4. `TestGolden` must match 100 %. **Accept:** golden test green; a perft test (startpos depth 4 = 197,281)
   green; any mismatch is a bug in Go, fix it there.

### T1.2 Prompt builders and response parser (`internal/providers/decisions`)
Implement `PROMPTS.md` §2–§9 exactly. `Build(req) (body []byte, keyToUCI map[string]string, order []string)`;
`Parse(resp []byte, keyToUCI) (MoveResponse parts, error)` with the typed errors of §8.
Fixtures in `testdata/` per §11 (**byte-exact** expected JSON for `clean` and `hinted`).
**Accept:** fixtures pass; changing one character of a description fails a test; `invalid_choice`,
`missing_answer`, `unexpected_type`, `invalid_probs`, `prob_sum_warn` are each covered.

### T1.3 Engine (`internal/engine`)
1. `Client`: spawn Stockfish, `uci`/`uciok`, `setoption`, `isready`/`readyok`, `ucinewgame`,
   `position fen …`, `go depth D` | `go movetime M`, parse `info … depth … score cp|mate … wdl W D L … pv …`
   keeping the last line at the greatest depth with `multipv 1`; read until `bestmove`. Line-reader
   goroutine; per-search timeout; if the process dies, restart once and retry; `Close` sends `quit`.
2. `Opponent` implementations: `StockfishOpponent{elo, movetimeMS}` (`UCI_LimitStrength`, `UCI_Elo`,
   `Threads=1`, `Hash=32`) and `EpsOpponent{eps, inner, rng}` (probability ε → uniformly random legal move,
   else inner) and `RandomOpponent`. `OpponentInfo` reports whether a random move replaced the engine move.
3. `JudgePool`: `N = min(4, NumCPU-2)` clients (`Threads=1`, `Hash=64`, `UCI_ShowWDL=true`); a work queue;
   `Submit(ctx, job) <-chan result`.
**Accept (needs stockfish; skip with a clear message if absent):** `bestmove` for the M0 mate-in-1 FEN is
`h5f7`; WDL parsed; `UCI_Elo` 1320 vs 2800 over 20 games (50 ms) → 2800 wins ≥ 18; EpsOpponent(ε=1)
== uniform over legal moves (chi-square on 2,000 draws); killing the process mid-search recovers.

### T1.4 Oracle (`internal/oracle`)
Implement `METRICS.md` §3 exactly (child-position search, mover POV, clamp ±1000, wp from WDL, terminal
children handled directly), cache table `oracle_moves` keyed
`(position_hash, sf_version, depth, hash_mb, threads, uci)`. API: `Evaluate(ctx, pos, depth) (Oracle, error)`
with derived `best`, `cpl`, `wl`, sets, `Class(wl)`; also `PlayedJudge(oracle, playedUCI) Judge` (fields of `API.md` `Judge`).
**Accept:** on the mate-in-1 FEN `h5f7` has `cp=1000`, `wp=100`, best; CPL of the best move is exactly 0 and
`wl ≥ 0` for every move (property test on 200 random positions); second call is a pure cache hit (no engine
use); for the SPIKE §3 "Quiet Italian" the best-set contains `Re1`, `h3`, `b4`. Record oracle seconds per
position at depth 14 and 18 in `docs/CHANGELOG.md` (open question 6/10).

### T1.5 Store (`internal/store`)
Embedded numbered migrations = `API.md` §4 DDL. WAL, `foreign_keys=ON`, one writer connection + read pool.
Typed queries for games/plies/attempts/series/ladder. **Accept:** migrations apply to an empty DB twice (idempotent
runner), CRUD tests on in-memory SQLite, spend aggregation correct with `cache_hit` rows.

### T1.6 OpenRouter client (`internal/openrouter`)
1. `Catalog`: `GET /api/v1/models?output_modalities=decisions` (public), 1 h cache, map to `ModelInfo`
   (`slug`, `canonical_slug`, `context_length`, `price_in_per_m`, modalities); roster flags.
2. `Decisions.Create(ctx, body) (respBytes, status, headers, error)`: auth header from config, `X-Title`, 60 s timeout.
3. Retry/backoff/limiter/cache per `PROMPTS.md` §9: per-slug semaphore 2, ≤ 4 req/s token bucket, 429 halves concurrency
   for 60 s, `Retry-After`, ±20 % jitter, every HTTP call → `attempts` row (`retry_of`), cache by request hash.
4. `GET /api/v1/key` probe for remaining credit (M1 open question 5); tolerate failure.
**Accept:** `httptest` servers for: success, 429→200, 502×3→error, invalid JSON, slow response (timeout), cache hit
(no second HTTP call), concurrency never exceeds 2 (counter). No real network in tests.

### T1.7 Budget (`internal/budget`)
Estimator (`PROMPTS.md` §10) with rolling-mean calibration from `attempts`, `Check(cap, spent, estNext)`,
ledger queries (session/today/all). **Accept:** table tests incl. calibration switch at 20 attempts and the
cap boundary (`spent + est == cap` is allowed, `>` is not).

### T1.8 Providers
`decisions.Provider` (builds → client → parse → map back to UCI), `mock.Provider`: deterministic given
`(fen, seed)`, picks via softmax over a cheap heuristic (material after the move + centre control) with
temperature 1.0 (normal play) and a `CHESSDECIDE_MOCK_FAIL` env controlling injected 429/502 rates and a
latency distribution (300–1200 ms, `0` in tests). Returns realistic `Probs`, `Confidence`, `Meta` (cost
computed from fake tokens × $0.042/M). **Accept:** same input → same output; failure injection reproducible by seed.

### T1.9 CLI + M1 experiments
`cmd/chessdecide` subcommands: `serve` (later), `probe --model M --arm clean --fen F` (one paid call; prints pick,
P, latency, tokens, cost), `game --model M --arm clean --level uci1500 [--mock]` (headless full game via the
orchestrator interface stub: loop `Player.Move` until termination, judge each ply at depth 14, write to DB, print PGN
and totals), `m1 questions` (≤ $0.05: on 20 oracle positions compare `slim` vs `full` state picks and tokens; SAN
history 16 vs none; `session_id` on/off; prints a table to paste into `docs/SPIKE.md` §M1).
**Accept:** `game --mock` completes in < 60 s with a PGN; with the real key one game costs < $0.02 and the ledger
matches `usage.cost`; M1 question results recorded in `docs/SPIKE.md`.

## 3. Milestone 2 — Single games, API, Viewer

### T2.1 Game orchestrator (`internal/game`)
States and transitions exactly as `API.md` §3.2. Loop (per ply): decide player → `Move(ctx)` (budget
`Check` first; `thinking` event; retry events from the client) → apply move → persist `plies` row → publish
`ply` → submit judge job → on result persist `judge_json`, publish `judged`, evaluate **adjudication**
(`METRICS.md` B1) and termination. Pacing: ensure ≥ `pace_ms` between `ply` events. One goroutine per game;
`Step` runs exactly one ply; `Pause` waits for the in-flight ply; `Stop` cancels its context. On start-up, games
left `running` become `paused` (`server_restart`). Serialise state changes with a mutex; SSE hub fan-out with
per-subscriber buffered channels (drop-and-resync slow consumers via `snapshot`).
**Accept (mock provider, no network):** 10 games × 2 concurrent complete with correct terminations; Step/Pause/
Stop/restart-recovery tests; budget stop at the cap boundary; adjudication triggers on a scripted position
sequence; PGN export round-trips through python-chess in a golden test.

### T2.2 HTTP API (`internal/api`)
Implement `API.md` §3.1–§3.2 (health, models, estimate, spend, positions/validate, oracle, games, SSE) with
the error envelope and `Last-Event-ID` replay. Serve `web/build` when present. **Accept:** `httptest` end-to-end:
create game (mock) → open SSE → `auto` → receive `snapshot`, `thinking`, `ply`, `judged`, `status` in order →
`GET /api/games/{id}` equals the SSE-built state.

### T2.3 Web scaffold
`web/` SvelteKit (SPA: `adapter-static`, `ssr=false`, `fallback: index.html`), Vite proxy `/api` →
`127.0.0.1:8080`, port `app.css` tokens, app shell + nav, `types.ts` mirroring `API.md`, stores
(`game.svelte.ts` SSE with reconnect/`Last-Event-ID`, `spend`, `catalog`, `settings`).
**Accept:** `npm run check` clean; shell renders with health chips against the mock server.

### T2.4 Viewer
Components per `UI.md` §5 and behaviour per §6. Build **replay first** (load a finished game, transport, graph,
move list, decision panel), then **live attach**. Match the mockup pixel-for-pixel in tokens/layout.
**Accept (Playwright, mock server):** scripted tests — load game; `→` ×5 advances 5 plies; `Home`/`End`; space
autoplays and stops at the end; clicking the eval graph seeks; "pause on mistakes" stops on a flagged ply; live
game: new plies follow when attached, stop following after `←`, pill shows `+N`, `End` re-attaches; screenshots
of replay + live + each banner state compared against stored baselines (manual approval).

### T2.5 Games list, New game dialog, banners
Games table + filters, dialog with live `/api/estimate`, banners (retry/error/budget), no-key and empty states.
**Accept:** every row of the `UI.md` §7 state table has a Playwright test.

### T2.6 Real run
With the real key: a 60-ply game vs `uci1500` (uncalibrated ladder allowed) watched live in the browser; ledger,
estimate and actual cost agree within the estimator's stated conservatism; update `SPIKE.md`.

## 4. Milestone 3 — Ladder and Series (the headline)

### T3.1 Ladder definitions (`internal/ladder`)
Level recipes (`METRICS.md` B2), `default_ladder.json` (nominal Elos, `calibrated:false`), loader for
`data/ladder/ladder-vN.json`, `Resolve(id) engine.Opponent`. **Accept:** all 12 levels construct and play a legal move
from the start position; ε-levels reproducible per seed.

### T3.2 Calibration job
`chessdecide ladder calibrate` and `POST /api/ladder/calibrate`: schedule games (`METRICS.md` B2), run on a CPU
worker pool (4), persist `ladder_games`, fit Elo (maximise quasi-likelihood with `uci1320` anchored at 1320; use the
same grid routine, treating each level as a free parameter via coordinate ascent until max change < 0.5 Elo),
write `ladder-vN.json`, print the nominal-vs-measured table and warnings. Resumable (skips finished pairs).
**Accept:** on a synthetic set of results generated from known Elos the fit recovers them within 25; a real run
completes (record wall-clock in `CHANGELOG`); a SPIKE note records how far measured Elo deviates from nominal.

### T3.3 Elo posterior (`internal/series/elo.go`)
Implement `METRICS.md` B3 literally. **Accept:** reproduces the worked-example table (751/220–1150,
681/368–949, 733/518–933, prior 1233/196–2381) to ±1; property tests: more games never widen the interval on
consistent data; 0–5 and 5–0 blocks give finite estimates.

### T3.4 Series scheduler (`internal/series`)
Create/validate configs; block loop (`METRICS.md` B4): choose the level, generate games (colour alternation,
paired openings from `seed`), run ≤ 2 in parallel through the orchestrator, recompute the posterior after each
game, publish `elo`; stop rules (Quick 25, Standard 50, completion, budget, 3 consecutive aborted games);
restart recovery (in-flight games `paused`; the scheduler resumes the block); `PATCH` extend/raise-cap;
immutability once finished; opening generator `random4` (4 random legal plies, accept only if depth-14 eval within
±100 cp, else resample with the next sub-seed).
**Accept (mock, fast engine):** a Quick series completes with exactly 25 finished games; Standard 50;
"completion" stops at the target or 200 games; a budget stop mid-block leaves a resumable series and no game is
double-counted; aborted games are excluded from the posterior; restart mid-series resumes correctly;
deterministic given `seed` (same sequence of levels, colours, openings).

### T3.5 Series API + SSE
`API.md` §3.3–§3.5 endpoints, events, estimate (`typical` + `worst_case`), leaderboard with `separated_from`.
**Accept:** `httptest` end-to-end with mock; `GET /api/series/{id}` equals the SSE-built state.

### T3.6 Series UI
New-series dialog, Series list (ladder axis + leaderboard), Series detail (cards, Elo chart, blocks, live mini boards,
games table). Mini boards subscribe to the game SSE of the 2 running games; clicking opens the Viewer.
**Accept:** Playwright against the mock server: start a Quick series → Elo card updates as games finish →
finished state; budget stop → raise cap → continues; overlapping arms show "not separable yet".

### T3.7 First real series
Run one Quick series for `jev-1.14 · clean` with the real key (ladder v1 calibrated). Expected spend ≈ $0.10–0.15.
Record the Elo, interval, cost and wall-clock in `SPIKE.md`; sanity-check against the 10-game pilot guess.

## 5. Milestone 4 — Leaderboard and polish

T4.1 leaderboard computation (`separated_from`, overlap, `P(A>B)` from grid convolution); T4.2 exports (JSON/CSV)
and PGN bundle; T4.3 "Extend to completion" flow; T4.4 cross-series filters (ladder version); T4.5 README update with
screenshots; T4.6 a `make demo` target that starts the server in mock mode with a pre-baked series so the UI can be
shown without a key. **Accept:** exports re-import into a notebook and reproduce the displayed Elo to ±0.5.

## 6. Later (outline only — do not build in v1)

M5: model-vs-model matches (`METRICS.md` B8), position suite + ablations (`PROMPTS.md` ablation arms), calibration
curves, Elo-vs-cost scatter, optional position lab. M6: text arm (`TEXT_ARM.md`).

## 7. Known gotchas (from the spikes)

- `liquid/d1-ultra` returned 429 on back-to-back calls; the limiter and backoff are mandatory, not optional.
- Pick is stable across repeats but probabilities drift ≈ 0.02: never compare probabilities exactly; keep a fixed
  option order within a game ply.
- `confidence ≈ P(pick)`; don't present them as independent signals.
- Jev's output tokens grow with option count but are free; only `usage.cost` counts.
- Jev slows above ~32 KB — we are far below, but log the request byte length on every attempt.
- A 63-option request is ~15 KB in `full` state; `slim` is smaller. The M0 "63 legal moves" position was synthetic;
  real games rarely exceed 45.
- Stockfish `UCI_LimitStrength` minimum is 1320; weaker play comes only from our ε levels.
- `go movetime` makes ladder games timing-dependent (CPU load changes strength). Run calibration with the machine
  otherwise idle, keep `Threads=1`, and record `ladder_movetime_ms`; series games reuse the same value.
- Do not let the judge pool starve the opponent engines: opponents are separate processes with their own budget.
- SQLite: one writer; batch ply + attempt writes in a transaction; never hold a transaction across a network call.

## 8. Reporting back

At the end of each milestone append to `docs/CHANGELOG.md`: what was built, deviations from the docs (and why),
measured numbers (oracle seconds, judge plies/s, game wall-clock, spend), and open questions. Ask before changing a
locked decision in `PLAN.md` §0.
