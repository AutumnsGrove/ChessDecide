# ChessDecide — API, types and schema

HTTP surface implemented once in `packages/api` (Hono, `createApi`) and hosted by (a) the Node
runner daemon on `127.0.0.1:8731` (local mode; `vite dev` proxies `/api` to it), (b) a SvelteKit
route in the deployed read-only site, and (c) in phase 2 the `apps/live` Worker. JSON
everywhere, UTF-8. Times are ISO 8601 UTC strings; durations are integer milliseconds; money is
USD as a JSON number (6 decimals shown in UI). Move ids are **UCI**; SAN is display-only. Field
names are `snake_case` in JSON; the TypeScript types below live in `packages/core/src/types.ts`
and are shared by runner, server and UI.

**Surface by mode** (`CHESSDECIDE_MODE`):

| Mode | Available |
| --- | --- |
| `local` (phase 1 dev) | everything below |
| `public` (deployed, read-only, free tier) | `GET` of games, series, ladder, leaderboard, exports; **no** control, estimate, oracle, spend, catalog or SSE-for-live endpoints |
| `live` (phase 2) | everything, behind Cloudflare Access; runs hosted in Durable Objects |

## 1. Conventions

**Errors** — every non-2xx response:

```json
{ "error": { "code": "budget_exceeded", "message": "Estimated $1.20 exceeds cap $1.00", "retryable": false, "detail": {} } }
```

| HTTP | `code` examples |
| --- | --- |
| 400 | `bad_request`, `invalid_fen`, `invalid_config` |
| 402 | `budget_exceeded` |
| 404 | `not_found` |
| 409 | `conflict` (e.g. step while a move is in flight; game finished) |
| 424 | `no_api_key`, `engine_unavailable` |
| 429 | `rate_limited` (upstream), `retryable: true` |
| 502 | `upstream_error` (OpenRouter), `retryable: true` |
| 500 | `internal` |

**SSE** — `Content-Type: text/event-stream`. Each event: `id: <seq>`, `event: <name>`,
`data: <json>`. On connect the server sends a `snapshot` event, then live events; clients
reconnect with `Last-Event-ID` and the server replays missed plies from the database.
Heartbeat comment line `: ping` every 15 s.

**Idempotency** — `POST /step`, `/auto`, `/pause`, `/stop` are safe to repeat; a conflicting
call returns `409` with the current `status`.

## 2. Shared types (TypeScript)

```ts
export interface Arm {
  interface: 'text' | 'image';
  key_format: 'uci' | 'san';
  descriptor: 'plain' | 'annotated';
  state_variant: 'slim' | 'full';
  template: 'neutral' | 'instructive' | 'minimal';
}
// Presets: clean = {text, uci, plain, slim, neutral}; hinted = {text, san, annotated, slim, neutral};
//          image = {image, uci, plain, slim, neutral}

export type Money = number;
export interface Usage { input_tokens: number; output_tokens: number; cost_usd: Money | null }

export interface OptionProb {
  uci: string; san: string;
  p: number;                 // renormalised
  cp?: number; cpl?: number; // oracle, mover POV (filled after judge)
  win_loss?: number;         // pp
}

export interface Decision {
  model_slug: string; returned_model?: string; provider?: string;
  arm: string;               // "clean" | "hinted" | "image" | custom id
  pick_uci: string; p_pick?: number; confidence?: number; n_options: number;
  top_options: OptionProb[]; // top 8 by p, plus the pick and SF best if outside
  prob_sum?: number; latency_ms: number; usage: Usage;
  cache_hit: boolean; retries: number; attempt_id: number;
}

export interface PositionEval {   // every ply, White POV, position AFTER the ply
  depth: number; white_eval_cp: number;        // clamped [-1000, 1000]; forced mate = +-1000
  wdl: [number, number, number];               // [W, D, L] per mille
}
export interface Judge {         // MODEL plies only (full per-move oracle); engine plies have judge = null
  depth: number; best_uci: string; best_san: string; best_cp: number; played_cp: number;
  cpl: number; win_loss: number;                    // pp
  class: 'ok' | 'inaccuracy' | 'mistake' | 'blunder';
  acceptable: boolean; p_acceptable?: number; e_win_loss?: number;
}

export interface Ply {
  ply: number;               // 1-based
  side: 'white' | 'black';
  by: 'model' | 'engine';
  uci: string; san: string; fen_after: string;
  decision?: Decision;       // model plies
  engine_info?: { engine_id: string; level_id: string; elo: number; time_ms: number;
                  random: boolean /* ε-random replaced the engine move */ };
  forced?: boolean;          // exactly one legal move: no model call
  eval?: PositionEval | null;
  judge?: Judge | null;      // null until judged
  created_at: string;
}
```

