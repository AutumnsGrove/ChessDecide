# ChessDecide — Plan

A local harness that **rates decision models at chess**: each model plays a series of games
against Stockfish, and we estimate its Elo. A lichess-style dark GUI lets you watch any game
live or play it back move by move. Cost is a first-class design constraint.

Status: **design locked v3 (2026-10-27); M0 spikes passed; no app code yet.**
v3 change: the primary workflow is now **games and series with an Elo rating** (v2 was
position-centric with a Compare tab; Compare is dropped from v1).

| Doc | Purpose |
| --- | --- |
| `PLAN.md` (this) | What we are building and why; locked decisions; architecture; risks |
| [`METRICS.md`](METRICS.md) | Elo/series scoring, ladder calibration, per-move oracle metrics, formulas |
| [`PROMPTS.md`](PROMPTS.md) | Verbatim request builders: keys, descriptions, state, instructions |
| [`API.md`](API.md) | HTTP + SSE contract, Go/TS types, SQLite schema |
| [`UI.md`](UI.md) | Design tokens, screens, components, playback behaviour, states |
| [`IMPLEMENTATION.md`](IMPLEMENTATION.md) | Ordered tasks with acceptance checks (**the build doc**) |
| [`SPIKE.md`](SPIKE.md) / [`RESEARCH.md`](RESEARCH.md) | M0 measurements; API and toolchain facts |
| [`TEXT_ARM.md`](TEXT_ARM.md) | **Deferred**: text-model comparison |
| `mockups/` | Open `mockups/index.html` in a browser |

---

## 0. Locked decisions

### Goal and scope

1. **Goal #1: rate decision models at chess.** A model's headline number is an **Elo estimate
   with a confidence interval**, obtained from a series of games against Stockfish.
   **Goal #2: spend as little as possible** (§5).
2. **v1 = Games + Series.** *Games*: one model vs Stockfish, watchable live and replayable.
   *Series*: many games for one `(model, arm)`, auto-scheduled against an adaptive Stockfish
   ladder, producing the Elo. Leaderboard compares arms.
3. **Later (after v1 is proven): model vs model** (e.g. Jev vs D1 Ultra) as head-to-head
   games and matches. The game loop is already `(white: Player, black: Player)`, so this is
   mostly scheduling, a joint Elo fit, and UI (M5, see §4.9).
   **Dropped from v1:** the same-position multi-model Compare tool. (A "position lab" may
   return in M5 purely as a debugging aid.) The fixed position suite becomes an optional M5
   ablation/calibration tool, not the headline.
4. **Text models: out of v1 and every default path.** The `MoveProvider` interface, the `arm`
   concept and schema columns keep the door open; everything lives in [`TEXT_ARM.md`](TEXT_ARM.md).
5. **Name:** ChessDecide.

### Roster and arms

- **Default roster: `typesafe/jev-1.14` and `liquid/d1-ultra`.** Other catalog models are
  selectable under "More models"; expand only if these go well.
- An **arm** = `(model, interface, key_format, descriptor, state_variant, template)`. A Series
  rates **one arm**; arms are never merged. Two default arms per model:

| Arm | `key_format` | `descriptor` | Meaning |
| --- | --- | --- | --- |
| **`clean`** | `uci` | `plain` | No check/mate/capture hints in keys or text. The honest test. |
| **`hinted`** | `san` | `annotated` | SAN keys (`Qxf7#`), "check/checkmate" text. Readable; leaks. |

Defaults: `state_variant=slim`, `template=neutral`. So the first full study is four series:
Jev·clean, Jev·hinted, D1 Ultra·clean, D1 Ultra·hinted.

### Series presets (locked)

| Preset | Games | Notes |
| --- | --- | --- |
| **Quick** (default) | 25 | smoke test / first look, ≈ ±135 Elo (95%) |
| **Standard** | 50 | ≈ ±95 Elo |
| **To completion** | until stop rule | keep adding 5-game blocks until the 95% interval half-width ≤ **75 Elo** (editable), or 200 games, or the budget cap, or you stop it |

