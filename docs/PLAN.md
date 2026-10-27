# ChessDecide — Plan

A harness that **rates decision models at chess**: each model plays a series of games
against Stockfish, and we estimate its Elo. A lichess-style dark GUI lets you watch any game
live or play it back move by move. Cost is a first-class design constraint.

Status: **design locked v4 (2026-10-27); M0 spikes passed; no app code yet.**
v3: the primary workflow is **games and series with an Elo rating** (Compare dropped).
**v4 changes:** TypeScript + SvelteKit + Drizzle/D1 instead of Go (see
[`ARCHITECTURE.md`](ARCHITECTURE.md)); run locally and publish results first, live Cloudflare runs
later; `clean` arm is now fully bare; optional image arm; build order is viewer-first with a cheap
go/no-go after one real game; no generated commentary (costs money); raw CSS, no Tailwind.

| Doc | Purpose |
| --- | --- |
| `PLAN.md` (this) | What we are building and why; locked decisions; risks |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | TypeScript stack, ports/adapters, the three run phases, Cloudflare limits |
| [`METRICS.md`](METRICS.md) | Elo/series scoring, ladder calibration, per-move oracle metrics, formulas |
| [`PROMPTS.md`](PROMPTS.md) | Verbatim request builders: keys, descriptions, state, instructions |
| [`API.md`](API.md) | HTTP + SSE contract, TypeScript types, SQLite/D1 schema |
| [`UI.md`](UI.md) | Design tokens, screens, components, playback behaviour, states |
| [`IMPLEMENTATION.md`](IMPLEMENTATION.md) | Ordered tasks with acceptance checks (**the build doc**) |
| [`SPIKE.md`](SPIKE.md) / [`RESEARCH.md`](RESEARCH.md) | M0 measurements; API and toolchain facts |
| [`TEXT_ARM.md`](TEXT_ARM.md) | **Deferred**: text-model comparison |
| `mockups/` | **`mockups/simple.html`** is the target look (phone-friendly); `index.html` has the older dense screens |

---

## 0. Locked decisions

### Stack, hosting and build order (v4)

1. **TypeScript** monorepo managed with **pnpm only** (no npm/yarn/Bun), **SvelteKit** (Svelte 5) frontend, **raw CSS** (no Tailwind), `chessground`
   board, `chess.js` for rules, **Drizzle** over SQLite, targeting **Cloudflare** (D1, Workers,
   Durable Objects). Details: [`ARCHITECTURE.md`](ARCHITECTURE.md).
2. **Three phases, one core.** (1) run locally with native Stockfish and **publish results** to a
   read-only public site on the free tier; (2) run live on Cloudflare (Durable Objects + a Stockfish
   container or server); (3) fan out hundreds of games across models. Moving between phases swaps
   adapters (`Engine`, `Store`, `Scheduler`, `EventSink`), not the core.
3. **Engines are adapters.** Stockfish first; any UCI engine can be added later and is recorded per game.
4. **Viewer-first order.** Mock provider ($0) → watch a game → one real Jev game (≈ half a cent) →
   go/no-go → ladder, Series, Elo → publish. Elo stays the headline, but it is built after the
   viewer proves the idea is fun to watch.
5. **No generated commentary.** Text beside moves comes from fixed templates over Stockfish numbers;
   no extra model calls.

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
  rates **one arm**; arms are never merged. Default arms per model:

| Arm | Interface | `key_format` | `descriptor` | Meaning |
| --- | --- | --- | --- | --- |
| **`clean`** (default) | text | `uci` | `plain` | **Fully bare:** `Knight g1 to f3`. No capture, check or mate information anywhere. The honest test. |
| **`hinted`** | text | `san` | `annotated` | SAN keys (`Qxf7#`), "captures pawn, checkmate" text, `in_check` flag. Readable; leaks. Opt-in. |
| **`image`** (optional) | image + text | `uci` | `plain` | Board picture instead of FEN/history; same bare options as `clean`. Separate arm, separate rating. |

Defaults: `state_variant=slim`, `template=neutral`. First full study: Jev·clean, D1 Ultra·clean;
then `hinted` and `image` arms if the first results are interesting.

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
schema may change, so everything is isolated in `packages/providers`.

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