## 3. Endpoints

### 3.1 System

`GET /api/health`

```json
{ "ok": true, "version": "0.1.0", "mode": "local",
  "engine": { "ok": true, "adapter": "native-uci", "path": "/opt/homebrew/bin/stockfish", "version": "Stockfish 19", "judge_workers": 4 },
  "openrouter": { "key_present": true, "catalog_age_s": 120 },
  "ladder": { "version": 1, "calibrated": true },
  "budget": { "session_usd": 0.0031, "today_usd": 0.0112, "total_usd": 0.0412, "credit_remaining_usd": null } }
```

`GET /api/models?kind=decisions` — live catalog (cached 1 h, public endpoint, no key needed).

```json
[ { "slug": "typesafe/jev-1.14", "canonical_slug": "typesafe/jev-1.14-20261001", "name": "Jev 1.14",
    "context_length": 262144, "price_in_per_m": 0.042, "input_modalities": ["text","image"],
    "roster": true, "disabled_reason": null } ]
```

`roster` marks the default models (Jev, D1 Ultra). `disabled_reason` is a human sentence when
a model cannot take the request (e.g. "Context 8,192 tokens < estimated 3,100 × safety").

`POST /api/estimate` — body is a game or series config (§3.2–3.3); returns:

```json
{ "calls": 30, "est_input_tokens": 66000, "est_cost_usd": 0.0028, "cap_usd": 1.0,
  "over_cap": false, "basis": "conservative formula",
  "breakdown": [ { "model": "typesafe/jev-1.14", "arm": "clean", "calls": 30, "est_cost_usd": 0.0028 } ] }
```

`GET /api/spend?since=session|today|all` → `{ "usd": 0.0031, "calls": 24, "cache_hits": 3 }`

`POST /api/positions/validate` `{ "fen": "..." }` or `{ "pgn": "..." }` (+ optional
`"ply": 17`) → `{ "fen", "side_to_move", "legal_count", "history_san", "game_over": false }`
or `400 invalid_fen`.

`GET /api/oracle?fen=...&depth=14` — returns per-move oracle rows (computes and caches if
missing; may take seconds). `{ "depth":14, "sf_version":"Stockfish 19", "best_uci":"...", "moves":[ {"uci","san","cp","wp","cpl","win_loss","mate_in"} ] }`

### 3.2 Games

`POST /api/games`

```json
{
  "white": { "type": "model", "model": "typesafe/jev-1.14", "arm": "clean" },
  "black": { "type": "ladder", "level": "uci1500", "engine": "stockfish" },
  "opening": { "type": "startpos" },
  "pace_ms": 600,
  "budget_usd": 1.0,
  "judge_depth": 14,
  "max_plies": 200,
  "adjudicate": true,
  "seed": 12345
}
```

- `white`/`black` are **Player configs**: `{type:"model", model, arm}` (`arm` may be `"image"`) (arm = preset name or a
  full `Arm`), or `{type:"ladder", level:"uci1500"|"eps30"|"random"|…}` (a ladder level — the
  normal opponent), or `{type:"engine", elo}` (raw `UCI_Elo` 1320–3190, outside the ladder).
  Both sides may be `model` (model-vs-model, M5).
- `opening`: `{type:"startpos"}` | `{type:"random4", seed: 12345}` (seed optional, generated
  and returned) | `{type:"fen", fen:"..."}` (custom start, used by "Play from here").
- Response `201`: the `Game` (below) with `status: "ready"`. Returns `402 budget_exceeded` if
  the estimate already exceeds the cap (`detail.est_cost_usd`).

