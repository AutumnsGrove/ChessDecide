# ChessDecide — API, types and schema

Backend: Go on `127.0.0.1:8080` (configurable `CHESSDECIDE_ADDR`). JSON everywhere, UTF-8.
Times are RFC 3339 UTC strings; durations are integer milliseconds; money is USD as a JSON
number (float64, 6 decimals shown in UI). Move ids are **UCI**; SAN is display-only.
The TS types mirror the Go structs 1:1 (`web/src/lib/types.ts`); field names are `snake_case`
in JSON.

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

## 2. Shared types (Go)

```go
type Arm struct {
    KeyFormat    string `json:"key_format"`    // "uci" | "san"
    Descriptor   string `json:"descriptor"`    // "plain" | "annotated"
    StateVariant string `json:"state_variant"` // "slim" | "full"
    Template     string `json:"template"`      // "neutral" | "instructive" | "minimal"
}
// Named presets: "clean" = {uci, plain, slim, neutral}; "hinted" = {san, annotated, slim, neutral}

type Money = float64

type Usage struct {
    InputTokens  int   `json:"input_tokens"`
    OutputTokens int   `json:"output_tokens"`
    CostUSD      Money `json:"cost_usd"`
}

type OptionProb struct {
    UCI       string  `json:"uci"`
    SAN       string  `json:"san"`
    P         float64 `json:"p"`                  // renormalised
    Cp        *int    `json:"cp,omitempty"`       // oracle, mover POV (filled after judge)
    Cpl       *int    `json:"cpl,omitempty"`
    WinLoss   *float64 `json:"win_loss,omitempty"` // pp
}

type Decision struct {
    ModelSlug     string       `json:"model_slug"`
    ReturnedModel string       `json:"returned_model"`
    Provider      string       `json:"provider"`
    Arm           string       `json:"arm"`             // "clean" | "hinted" | custom id
    PickUCI       string       `json:"pick_uci"`
    PPick         float64      `json:"p_pick"`
    Confidence    float64      `json:"confidence"`
    NOptions      int          `json:"n_options"`
    TopOptions    []OptionProb `json:"top_options"`     // top 8 by p, plus the pick and SF best if outside
    ProbSum       float64      `json:"prob_sum"`
    LatencyMS     int          `json:"latency_ms"`
    Usage         Usage        `json:"usage"`
    CacheHit      bool         `json:"cache_hit"`
    Retries       int          `json:"retries"`
    AttemptID     int64        `json:"attempt_id"`
}

type Judge struct {            // filled asynchronously after the ply
    Depth       int      `json:"depth"`
    BestUCI     string   `json:"best_uci"`
    BestSAN     string   `json:"best_san"`
    BestCp      int      `json:"best_cp"`
    PlayedCp    int      `json:"played_cp"`
    Cpl         int      `json:"cpl"`
    WinLoss     float64  `json:"win_loss"`        // pp
    Class       string   `json:"class"`           // "ok"|"inaccuracy"|"mistake"|"blunder"
    WhiteEvalCp int      `json:"white_eval_cp"`   // position AFTER the ply, White POV, clamped
    WDL         [3]int   `json:"wdl"`             // after the ply, White POV, per mille
    Acceptable  bool     `json:"acceptable"`
    PAcceptable *float64 `json:"p_acceptable,omitempty"` // model plies only
    EWinLoss    *float64 `json:"e_win_loss,omitempty"`
}

type Ply struct {
    Ply        int       `json:"ply"`             // 1-based
    Side       string    `json:"side"`            // "white" | "black"
    By         string    `json:"by"`              // "model" | "engine"
    UCI        string    `json:"uci"`
    SAN        string    `json:"san"`
    FENAfter   string    `json:"fen_after"`
    Decision   *Decision `json:"decision,omitempty"`  // model plies
    EngineInfo *struct {                              // engine plies
        LevelID   string `json:"level_id"`
        Elo       float64 `json:"elo"`          // ladder Elo of the level
        TimeMS    int `json:"time_ms"`
        Random    bool `json:"random"`         // true if an ε-random move replaced the engine move
    } `json:"engine_info,omitempty"`
    Judge      *Judge    `json:"judge,omitempty"`     // null until judged
    CreatedAt  time.Time `json:"created_at"`
}
```

