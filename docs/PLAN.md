# ChessDecide — Plan

A local harness for evaluating **decision models** (and text models for comparison) at chess,
with a live GUI and a reproducible benchmark mode.

Status: **design locked; M0 spikes passed (2026-10-27)**. No app code yet. See
[`SPIKE.md`](SPIKE.md) for measurements; the request format below is confirmed with the
adjustments in SPIKE.md §6.

## 0. Locked decisions (2026-10-27)

- **Name:** ChessDecide (renamed from ChessBench to avoid the DeepMind dataset collision).
- **v1 scope:** Play + Compare. Watchable games vs Stockfish, and same-position comparison
  across models/modes. The full batch benchmark runner follows after that.
- **Move set:** all legal moves only. No Stockfish shortlist, no random subset. Assisted
  shortlists are deferred as a later ablation (and must never share a leaderboard with `legal`).
- **Text models (standard set):** `deepseek/deepseek-v4.1-flash-1017`,
  `anthropic/claude-haiku-5.5`, `openai/gpt-6-luna`, `xiaomi/mimo-v2.6-flash`,
  `z-ai/glm-5.3-flash`, `meta/muse-spark-1.3-contributor`. All support tools + JSON schema;
  all are reasoning-capable.
- **Text protocols:** free-text SAN, forced tool call, JSON schema, and board image (image is
  a later milestone).
- **Reasoning is a recorded dimension.** Primary text arm runs at the lowest supported
  reasoning effort (`none` for DeepSeek/Claude/GPT/Mimo, `low`/`minimal` for GLM/Muse); a
  secondary arm runs at default effort. Never mix arms in one leaderboard.
- **API key:** available, with a spend cap.

### M0 outcome (details in SPIKE.md)

- 63 choice options accepted; probabilities sum to ~1; latency flat at ~0.5–0.9 s.
- Criteria order is preserved; the **pick is order-invariant**, but P(pick) shifts ±0.05–0.08.
- Repeated requests: pick stable 5/5; probabilities drift up to ~0.02 → use N=3 repeats.
- `choice` + `score` + `noul` in one request works on every decision model tested.
- Mate-in-1 is saturated (all models, P≈0.98); quiet positions are where the signal is.
- Text costs 10–40× more and is 3–50× slower once reasoning is on; reasoning effort is the
  dominant knob. Protocol retries/fallbacks are specified in SPIKE.md §5.

---

## 1. Thesis

Decision models (Jev, D1, MS Decision, etc.) answer *typed* questions about a `state`:
`choice`, `noul` (yes/no probability), `score` (ordered rubric). They are fast, cheap, and
emit no prose (output tokens are free). Chess is a near-perfect fit:

- the state is a FEN + small metadata,
- the question is "which of these legal moves is best?",
- the answer is one of a closed set of legal moves,
- ground truth is available from Stockfish.

So we can measure move quality, probability calibration, latency, and cost — cleanly and
cheaply. The interesting comparison is **decision model vs. text model forced into the same
decision** (free-text parse, forced tool call, or JSON schema), and **against Stockfish**.

Two lenses on quality:

1. **Move quality** (ACPL / top-1 / blunder rate) — how good is the pick?
2. **Distribution quality** (probability on the best move, expected CPL, calibration) —
   how much does the model *know* about its own pick? This is what only decision models give us.

---

## 2. What decision models actually are (constraints that shape the design)

From the OpenRouter docs (see `RESEARCH.md`):

- Endpoint: `POST https://openrouter.ai/api/alpha/decisions` (alpha, not `/api/v1`).
- Body: `{ model, state, questions, session_id?, user?, provider? }`.
- `state`: string, object, or array of text/image parts.
- `questions`: keyed object; each is `choice` (criteria map), `noul`, `score` (criteria array),
  or `box` (Jev 1.14 only).
- `choice` response: `{ choice, probabilities: {option: p}, confidence }`.
- `usage.output_tokens` is present but not billed; `cost` is input-only.
- 29 decision models live right now (2026-10); prices range **$0–$0.15 / M input tokens**.
- Context matters: e.g. `jaredpalmer/kev-4b` only 8k, `jev` 262k, `gpt-6-luna-decisions` 1M.
- Jev gets slower/less accurate when state+questions exceed ~32 KB of text
  (or when any image is present).