```ts
export interface Game {
  id: string;                // ULID
  status: 'created' | 'ready' | 'running' | 'paused' | 'stopped_budget' | 'finished' | 'aborted';
  status_reason?: string;
  config: GameConfig; start_fen: string;
  series_id?: string; level_id?: string; model_color?: 'white' | 'black';
  adjudicated: boolean; plies: Ply[];
  result: '1-0' | '0-1' | '1/2-1/2' | '*';
  termination: 'checkmate' | 'stalemate' | 'repetition' | 'fifty_move' | 'insufficient'
             | 'max_plies' | 'adjudicated' | 'aborted' | '';
  totals: GameTotals; created_at: string;
}
export interface GameTotals {
  cost_usd: Money; model_calls: number; cache_hits: number;
  acpl_white?: number; acpl_black?: number; p_acceptable_mean?: number;
  mistakes: number; blunders: number; avg_latency_ms: number;
}
```

`GET /api/games` → list of summaries (id, status, result, models, plies, cost, created_at).
`GET /api/games/{id}` → `Game`. `DELETE /api/games/{id}` → 204 (not allowed while running).
`GET /api/games/{id}/pgn` → `text/plain` PGN with `[White]`, `[Black]`, `[Result]`,
`[Event "ChessDecide"]`, and per-move comments `{[%eval 0.23] p=0.31}` (the `p=` half only for a
real model pick). Model/Arm/Level/CostUSD tags; `SetUp`/`FEN` for a non-standard start; move numbers
follow the starting FEN's fullmove number. All four export routes are read-only and exist in `public`
mode.

Control (all return the current `Game` summary `{id,status,status_reason}`):

| Method | Path | Effect |
| --- | --- | --- |
| POST | `/api/games/{id}/step` | play exactly one ply (the side to move); status stays `paused` |
| POST | `/api/games/{id}/auto` | body `{ "pace_ms": 600 }` optional; start/continue autoplay → `running` |
| POST | `/api/games/{id}/pause` | finish the in-flight ply, then `paused` |
| POST | `/api/games/{id}/stop` | cancel in-flight call; status `aborted`, terminal |
| PATCH | `/api/games/{id}` | `{ pace_ms?, budget_usd? }` — raising the budget resumes from `stopped_budget` into `paused` |

**State machine**

```
created → ready ─step→ paused ─step→ paused …
            │  └─auto→ running ─pause→ paused
            │                 ├─ checkmate/draw rule → finished
            │                 ├─ transport error after retries → paused (reason "error")
            │                 ├─ spent+est_next > cap → stopped_budget
            │                 └─ stop → aborted
 server restart: running → paused (reason "server_restart")
```

Terminal: `finished`, `aborted`. `stopped_budget` and `paused` are resumable.

**Events** `GET /api/games/{id}/events`

| `event` | `data` |
| --- | --- |
| `snapshot` | full `Game` |
| `thinking` | `{ply, side, by, model?, arm?, attempt, started_at}` |
| `retry` | `{ply, attempt, max, reason: "429"|"5xx"|"network"|"invalid_choice", wait_ms}` |
| `ply` | `Ply` (judge may be null) |
| `judged` | `{ply, eval: PositionEval, judge: Judge \| null}` — fills oracle numbers |
| `status` | `{status, status_reason}` |
| `spend` | `{game_usd, session_usd, cap_usd}` |
| `error` | `{code, message, ply?}` |

### 3.3 Series

A series rates **one arm** against the Stockfish ladder (METRICS.md Part B).

`POST /api/series` → `201 Series`

```json
{
  "name": "jev-1.14 · clean · quick",
  "model": "typesafe/jev-1.14", "arm": "clean",
  "size": { "preset": "quick" },
  "ladder": { "mode": "adaptive" },
  "seed": 20261027,
  "budget_usd": 1.0, "concurrency": 2, "judge_depth": 14
}
```

- `size.preset`: `"quick"` (25) | `"standard"` (50) | `"completion"` (with optional
  `target_half_width` default 75, `min_games` 25, `max_games` 200). Also accepts
  `{ "preset": "custom", "games": 30 }`.
- `ladder.mode`: `"adaptive"` (default) or `"fixed"` with `"level": "uci1500"`.
- `seed` optional (generated and returned).
- `402 budget_exceeded` if even the *typical* estimate exceeds the cap; the *worst case*
  (all games reaching 200 plies) is returned in the estimate and shown as a warning only.