Full detail in [`ARCHITECTURE.md`](ARCHITECTURE.md). Summary:

```
packages/core        pure TS: chess rules, descriptors, prompts, parsers, Elo, ladder, stepGame
packages/engine      Engine port + adapters (native UCI now; HTTP/container later)
packages/providers   OpenRouter Decisions client, retry/limiter/cache, mock provider
packages/db          Drizzle schema + migrations (SQLite locally, D1 in Cloudflare)
packages/runner      Node CLI: game, series, ladder calibrate, probe, publish
apps/web             SvelteKit (adapter-cloudflare), raw CSS, chessground
apps/live            (phase 2) Worker + Durable Objects
```

A game is `(white: Player, black: Player)`; a `Player` is a model (`MoveProvider`) or an engine
(`Opponent`), both with one `move()` method, so the loop never branches on type. `stepGame`
plays exactly one ply, so a local loop and a Durable Object alarm drive the same code.

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
| **M0.5** | Spikes: local D1 + Drizzle (S1), image input probe (S2) |
| **M1** | Core, engine adapter, store, judge, mock provider, game stepper + CLI; golden tests |
| **M2** | **Viewer** (replay + live, phone-friendly), local control API, OpenRouter client + budget, **one real game → go/no-go** |
| **M3** | **Ladder** calibration + **Series** + Elo posterior + series UI (the headline) |
| **M4** | **Publish** to D1, read-only public site, leaderboard, exports |
| **M5** | **Image arm** (optional) |
| **M6** | **Live runs on Cloudflare** (Durable Objects + Stockfish container/server) |
| **M7** | Scale-out: many models, hundreds of games |
| **M8** | Model vs model, other engines, position suite, text arm |

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
7. How strong are these models really? **Partly answered (SPIKE §9):** on 48 positions, D1 Ultra text
   plays clearly above a random mover (30 % best-move vs 11 %); Jev text is about random on CPL and
   blunder rate. Expect Jev near the bottom of the ladder; a 10-game pilot picks the starting level.

## 10. Risks

- **Alpha API** — isolated; mock provider + fixtures keep the app usable.
- **Elo realism** — ladder Elo is relative to our Stockfish setup; state that everywhere.
- **Noise** — report intervals; never rank on overlapping CIs; "to completion" exists for this.
- **Models far below the floor** — the random-mover level and ε-mixes exist for exactly this.
- **Contamination** — openings are random plies, not book lines (reduces memorisation).
- **Long games cost money** — adjudication, 200-ply cap, hard budget.
- **Rate limits** — concurrency cap, backoff; blocks run ≤ 2 games in parallel.
- **Library risk** — `chess.js` verified against python-chess golden fixtures first.
- **Cloudflare limits** — free tier cannot run Stockfish (10 ms CPU, no Containers); phase 1 avoids it by running locally, phase 2 needs the paid plan or an external Stockfish host. Re-check limits before phase 2.
- **Image arm confound** — Jev switches to a slower long-context mode for any image; the arm is reported separately and labelled.
- **Catalog churn** — snapshot catalog row per series.
- **Non-goals (v1)** — hosted live runs (phase 2), auth, human play, training, per-model prompt
  tuning, text-model spend, Compare tool, generated commentary.

## 11. References

- M0 findings: [`SPIKE.md`](SPIKE.md); API/toolchain: [`RESEARCH.md`](RESEARCH.md)
- Jev guide: https://openrouter.ai/docs/guides/community/jev
- Decisions API: https://github.com/OpenRouterTeam/skills/blob/main/skills/openrouter-decisions/references/decisions-api.md
- Decision model catalog: https://openrouter.ai/models?output_modalities=decisions
- ChessArena (ACL 2026): https://aclanthology.org/2026.acl-long.360.pdf
- CPL methodology: https://arxiv.org/html/2601.16823v3
- Stockfish FAQ (UCI_Elo, WDL): https://official-stockfish.github.io/docs/stockfish-wiki/Stockfish-FAQ.html
- DeepMind ChessBench (name collision, avoided): https://github.com/google-deepmind/searchless_chess