Important consequence: **a choice question constrains output to the options**, so illegal
moves are impossible for decision models and for tool-call/JSON text modes. "Illegal move
rate" is therefore a *text-mode* metric only; decision models need to be judged on move
quality + distribution quality instead.

---

## 3. Mapping chess onto the Decisions API

### 3.1 State

Keep it small, neutral, and identical across all modes. No engine evals, no hints.

```json
{
  "game": "chess",
  "fen": "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4",
  "side_to_move": "white",
  "move_number": 4,
  "history_san": ["e4", "e5", "Nf3", "Nc6", "Bc4"],
  "in_check": false,
  "legal_moves": [
    { "uci": "e1g1", "san": "O-O", "desc": "castle kingside: king to g1, rook to f1" },
    { "uci": "f3e5", "san": "Nxe5", "desc": "knight f3 captures pawn on e5" }
  ]
}
```

- FEN is canonical; SAN history is optional but helps (and can be ablated).
- `desc` is generated algorithmically from the move + board: piece, from→to, capture, check,
  mate, castle, promotion. Factual only. Same generator for every mode.
- Legal move list is given to **every** mode so we measure *choice*, not legal-move generation.
  (Add an ablation mode without the list for text models, to see the difference.)

### 3.2 Question

```json
{
  "move": {
    "type": "choice",
    "instructions": "Choose the strongest legal chess move for White in this position.",
    "criteria": {
      "O-O": "castle kingside (e1g1): king to g1, rook to f1",
      "Nxe5": "knight f3 captures pawn on e5 (f3e5)",
      "...": "one entry per legal move"
    }
  }
}
```

- Key = canonical SAN, description repeats SAN + UCI + facts. (Alternative: UCI keys. Test both.)
- All legal moves as options: typically 20–40, up to ~60 in rare positions.
- Add a `score` question in parallel when we want an eval estimate, and a `noul` question for
  tactics — same request, one round trip.

### 3.3 Option set: all legal moves

v1 always sends **every legal move** as a `choice` option. Rationale: purest test, no engine
leakage, and it measures how decision models handle 20–60 options — which is itself an open
question worth answering.

Deferred ablations (not in v1, never mixed into a `legal` leaderboard):

| Strategy | What it is | Why |
| --- | --- | --- |
| `topk` | Stockfish top-K (5/10/20) | tests whether option count is the bottleneck |
| `random-k` | random subset of K legal moves | control for `topk` |
| `staged` | choice of piece → choice of destination | fallback if 60 options breaks a model |

### 3.4 Order bias

JSON object key order may not be preserved by the API. We still need to know whether option
order affects the answer (LLMs often pick the first/last option). Plan:

1. Send the same position with `criteria` insertion orders A, B (reversed), C (shuffled, seeded).
2. Log the returned probabilities per option and the pick.
3. If the API canonicalizes order (e.g. sorts keys), detection reduces to key-name effects:
   compare SAN keys vs opaque keys (`m01`, `m02`, ...). If opaque keys are used, map them in
   the state, not in criteria descriptions.
4. Measure **position bias** = P(pick is first/last listed) vs. uniform expectation.

### 3.5 Prompt/criteria variants

Keep a small, versioned set of templates (default: neutral). Run the benchmark once per
template; report the template as a dimension. Do not tune per model.

- `neutral`: "Choose the strongest legal move."
- `instructive`: adds "Avoid losing material; prioritize checks, captures, and threats."
- `minimal`: just the state + "Best move?".
- `blind`: no legal move list in state (text modes only).

---

## 4. Benchmark design

### 4.1 Tasks

| Task | API primitive | Ground truth | Metrics |
| --- | --- | --- | --- |
| **A. Move choice** (primary) | `choice` over legal moves | SF best move at depth D | top-1, top-3, ACPL, win% loss, blunder rate, P(best), expected CPL |
| **B. Position eval** | `score` (e.g. −3..+3 buckets) | SF eval → bucket | exact / adjacent bucket, MAE, calibration |
| **C. Tactic detection** | `noul` ("Is there a forced mate in ≤2?") | SF search | accuracy, Brier, ECE |
| **D. Opponent move prediction** | `choice` over legal moves | actual next move in a game DB | top-1, top-5, log loss |