```ts
export interface Series {
  id: string; name: string; model: string; arm: string;
  status: 'created' | 'running' | 'paused' | 'finished' | 'stopped_budget' | 'stopped_error' | 'aborted';
  status_reason?: string; size: SeriesSize; ladder_version: number; seed: number;
  budget_usd: Money; cost_usd: Money;
  games: SeriesGame[];       // summaries, in play order
  blocks: Block[]; elo: EloEstimate | null;   // null until the first finished game
  elo_history: EloPoint[];   // after each finished game, for the chart
  secondary: SeriesStats; created_at: string;
}
export interface Block { index: number; level_id: string; level_elo: number; games: number;
  score: number; posterior_before: number; posterior_after: number }
export interface SeriesGame { game_id: string; index: number; block: number; level_id: string;
  level_elo: number; model_color: 'white' | 'black'; status: string; result: string;
  model_score?: 0 | 0.5 | 1; termination: string; adjudicated: boolean; plies: number;
  acpl_model?: number; cost_usd: Money }
export interface EloEstimate { mean: number; lo: number; hi: number; half_width: number;
  games: number; w: number; d: number; l: number; score_pct: number; target_half_width?: number }
export interface EloPoint { games: number; mean: number; lo: number; hi: number }
export interface SeriesStats { acpl: number; acpl_median: number; acceptable_rate: number;
  mistake_rate: number; blunder_rate: number; mean_p_acceptable: number; mean_e_win_loss: number;
  brier: number; ece: number; score_as_white: number; score_as_black: number; avg_plies: number;
  adjudicated_frac: number; cost_per_game: Money; latency_p50: number; latency_p95: number;
  avg_input_tokens: number }
```

Endpoints: `GET /api/series` (summaries), `GET /api/series/{id}`, `DELETE /api/series/{id}`
(not while running), `POST /api/series/{id}/pause` (finish in-flight games, no new ones),
`/resume`, `/stop` (cancel in-flight, status `aborted`; finished games are kept and the rating
stands), `PATCH /api/series/{id}` (`{budget_usd?, size?}` — raising the cap or switching a
Quick series to "completion" resumes it), `GET /api/series/{id}/export.json|csv`.

`export.json` is the full `Series` object. `export.csv` is one row per game, header
`index,block,level_id,level_elo,model_color,result,model_score,termination,adjudicated,plies,acpl,cost_usd,game_id`
(RFC 4180 quoting, empty field for null). Both send `Content-Disposition: attachment`.

**Events** `GET /api/series/{id}/events`

| `event` | `data` |
| --- | --- |
| `snapshot` | full `Series` |
| `block` | `{index, level_id, level_elo, reason: "nearest posterior mean"}` |
| `game_started` | `{game_id, index, block, level_id, model_color}` |
| `game_finished` | `SeriesGame` |
| `elo` | `{estimate: EloEstimate, point: EloPoint}` |
| `spend` | `{series_usd, cap_usd, session_usd}` |
| `status` | `{status, status_reason}` |
| `error` | `{code, message, game_id?}` |

Each series game is an ordinary game (`GET /api/games/{id}`, its own SSE feed), so the Viewer
opens it unchanged.

`POST /api/estimate` accepts a series config too and returns `typical` and `worst_case`
objects (`calls`, `est_cost_usd`) plus `over_cap_typical`/`over_cap_worst` booleans.

### 3.4 Ladder

`GET /api/ladder` → `{ version, calibrated, movetime_ms, sf_version, calibrated_at, levels: [ {id, kind, label, elo, se, games} ] }`

In `public` mode there is no ladder file: the route rebuilds the ladder from the published
`ladder_levels` rows for the highest ladder version that has a finished series (`calibrated` is true
when that version > 0; `movetime_ms` and `sf_version` are nominal). With nothing published it is
404 `not_available` and the leaderboard falls back to the nominal ladder.

`POST /api/ladder/calibrate` → `202 {job_id}` (CPU only; refuses while a series runs);
`GET /api/ladder/calibrate/events` SSE: `progress {pair, done, total, eta_s}`, `levels`
(provisional fit), `done {version}`, `error`. `DELETE` not supported — ladders are versioned
files, a new calibration writes `ladder-v{N+1}.json`.

### 3.5 Leaderboard