There is **no "thorough" preset**; "to completion" covers it. Intervals shrink with
√games — see the precision table in §4.4.

### Opponents: the Stockfish ladder

- Levels: Stockfish `UCI_LimitStrength` at 1320, 1500, 1700, 1900, 2100, 2400, 2800, plus
  **our own weaker levels below 1320** (a pure random mover and Stockfish-1320 mixed with
  random moves at ε = 0.15, 0.30, 0.50, 0.75).
- Stockfish's own minimum is 1320, and M0 suggests these models may be weaker than that, so
  the weak levels are essential, not optional.
- **Levels are calibrated, not assumed.** A CPU-only round-robin (free) places every level on
  one Elo scale at a fixed `movetime`, anchored so that level `uci-1320` = 1320.
  Stockfish's nominal `UCI_Elo` is calibrated for different time controls than ours.
  Result: `data/ladder/ladder-v1.json`.
- Absolute numbers mean "Elo on the ChessDecide Stockfish ladder", **not** FIDE or lichess
  Elo. Comparisons between arms on the same ladder version are what matter.

### Game rules

- **Openings:** every series game starts from a **seeded random 4-ply opening** (eval kept
  within ±100 cp), reused with colours swapped for the next game where possible. Single games
  may use `startpos` (default for watching) or `random4`.
- **Colours:** alternate by game index within a series.
- **Termination:** checkmate, stalemate, insufficient material, threefold repetition and
  50-move rule (auto-claimed), **200-ply draw** (`max_plies`), and **adjudication** (cost
  saver): when the judge (depth 14) shows `|eval| ≥ 900 cp` for 6 consecutive plies after
  ply 30, the game is awarded to the winning side (flagged `adjudicated`).
- **Errors:** decision models cannot play illegal moves (choice is constrained), so errors
  are transport only. 3 retries with backoff, then the game **pauses**; in a series the game
  is retried from the last ply up to 3 times, then marked `aborted` and **excluded** from the
  rating (never scored as a loss).
- **Pacing:** live single games use a 600 ms minimum per ply; series run unpaced.

### Judge

Stockfish 19, `Threads=1`, `Hash=64`, `UCI_ShowWDL=true`. Live per-ply judge at **depth 14**
(also feeds adjudication, eval graph and ACPL); position-suite oracle at depth 18. Method in
[`METRICS.md`](METRICS.md): every legal move is scored by the same procedure; "best" is the max.

### Budget guardrail

Hard cap **per game and per series, default $1.00**, editable. Estimate-first, hard stop
before a call that would exceed the cap (`stopped_budget`, resumable). Session spend always in
the header.

---

## 1. Thesis

Decision models take a `state` plus typed questions and return calibrated answers — no
prose, free output tokens, very cheap. Chess gives a closed set of legal moves, so "which move
is best?" is a `choice` question, and Stockfish is the opponent and the judge. Two lenses:

1. **Strength** — Elo from game results (the headline).
2. **Explanation** — per-move quality (ACPL, acceptable-move rate, blunders) and
   **distribution quality** (probability mass on good moves, calibration of P(pick)). Only
   decision models expose the second; every game yields ~30 judged decisions, so a 50-game
   series gives ~1,500 decisions to explain *why* a rating came out as it did.

Constraint: a `choice` question restricts output to the options, so **illegal moves are
impossible**; "illegal move rate" is a text-arm metric only.

---

## 2. What decision models are (constraints)

Details in [`RESEARCH.md`](RESEARCH.md): endpoint `POST /api/alpha/decisions` (alpha);
`choice` returns `{choice, probabilities, confidence}`; `usage.cost` is input-only; Jev and
D1 Ultra cost $0.042 / M input tokens; Jev degrades above ~32 KB (we send ≤ ~15 KB); the
schema may change, so everything is isolated in `internal/openrouter`.

---

## 3. Mapping chess onto the API