Task A is v1. B/C are cheap add-ons (same request), D is later (needs a game corpus).

### 4.2 Position suite

- ~400–600 positions, fixed and versioned in the repo.
- Strata: opening (out of book), quiet middlegame, tactical, endgame, mate-in-1/2.
- Sources: Lichess puzzle DB (CC0), Lichess elite games, SF self-play, hand-picked.
- Filters: legal moves ≤ 60, no already-finished games, de-duplicated by position hash.
- Label each position with **decisiveness**: gap between SF best and second-best.
  Report results overall and on the subset where best is clearly best; otherwise many
  "wrong" moves are actually equal.

### 4.3 Baselines

- **Random legal move** (floor).
- **Material greedy** (capture the highest-value piece, else random) — a dumb but non-trivial baseline.
- **Stockfish at fixed depth/skill** (ceiling / reference).
- **Text models** in `chat_text`, `chat_tool`, `chat_json` modes with the same prompts/state:
  the six standard models above, each at lowest-supported reasoning effort (primary) and
  default effort (secondary).
- Optional: **uniform over legal moves** for distribution metrics.

### 4.4 Metrics

Per attempt:
- chosen move, legal?, parse error (text modes)
- `cp_best`, `cp_played` (SF, fixed depth, same side-to-move perspective)
- `cpl = max(0, cp_best − cp_played)`
- `winloss` = SF win probability of best − win probability of played (preferred over raw cp;
  cp is non-linear). Requires `UCI_ShowWDL` or SF's WDL model.
- `P(best)` from decision probabilities; top-3 probability mass
- `expected_cpl = Σ p_i · cpl_i` (needs an oracle eval of every legal move; cache per position)
- latency, input/output tokens, cost
- confidence, and confidence-vs-correctness calibration

Aggregate:
- Top-1 / top-3 agreement with SF
- ACPL (mean and median), win% loss
- Blunder rate (CPL > 200 or win% loss > 10)
- Brier score / ECE for P(best) and for noul tasks
- p50/p95 latency, cost per 1,000 decisions, cost per game
- Stability: same-position agreement across repeats, orders, and templates

### 4.5 Controls / protocol

- Pin model builds (`canonical_slug`, not `~latest`) and log the exact model string returned.
- Text models: temperature 0; record provider routing; retry parse failures up to 2 times,
  count failures separately.
- Text reasoning: read the catalog `reasoning` object per model; set `max_tokens=16384` when
  reasoning is on and `1024` when off; on `finish_reason=length`/empty content, make one nudge
  call ("Output only your chosen move in SAN") with reasoning off; record both attempts.
- Tool mode: try forced `tool_choice`; if the provider returns the "only auto is supported"
  400, retry with `tool_choice:"auto"`; if no tool call comes back, fall back to JSON schema.