`GET /api/leaderboard?ladder_version=1` → `{ ladder: {version, calibrated}, rows, reference }`.
Without the query parameter the version is the daemon's loaded ladder locally, and in `public` mode
the highest published version that has a finished series (so the deployed leaderboard is never empty
just because the series were rated on v2).
One row per arm (its latest finished, else longest, series on that ladder version):
`{ arm_id, model, arm, series_id, status, games, elo{mean,lo,hi,half_width}, w,d,l, score_pct,
acpl, acceptable_rate, blunder_rate, cost_usd, cost_per_game, separated_from: [arm_id…] }`.
An `arm_id` is **model + arm** (`liquid/d1-ultra#hinted`), so the same preset on two models is two
rows. `reference` rows are the ladder levels (random mover, ε levels, Stockfish levels) with the
Elo of the loaded ladder file. `separated_from` lists arms whose 95 % intervals do not overlap this
one's; the UI never ranks arms that overlap.

`GET /api/leaderboard/compare?a=<arm_id>&b=<arm_id>` → `{ p_a_gt_b, diff_mean, diff_lo, diff_hi }`.

`GET /api/leaderboard/export.csv` → one row per arm:
`arm_id,model,arm,series_id,status,games,elo_mean,elo_lo,elo_hi,w,d,l,score_pct,acpl,acceptable_rate,blunder_rate,cost_usd`.

### 3.6 Later (M5, reserved)

`POST /api/matches` (arm vs arm), `GET /api/matches/{id}`, joint-fit leaderboard fields.
`Player` config already allows `{type:"model"}` on both sides, so no game schema change.

## 4. SQLite / D1 schema

This SQL is canonical. `packages/db` expresses it in Drizzle (`sqlite-core`); `drizzle-kit`
generates numbered migrations that are applied to local SQLite/D1 and to remote D1 unchanged.
Use only features D1 supports (no extensions; rows ≤ 2 MB). `request_gz`/`response_gz` (raw
bodies) are **local-only**: they are never published, and in phase 2+ move to R2. Add
`engine_id TEXT` to `games` (default `stockfish`) and `interface TEXT` to `attempts`.