Exact builders in [`PROMPTS.md`](PROMPTS.md). Summary: `slim` state (FEN, side, move number,
last 16 plies of SAN); one `choice` question `move` with **every legal move** as an option;
option order = sorted by UCI (logged); `clean` keys are UCI, `hinted` keys are SAN; the app
maps every answer back to canonical UCI before judging. No `session_id` in series.

---

## 4. Scoring

### 4.1 Unit of measurement

The unit is a **game result** (1 win, ½ draw, 0 loss for the model) against a ladder level of
known Elo. A **Series** collects games for one arm and fits one rating.

### 4.2 Series protocol (adaptive)

```
blocks of 5 games; colours alternate; openings seeded and paired where possible
block 1 opponent: the ladder level nearest the prior mean (1200)
after every game: recompute the Elo posterior (METRICS.md §B)
next block's opponent: ladder level nearest the current posterior mean
stop when the preset's game count is reached, or (to-completion) CrI half-width ≤ target
```

Playing opponents near the model's level keeps results away from 0 % and 100 %, where a game
says almost nothing. A prior (normal, mean 1200, σ 600) keeps the estimate finite after a
0–5 or 5–0 block.

### 4.3 Elo estimate

Grid posterior over Elo 0–3500: log-likelihood is the sum over games of
`s·ln(e) + (1−s)·ln(1−e)` with `e = 1/(1+10^((R_opp − R)/400))` and `s ∈ {0, ½, 1}`
(quasi-likelihood; slightly conservative when draws are common). Reported as the posterior
**mean** with a **95 % credible interval**. Full spec and worked example in
[`METRICS.md`](METRICS.md).

### 4.4 Precision (rule of thumb, 50 % score, no draw help)

| Games | 95 % half-width |
| --- | --- |
| 25 | ≈ ±135 Elo |
| 50 | ≈ ±95 |
| 100 | ≈ ±70 |
| 200 | ≈ ±50 |

Two arms are "different" only if their intervals separate (or a paired bootstrap of their
game scores says so). The UI says so plainly and never draws a rank order from overlapping
intervals.

### 4.5 Secondary metrics (from the same games)

ACPL, acceptable-move rate, mistake/blunder rates, P(acceptable), expected win% loss, Brier/
ECE of P(pick), score by colour, by game phase, latency, cost per game. All defined in
[`METRICS.md`](METRICS.md) §A.

### 4.6 Baselines

The ladder itself includes the random mover (≈ the floor); a model must beat it to rate at
all. Reference rows on the leaderboard: random mover, material-greedy, and the ladder levels.

### 4.7 Optional later: position suite (M5)

~400 stratified positions with an oracle matrix, for controlled ablations (slim vs full
state, key formats, order effects), calibration curves and contamination checks. Not needed
for the headline Elo. Design retained in `METRICS.md` §A and the ablation list in §4.8.

### 4.9 Later: model vs model (M5)

Once two arms each have a ladder Elo, head-to-head games give a direct, ladder-free
comparison (and a sanity check of the ladder: the Elo gap predicted by the ladder should match
the head-to-head score). Design notes so nothing built now blocks it:

- A match is a series whose opponent is another arm instead of a ladder level; colours
  alternate and openings are paired exactly as in §4.2. Both sides spend money, so the
  estimate and cap count two providers.
- The opponent's rating is itself uncertain, so head-to-head results go into a **joint fit**
  (all arms plus ladder levels as fixed anchors) instead of the single-opponent likelihood.
  The ladder levels remain fixed anchors; arm ratings are the free parameters.
- UI: "New match" in the Series area, a cross-table on the leaderboard (score between each
  pair of arms), and the Viewer already shows two model panels when both sides are models.
- Nothing in v1 schema blocks it: `games.white_player` / `black_player` are generic JSON
  (see `API.md`).

### 4.8 Controls and ablations

Pin `canonical_slug`; log returned model and provider per attempt; one ablation changed at a
time and never merged into a leaderboard row (state variant, history length, option order,
template, key/descriptor combinations); record `concurrency` per attempt; raw request/
response stored for every call; a finished series is immutable.