## 3. Endpoints

### 3.1 System

`GET /api/health`

```json
{ "ok": true, "version": "0.1.0",
  "stockfish": { "ok": true, "path": "/opt/homebrew/bin/stockfish", "version": "Stockfish 19", "judge_workers": 4 },
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
  "black": { "type": "ladder", "level": "uci1500" },
  "opening": { "type": "startpos" },
  "pace_ms": 600,
  "budget_usd": 1.0,
  "judge_depth": 14,
  "max_plies": 200,
  "adjudicate": true,
  "seed": 12345
}
```

- `white`/`black` are **Player configs**: `{type:"model", model, arm}` (arm = preset name or a
  full `Arm`), or `{type:"ladder", level:"uci1500"|"eps30"|"random"|…}` (a ladder level — the
  normal opponent), or `{type:"engine", elo}` (raw `UCI_Elo` 1320–3190, outside the ladder).
  Both sides may be `model` (model-vs-model, M5).
- `opening`: `{type:"startpos"}` | `{type:"random4", seed: 12345}` (seed optional, generated
  and returned) | `{type:"fen", fen:"..."}` (custom start, used by "Play from here").
- Response `201`: the `Game` (below) with `status: "ready"`. Returns `402 budget_exceeded` if
  the estimate already exceeds the cap (`detail.est_cost_usd`).

```go
type Game struct {
    ID          string   `json:"id"`           // ULID
    Status      string   `json:"status"`       // see state machine
    StatusReason string  `json:"status_reason,omitempty"`
    Config      GameConfig `json:"config"`
    StartFEN    string   `json:"start_fen"`
    SeriesID    string   `json:"series_id,omitempty"`
    LevelID     string   `json:"level_id,omitempty"`      // ladder level the model faced
    ModelColor  string   `json:"model_color,omitempty"`
    Adjudicated bool     `json:"adjudicated"`
    Plies       []Ply    `json:"plies"`
    Result      string   `json:"result"`       // "1-0" | "0-1" | "1/2-1/2" | "*"
    Termination string   `json:"termination"`  // "checkmate"|"stalemate"|"repetition"|"fifty_move"|"insufficient"|"max_plies"|"adjudicated"|"aborted"|""
    Totals      GameTotals `json:"totals"`
    CreatedAt   time.Time `json:"created_at"`
}
type GameTotals struct {
    CostUSD Money `json:"cost_usd"`; ModelCalls int `json:"model_calls"`; CacheHits int `json:"cache_hits"`
    AcplWhite *float64 `json:"acpl_white,omitempty"`; AcplBlack *float64 `json:"acpl_black,omitempty"`
    PAcceptableMean *float64 `json:"p_acceptable_mean,omitempty"`
    Mistakes int `json:"mistakes"`; Blunders int `json:"blunders"`
    AvgLatencyMS int `json:"avg_latency_ms"`
}
```

`GET /api/games` → list of summaries (id, status, result, models, plies, cost, created_at).
`GET /api/games/{id}` → `Game`. `DELETE /api/games/{id}` → 204 (not allowed while running).
`GET /api/games/{id}/pgn` → `text/plain` PGN with `[White]`, `[Black]`, `[Result]`,
`[Event "ChessDecide"]`, and per-move comments `{[%eval 0.23] p=0.31}`.

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
| `judged` | `{ply, judge: Judge, decision_options?: OptionProb[]}` — fills oracle numbers |
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