```sql
CREATE TABLE models_snapshot (
  id INTEGER PRIMARY KEY, slug TEXT NOT NULL, canonical_slug TEXT, name TEXT,
  context_length INTEGER, price_in_per_m REAL, input_modalities TEXT, catalog_json TEXT,
  captured_at TEXT NOT NULL);

CREATE TABLE positions (
  id INTEGER PRIMARY KEY, hash TEXT NOT NULL UNIQUE,            -- sha256(fen without move counters)
  fen TEXT NOT NULL, history_san TEXT,                          -- JSON array
  stratum TEXT, source TEXT, side_to_move TEXT, legal_count INTEGER,
  decisive INTEGER, gap_pp REAL, mirror_of INTEGER REFERENCES positions(id), suite TEXT);

CREATE TABLE oracle_moves (                                      -- one row per (position, depth, move)
  position_hash TEXT NOT NULL, sf_version TEXT NOT NULL, depth INTEGER NOT NULL,
  hash_mb INTEGER NOT NULL, threads INTEGER NOT NULL,
  uci TEXT NOT NULL, san TEXT NOT NULL, cp INTEGER NOT NULL, wp REAL NOT NULL,
  mate_in INTEGER, pv TEXT,
  PRIMARY KEY (position_hash, sf_version, depth, hash_mb, threads, uci));

CREATE TABLE games (
  id TEXT PRIMARY KEY, status TEXT NOT NULL, status_reason TEXT, config_json TEXT NOT NULL,
  white_player TEXT NOT NULL, black_player TEXT NOT NULL,         -- JSON Player configs (generic)
  series_id TEXT REFERENCES series(id), series_index INTEGER, block_index INTEGER,
  level_id TEXT, level_elo REAL, model_color TEXT, model_score REAL, adjudicated INTEGER DEFAULT 0,
  start_fen TEXT NOT NULL, opening_seed INTEGER, result TEXT, termination TEXT,
  budget_usd REAL, cost_usd REAL DEFAULT 0, created_at TEXT NOT NULL, finished_at TEXT);

CREATE TABLE plies (
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE, ply INTEGER NOT NULL,
  side TEXT, by TEXT, uci TEXT, san TEXT, fen_after TEXT,
  attempt_id INTEGER REFERENCES attempts(id), decision_json TEXT, engine_json TEXT, judge_json TEXT,
  created_at TEXT, PRIMARY KEY (game_id, ply));

CREATE TABLE attempts (                                          -- ONE ROW PER HTTP CALL (or cache hit)
  id INTEGER PRIMARY KEY, created_at TEXT NOT NULL,
  purpose TEXT NOT NULL,                                         -- game|ladder|probe
  game_id TEXT, ply INTEGER, series_id TEXT, position_hash TEXT,
  model_slug TEXT NOT NULL, returned_model TEXT, provider TEXT,
  arm_id TEXT NOT NULL, key_format TEXT, descriptor TEXT, state_variant TEXT, template TEXT,
  prompt_version INTEGER, metrics_version INTEGER,
  repeat INTEGER DEFAULT 0, seed INTEGER, order_json TEXT, session_id TEXT, concurrency INTEGER,
  request_hash TEXT, cache_hit INTEGER DEFAULT 0, retry_of INTEGER REFERENCES attempts(id),
  status TEXT NOT NULL,                                          -- ok|error
  http_status INTEGER, error_code TEXT, error TEXT,
  pick_key TEXT, pick_uci TEXT, pick_san TEXT, p_pick REAL, confidence REAL,
  probs_json TEXT, prob_sum REAL,
  latency_ms INTEGER, input_tokens INTEGER, output_tokens INTEGER, cost_usd REAL,
  request_gz BLOB, response_gz BLOB);
CREATE INDEX attempts_req ON attempts(request_hash);
CREATE INDEX attempts_game ON attempts(game_id, ply);
CREATE INDEX attempts_series ON attempts(series_id);

CREATE TABLE series (
  id TEXT PRIMARY KEY, name TEXT, model_slug TEXT NOT NULL, arm_id TEXT NOT NULL, arm_json TEXT NOT NULL,
  status TEXT NOT NULL, status_reason TEXT, size_json TEXT NOT NULL, ladder_mode TEXT, ladder_level TEXT,
  ladder_version INTEGER NOT NULL, seed INTEGER, budget_usd REAL, cost_usd REAL DEFAULT 0,
  elo_mean REAL, elo_lo REAL, elo_hi REAL, w INTEGER DEFAULT 0, d INTEGER DEFAULT 0, l INTEGER DEFAULT 0,
  elo_history_json TEXT, blocks_json TEXT, catalog_snapshot_json TEXT,
  created_at TEXT NOT NULL, finished_at TEXT);

CREATE TABLE ladder_levels (
  ladder_version INTEGER NOT NULL, id TEXT NOT NULL, kind TEXT NOT NULL,   -- random|eps|uci
  params_json TEXT NOT NULL, elo REAL NOT NULL, se REAL, games INTEGER,
  PRIMARY KEY (ladder_version, id));

CREATE TABLE ladder_games (                                       -- calibration games (CPU only)
  id INTEGER PRIMARY KEY, ladder_version INTEGER NOT NULL, level_a TEXT NOT NULL, level_b TEXT NOT NULL,
  opening_seed INTEGER, a_color TEXT, result TEXT, plies INTEGER);

CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);   -- budget defaults, UI prefs
```

Spend = `SELECT SUM(cost_usd) FROM attempts WHERE cache_hit=0` filtered by time. A finished
series is immutable: `series.status IN ('finished','aborted')` rows reject game/Elo writes in
the store layer (exception: PATCH to extend a finished Quick/Standard series is *not* allowed;
start a new series or use "completion" from the start).

## 5. Configuration (env)

| Var | Default | Notes |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | — | `.env` locally, Worker secret in phase 2; never logged, never sent to the browser or published |
| `CHESSDECIDE_MODE` | `local` | `local` \| `public` \| `live` (see top of this doc) |
| `CHESSDECIDE_DATA` | `./data` | local DB, ladder files, exports |
| `STOCKFISH_PATH` | `stockfish` on PATH, then `/opt/homebrew/bin/stockfish` | `NativeUciEngine`; other UCI engines are extra config entries |
| `CHESSDECIDE_ENGINE_URL` | — | phase 2: `HttpEngine` base URL |
| `CHESSDECIDE_JUDGE_WORKERS` | `min(4, cores-2)` | |
| `CHESSDECIDE_MOCK` | `0` | `1` uses the mock provider (no key, no spend) |
| `CLOUDFLARE_*` | — | `publish` only: account id, D1 database id, API token |