---

## 5. Cost model and guardrails

Measured (M0, `full` state): 36 options ≈ 1.6–2.7k input tokens, **$0.00007–$0.00020 per
decision**; `slim` state is expected ~40 % smaller (verified in M1).

| Activity | Model calls | Est. cost (Jev/D1 Ultra) |
| --- | --- | --- |
| One game, 60 plies | ~30 | ≈ $0.003–0.006 |
| **Quick series** (25 games) | ~750 | ≈ **$0.10–0.15** per arm |
| **Standard series** (50 games) | ~1,500 | ≈ **$0.20–0.30** per arm |
| Four arms × Standard | ~6,000 | ≈ **$0.80–1.20** total |
| Ladder calibration, judge, opponent | — | **$0** (CPU only) |

Levers: (1) **adjudication** ends hopeless games early; (2) **slim state**, 16-ply history,
single question; (3) **response cache** by request hash (re-running a judged game or resuming
a series never repays); (4) two-model roster; (5) **concurrency cap** 2 + 429 backoff;
(6) **estimate-first** with worst case shown; (7) **hard cap** per game/series (default
$1.00) checked before each call; (8) **ledger** = Σ `attempts.cost_usd`, shown in the header,
plus OpenRouter credit remaining if `GET /api/v1/key` exposes it (M1 check).

Wall-clock: ~30–40 s per game (30 calls × ~0.9 s). A Quick series with 2 games in parallel
is ≈ 8–10 minutes.

Estimator: `input_tokens ≈ 400 + 45·n_options` (slim) / `400 + 75·n_options` (full), replaced
by the rolling mean of real usage after 20 attempts. Series worst case =
`games × (max_plies/2) × est_call`, shown next to the typical case.

---

## 6. Architecture

```
┌────────────────────────────┐        ┌──────────────────────────────┐
│ SvelteKit SPA (web/)       │  /api  │ Go backend (127.0.0.1:8080)  │
│  chessground Viewer        │ ─────► │  net/http + SSE              │
│  Series dashboard          │        │  series scheduler (Elo)      │
└────────────────────────────┘        │  game orchestrator           │
                                      │  MoveProvider registry       │
                                      │  Stockfish: judge pool +     │
                                      │     per-game opponents       │
                                      │  SQLite (modernc, pure Go)   │
                                      └──────────────┬───────────────┘
                                                     │
                                      ┌──────────────▼───────────────┐
                                      │ OpenRouter /api/alpha/...    │
                                      └──────────────────────────────┘
```

Go for native Stockfish processes, goroutines for judging and parallel games, one static
binary, trivial SSE. UI: SvelteKit in SPA mode (`adapter-static`, `ssr=false`); Vite proxies
`/api` in dev, Go embeds `web/build` in prod.

### 6.1 Go packages

```
cmd/chessdecide/main.go     # server + subcommands: serve, ladder calibrate, probe
internal/chessx/            # legal moves, SAN/UCI, descriptors, FEN utils (wraps corentings/chess/v2)
internal/engine/            # UCI client; JudgePool; Opponent (per game); weak-level wrapper (ε-random)
internal/oracle/            # per-move scoring, cache, win% math
internal/openrouter/        # catalog, decisions client, usage, retry/backoff, rate limiter
internal/providers/         # MoveProvider interface; decisions provider; mock provider
internal/budget/            # estimator, cap enforcement, ledger
internal/game/              # state machine, adjudication, pacing, persistence, SSE
internal/ladder/            # level definitions, calibration job, ladder-vN.json
internal/series/            # scheduler, Elo posterior, stop rules, SSE
internal/bench/             # (M5) position suite + ablations
internal/store/             # SQLite schema, migrations, queries
internal/api/               # routes, SSE hub, error mapping, static embed
web/  data/  tools/
```

Core interface (generic so a text provider can be added later):

```go
type MoveProvider interface {
    ID() string
    Move(ctx context.Context, req MoveRequest) (MoveResponse, error)
}
```