- Transport: retry 429/5xx with exponential backoff (3 attempts), cap concurrency per provider
  (d1-ultra 429'd on the second back-to-back request in M0).
- Record the exact `provider`, returned `model` build, reasoning effort, and max_tokens for
  every attempt.
- Repeat each (position × model) N=3 and report variance; decision models may be
  non-deterministic even without temperature.
- Same information for every mode; same option order seed per (position, repeat).
- Cache oracle evals keyed by (position hash, SF version, depth, threads) so all models are
  judged identically and we only pay the engine cost once.
- Engine judge: SF 19, depth 18–20, 1 thread, fixed hash. Report SF version. Note that SF
  eval is a proxy, not ground truth for "best move" in equal positions.
- Log raw request/response for every attempt (cost is negligible, debuggability is not).
- Export CSV/JSON per run; a run is immutable once finished.

### 4.6 Cost estimate

~40 options × ~15 tokens + ~300 tokens state ≈ **900 input tokens / decision**.

| Model | $/M input | $/1,000 decisions |
| --- | --- | --- |
| `liquid/d1` | $0.020 | ~$0.018 |
| `typesafe/jev-1.14` | $0.042 | ~$0.038 |
| `microsoft/microsoft-decision-1` | $0.042 | ~$0.038 |
| `liquid/d1-ultra` | $0.042 | ~$0.038 |
| `openai/gpt-6-luna-decisions` | $0.100 | ~$0.090 |
| `cloudflare/clef-omni` | $0.150 | ~$0.135 |

A 500-position × 10-model benchmark with 3 repeats ≈ $1–4 for decision models. Games are
rounding errors. Text models dominate cost; cap them.

**Measured (M0):** on a 36-option quiet position, decision models used 1.6–2.7k input tokens
and cost **$0.00007–$0.00020 per decision**; 63 options used 2.8–4.4k tokens. The text arm at
low reasoning cost **$0.0001–$0.0066 per move**, with the expensive calls being
reasoning-heavy or failed-to-answer attempts.

---

## 5. Modes / comparison matrix

Two axes: **interface** and **input**.

| Mode | Interface | Input | Notes |
| --- | --- | --- | --- |
| `decisions` | Decisions API `choice` | text state | primary |
| `chat_text` | Chat Completions | text prompt | free-text SAN, regex-parsed |
| `chat_tool` | Chat Completions + forced tool call | text prompt | tool schema with `enum` of legal SAN; closest analog to `choice` |
| `chat_json` | Chat Completions + JSON schema response | text prompt | structured-decoding cousin |
| `decisions_image` | Decisions API `choice` | board PNG | vision decision models only (Jev, D1, Clef, Luna, Mercury, PPLX) — M5 |
| `chat_image` | Chat Completions | board PNG | M5 |

v1 implements `decisions`, `chat_text`, `chat_tool`, and `chat_json`. The UI exposes the mode
as a dropdown, and every result row records it. Leaderboards are always filtered by mode.

Chat modes additionally have a **reasoning** sub-setting (`none`/lowest supported, `low`,
`default`). It is part of the mode label and must be recorded per attempt. The primary
decision-vs-text comparison uses the lowest supported effort; a secondary arm uses default
effort. Never compare across reasoning settings in one ranking.

---

## 6. Architecture

```
┌────────────────────────────┐        ┌──────────────────────────────┐
│ SvelteKit (web/)           │  /api  │ Go backend (127.0.0.1:8080)  │
│  chessground board         │ ─────► │  net/http + SSE              │
│  controls / tables / charts│        │  game orchestrator           │
└────────────────────────────┘        │  provider registry           │
                                      │  Stockfish UCI pool          │
                                      │  SQLite (modernc, pure Go)   │
                                      └──────────────┬───────────────┘
                                                     │
                                      ┌──────────────▼───────────────┐
                                      │ OpenRouter /api/alpha/...    │
                                      └──────────────────────────────┘
```

**Why Go for the backend** (vs. all-TypeScript):

- native Stockfish child process over UCI (stdin/stdout, no wasm slowdown),
- goroutines for parallel games/benchmark workers and long-running engine searches,
- one static binary; SSE is trivial,
- `github.com/corentings/chess/v2` handles legal moves, SAN, FEN, PGN, board drawing.

All-TS is viable (Bun + `stockfish.wasm` or `child_process`), and simpler to ship as one
runtime. But benchmark mode wants many parallel engine processes and coordinated API calls;
Go is the better fit. The UI stays SvelteKit either way.

### 6.1 Go packages

```
cmd/chessbench/main.go        # server
cmd/spike/main.go             # throwaway protocol spikes (M0)
internal/chessx/              # legal moves + descriptors + board render
internal/engine/              # UCI client, process pool, eval + best move
internal/openrouter/          # catalog, decisions, chat, usage
internal/providers/           # MoveProvider interface + 4 implementations
internal/game/                # game state machine, opponent, persistence
internal/bench/               # suite loader, worker pool, oracle cache, scoring
internal/store/               # SQLite schema + queries
internal/api/                 # routes, SSE hub, static embed (later)
web/                          # SvelteKit + chessground
data/                         # chessbench.db, suites/, runs/ (gitignored)
```

Core interface:

```go
type MoveRequest struct {
    FEN        string
    Legal      []chessx.Move
    HistorySAN []string
    Strategy   string            // "legal" in v1; reserved for later ablations
    Seed       int64
    Template   string
}

type MoveResponse struct {
    Move          chessx.Move
    Probabilities map[string]float64
    Confidence    float64
    Usage         openrouter.Usage
    Latency       time.Duration
    Raw           json.RawMessage
}

type MoveProvider interface {
    ID() string
    Mode() string
    Move(ctx context.Context, req MoveRequest) (MoveResponse, error)
}
```

### 6.2 API surface

```
GET  /api/models?kind=decisions|text|all     # live OpenRouter catalog (public, no key)
GET  /api/engines                            # Stockfish path/version/status
POST /api/games                              # {model, mode, side, sfElo, depth, strategy}
GET  /api/games/{id}
POST /api/games/{id}/step                    # one model move (+ engine reply if auto)
POST /api/games/{id}/auto                    # start autoplay loop
POST /api/games/{id}/stop
GET  /api/games/{id}/events                  # SSE: state, thinking, move, error
GET  /api/runs
POST /api/runs                               # benchmark job
GET  /api/runs/{id}/events                   # SSE progress
GET  /api/runs/{id}/export.csv

POST /api/compare                            # same position, N models, N modes, one shot
```

### 6.3 Storage

SQLite (`modernc.org/sqlite`, no cgo):

- `models(slug PK, name, kind, canonical_slug, context, pricing_json, updated_at)`
- `positions(id PK, fen, hash UNIQUE, category, source, legal_count, oracle_json, oracle_depth, sf_version)`
- `runs(id, name, config_json, status, created_at, finished_at)`
- `attempts(id, run_id, position_id, model_slug, mode, strategy, template, repeat, seed,
   order_json, move_san, move_uci, probs_json, confidence, cp_best, cp_played, cpl,
   winloss, latency_ms, cost_usd, input_tokens, output_tokens, error, raw_json)`
- `games(id, run_id, model_slug, mode, config_json, result, pgn, created_at)`

Games are stored as JSON/PGN as well, so a run can be replayed in the UI.

---

## 7. UI

```
┌──────────────────────────────────────────────────────────────────────┐
│ ChessDecide       [Play] [Compare] [Benchmark] [Runs]     ● API ok    │
├───────────────────────────────┬──────────────────────────────────────┤
│                               │ Model   [ typesafe/jev-1.14      ▾ ] │
│                               │ Mode    [ decisions               ▾ ] │
│      chessground board        │ Side    [ White ▾ ]  SF Elo [2200▾]  │
│      last move + SF arrow     │ Moveset all legal (fixed) Depth[18]  │
│                               │                                       │
│  ▏eval bar (white POV)        │ [ New game ] [ Step ] [ Auto ▶ ]     │
│                               │                                       │
├───────────────────────────────┴──────────────────────────────────────┤
│ #  Move   P(best)  CPL   Win% loss  Latency  Cost      SF best        │
│ 1  e4     0.11      0     0.0%       412ms   $0.00004   e4            │
│ 2  ...                                                                │
├──────────────────────────────────────────────────────────────────────┤
│ Game: 1-0 · 34 plies · ACPL 41 · cost $0.0021 · P(best) 0.09 avg      │
└──────────────────────────────────────────────────────────────────────┘
```

- Board: `chessground` (lichess board) + `chessground.base.css` / brown theme.
  Frontend only renders FEN + highlights; Go owns the rules.
- Arrow = SF best move (toggle), highlight = played move and check.
- Reasoning/probabilities panel: bars for top-5 options after each decision model move.
- Compare tab (M3): one FEN, checkboxes for models × modes, run → table of picks +
  probabilities + SF eval; save/export the comparison.
- Benchmark tab (M4): suite + models + mode + repeats → progress via SSE → leaderboard
  (sortable: ACPL, top-1, blunder %, $/1k, p95 latency) + scatter (cost vs ACPL) + export.
- Runs tab: history, config, replay a game move-by-move.
- Dark theme, local-only, no auth; bind to `127.0.0.1`.

---

## 8. Milestones

**M0 — Protocol spikes (done 2026-10-27)**
Decisions API shape/limits, determinism, order, text protocols, Stockfish UCI.
Findings in [`SPIKE.md`](SPIKE.md).

**M1 — Go core + CLI foundation**
`chessx`, `engine`, `openrouter`, providers, oracle cache, CSV out. Run 100 positions × 5
models as a sanity check (not yet the polished benchmark UI).

**M2 — GUI play mode (v1)**
SvelteKit + chessground, `/api/games`, SSE, model dropdown from live catalog,
play vs SF with step/auto, per-move metrics.

**M3 — Compare mode (v1 complete)**
Same-position multi-model × multi-mode comparison, probability bars, per-model metrics,
history and export.

**M4 — Benchmark runner + leaderboard**
Suites, repeats, resumable jobs, progress via SSE, leaderboard + scatter, CSV/JSON export.

**M5 — Depth**
Calibration report (reliability curves), eval + tactic tasks, image mode, opponent-move
prediction, game-based Elo ladder (SF at 1320–3190), prompt-template ablation.

---

## 9. Open questions

**Answered in M0:**

1. **Option cap:** 63 options is fine — 0.5–0.9 s, probabilities sum to ~1, no errors.
2. **Order:** criteria order is preserved; the pick is order-invariant; P(pick) shifts
   ±0.05–0.08. Fix a logged order per run.
3. **Determinism:** pick stable 5/5; probabilities drift ~0.02 → N=3 repeats.
4. **Calibration:** P(best) is informative but not calibrated across position types
   (0.48–0.65 on a blunder vs 0.98 on a mate). Measure it, don't assume it.
5. **Rate limits:** 429s happen; backoff + per-provider concurrency caps.
6. **Text model set:** the six standard models, with reasoning effort as a dimension.

**Still open:**

7. **State shape:** object vs. compact string; does SAN history help or bloat?
8. **Session reuse:** does `session_id` across a game improve speed/cost/consistency?
9. **Vision:** does a board image work as well as FEN for vision decision models?
10. **Legal-list ablation:** how much does giving the move list help text models?
11. **Position suite:** composition, decisiveness threshold, and how many positions give
    stable per-model rankings.
12. **Oracle cost:** how deep must the all-legal-move eval matrix be to compute expected CPL
    at acceptable cost?

## 10. Risks

- `/api/alpha/decisions` is **alpha**; schema may change. Isolate it behind `internal/openrouter`.
- Decision models are trained for routing/classification, not chess. Criteria descriptions may
  carry most of the signal; that's a finding, not a bug — document it.
- Provider quirks: some reject forced `tool_choice` (only `auto`), some enforce mandatory
  reasoning, some ignore `effort`. Per-model capability from the catalog, with fallbacks.
- Reasoning models can burn the whole output budget and return no move; budget, nudge, and
  record no-answer rate.
- Rate limits (429) under back-to-back calls; retry with backoff and cap concurrency.
- Option count and long criteria lists can hit context limits (kev-4b: 8k) or the ~32 KB
  Jev slow-path. Filter per-model.
- Engine judging is imperfect in equal positions; use win% loss and decisiveness strata.
- Model churn: pin builds, record exact returned `model`, keep raw responses.
- Name collision resolved: DeepMind's `ChessBench` dataset (searchless_chess) exists, so this
  project is **ChessDecide**.

---

## 11. References

- M0 spike findings: [`docs/SPIKE.md`](SPIKE.md)
- OpenRouter reasoning tokens: https://openrouter.ai/docs/use-cases/reasoning-tokens
- Jev guide: https://openrouter.ai/docs/guides/community/jev
- Decisions API reference: https://github.com/OpenRouterTeam/skills/blob/main/skills/openrouter-decisions/references/decisions-api.md
- Decisions model catalog: https://openrouter.ai/models?output_modalities=decisions
- Tool-call gating recipe: https://openrouter.ai/docs/cookbook/building-agents/gate-tool-calls-with-jev
- ChessArena (ACL 2026): https://aclanthology.org/2026.acl-long.360.pdf
- CPL methodology: https://arxiv.org/html/2601.16823v3
- DeepMind ChessBench (name collision, now avoided): https://github.com/google-deepmind/searchless_chess
- Stockfish docs (eval/WDL): https://official-stockfish.github.io/docs/stockfish-wiki/Stockfish-FAQ.html