```go
type Series struct {
    ID, Name, Model, Arm string
    Status       string   // created|running|paused|finished|stopped_budget|stopped_error|aborted
    StatusReason string
    Size         SeriesSize
    LadderVersion int
    Seed         int64
    BudgetUSD    Money; CostUSD Money
    Games        []SeriesGame     // summaries, in play order
    Blocks       []Block
    Elo          *EloEstimate     // null until the first finished game
    EloHistory   []EloPoint       // after each finished game, for the chart
    Secondary    SeriesStats
    CreatedAt    time.Time
}
type Block struct {
    Index int; LevelID string; LevelElo float64
    Games int; Score float64; PosteriorBefore, PosteriorAfter float64
}
type SeriesGame struct {
    GameID string; Index int; Block int; LevelID string; LevelElo float64
    ModelColor string // "white"|"black"
    Status string; Result string      // "1-0" etc.
    ModelScore *float64               // 1, 0.5, 0 once finished
    Termination string; Adjudicated bool; Plies int
    AcplModel *float64; CostUSD Money
}
type EloEstimate struct {
    Mean, Lo, Hi, HalfWidth float64
    Games int; W, D, L int; ScorePct float64
    TargetHalfWidth *float64
}
type EloPoint struct { Games int; Mean, Lo, Hi float64 }
type SeriesStats struct {
    Acpl, AcplMedian, AcceptableRate, MistakeRate, BlunderRate, MeanPAcceptable, MeanEWinLoss float64
    Brier, ECE float64; ScoreAsWhite, ScoreAsBlack float64
    AvgPlies float64; AdjudicatedFrac float64; CostPerGame Money
    LatencyP50, LatencyP95 int; AvgInputTokens int
}
```

Endpoints: `GET /api/series` (summaries), `GET /api/series/{id}`, `DELETE /api/series/{id}`
(not while running), `POST /api/series/{id}/pause` (finish in-flight games, no new ones),
`/resume`, `/stop` (cancel in-flight, status `aborted`; finished games are kept and the rating
stands), `PATCH /api/series/{id}` (`{budget_usd?, size?}` — raising the cap or switching a
Quick series to "completion" resumes it), `GET /api/series/{id}/export.json|csv`.

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

`POST /api/ladder/calibrate` → `202 {job_id}` (CPU only; refuses while a series runs);
`GET /api/ladder/calibrate/events` SSE: `progress {pair, done, total, eta_s}`, `levels`
(provisional fit), `done {version}`, `error`. `DELETE` not supported — ladders are versioned
files, a new calibration writes `ladder-v{N+1}.json`.

### 3.5 Leaderboard

`GET /api/leaderboard?ladder_version=1` → one row per arm (its latest finished or longest
series): `{ arm_id, model, arm, series_id, status, games, elo{mean,lo,hi}, w,d,l, score_pct,
acpl, acceptable_rate, blunder_rate, cost_usd, cost_per_game, separated_from: [arm_id…] }`
plus `reference` rows (random mover, ladder levels). `separated_from` lists arms whose 95 %
intervals do not overlap this one's; the UI never ranks arms that overlap.

`GET /api/leaderboard/compare?a=<arm_id>&b=<arm_id>` → `{ p_a_gt_b, diff_mean, diff_lo, diff_hi }`.

### 3.6 Later (M5, reserved)

`POST /api/matches` (arm vs arm), `GET /api/matches/{id}`, joint-fit leaderboard fields.
`Player` config already allows `{type:"model"}` on both sides, so no game schema change.

## 4. SQLite schema (`modernc.org/sqlite`, WAL, `foreign_keys=ON`)

Migrations are numbered SQL files embedded in the binary (`internal/store/migrations/NNNN_*.sql`),
applied at start-up in a transaction.

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
| `OPENROUTER_API_KEY` | — | read once at start; never logged, never sent to the browser |
| `CHESSDECIDE_ADDR` | `127.0.0.1:8080` | refuse non-loopback binds unless `CHESSDECIDE_ALLOW_REMOTE=1` |
| `CHESSDECIDE_DATA` | `./data` | DB, suites, exports |
| `STOCKFISH_PATH` | `stockfish` on PATH, then `/opt/homebrew/bin/stockfish` | |
| `CHESSDECIDE_JUDGE_WORKERS` | `min(4, NumCPU-2)` | |
| `CHESSDECIDE_MOCK` | `0` | `1` uses the mock provider (no key, no spend) |