`MoveRequest`/`MoveResponse`, `Opponent` and `Player` are specified in [`IMPLEMENTATION.md`](IMPLEMENTATION.md) §1.
A game is `(white: Player, black: Player)` where `Player` is either a `MoveProvider` or an
`Opponent`; both implement `Move`, so the game loop never branches on type.

---

## 7. UI

See [`UI.md`](UI.md) and the mockups. Headlines: lichess-dark look; **Series** (leaderboard,
new series, live dashboard with Elo-over-games and ladder staircase) and **Games** (list +
**Viewer**: live follow or playback with scrubber, speed, keyboard, eval graph, per-ply
probability panel). Every paid action shows an estimate and a cap; the header shows spend.

## 8. Milestones

Tasks and acceptance checks: [`IMPLEMENTATION.md`](IMPLEMENTATION.md).

| M | Deliverable |
| --- | --- |
| **M0** | Protocol spikes (done) |
| **M1** | Go core: `chessx`, `engine`, `oracle`, `openrouter`, `budget`, mock provider, store; golden tests; CLI smoke game; resolve §9 questions |
| **M2** | Single-game orchestrator + API + **Viewer** (live + playback), budget UI |
| **M3** | **Ladder** calibration job + **Series** scheduler + Elo posterior + series dashboard |
| **M4** | Leaderboard, exports, cross-arm comparison, precision/stop-rule polish |
| **M5** | **Model vs model matches** + joint Elo fit; position suite, ablations, calibration plots, Elo-vs-cost views, optional position lab |
| **M6** | *(optional)* text arm |

## 9. Open questions (each an M1 task, ≤ $0.05 total unless noted)

1. M0 observations to confirm (single model/position so far): pick invariant to order; pick
   stable across repeats; P(pick) calibration across position types; 63-option acceptance on
   D1 Ultra.
2. `slim` vs `full` state — same picks? token savings?
3. History: SAN window vs none, 16 vs full.
4. `session_id` effect on cost/speed/consistency (default: off).
5. Does `GET /api/v1/key` expose remaining credit?
6. Measured Stockfish `movetime` to use for ladder (default 50 ms) and calibration time
   (CPU, one-off).
7. How strong are these models really? (A 10-game pilot against the weak ladder decides the
   first series' starting level; the algorithm handles any answer.)

## 10. Risks

- **Alpha API** — isolated; mock provider + fixtures keep the app usable.
- **Elo realism** — ladder Elo is relative to our Stockfish setup; state that everywhere.
- **Noise** — report intervals; never rank on overlapping CIs; "to completion" exists for this.
- **Models far below the floor** — the random-mover level and ε-mixes exist for exactly this.
- **Contamination** — openings are random plies, not book lines (reduces memorisation).
- **Long games cost money** — adjudication, 200-ply cap, hard budget.
- **Rate limits** — concurrency cap, backoff; blocks run ≤ 2 games in parallel.
- **Library risk** — `corentings/chess/v2` verified against python-chess golden fixtures first.
- **Catalog churn** — snapshot catalog row per series.
- **Non-goals (v1)** — online deployment, auth, human play, training, per-model prompt tuning,
  text-model spend, Compare tool.

## 11. References

- M0 findings: [`SPIKE.md`](SPIKE.md); API/toolchain: [`RESEARCH.md`](RESEARCH.md)
- Jev guide: https://openrouter.ai/docs/guides/community/jev
- Decisions API: https://github.com/OpenRouterTeam/skills/blob/main/skills/openrouter-decisions/references/decisions-api.md
- Decision model catalog: https://openrouter.ai/models?output_modalities=decisions
- ChessArena (ACL 2026): https://aclanthology.org/2026.acl-long.360.pdf
- CPL methodology: https://arxiv.org/html/2601.16823v3
- Stockfish FAQ (UCI_Elo, WDL): https://official-stockfish.github.io/docs/stockfish-wiki/Stockfish-FAQ.html
- DeepMind ChessBench (name collision, avoided): https://github.com/google-deepmind/searchless_chess
