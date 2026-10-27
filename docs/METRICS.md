# ChessDecide — Scoring, Elo and metrics

**Part B (Elo and series scoring) is the headline; Part A (§1–11, per-move oracle metrics) explains it.**
Every number the app shows is defined here. If code and this doc disagree, the doc wins (fix
the code, or change the doc deliberately and bump `METRICS_VERSION`).

`METRICS_VERSION = 3`

> Part A below covers per-move/per-decision quality (computed on every game ply by the live
> judge, and later on a position suite). Part B (end of file) covers game results, the ladder
> and the Elo estimate.

## 1. Why the oracle is built the way it is

M0 computed CPL from a **root search** for the "best" move but from **separate child
searches** for the played move, and hard-coded CPL 0 for the PV move. Consequences seen in
the spike data:

- Best `b4` scored cp 19, yet `Re1` scored 23 and `h3` 20 and were both reported "CPL 0" —
  the `max(0, …)` hid a ±5 cp measurement mismatch.
- The same move `d4` scored CPL **61 / win-loss 5.8** in SPIKE §3 and CPL **75 / 8.9** in §4.1.

Fix: **every legal move is scored by the identical procedure, and "best" is the maximum of
those scores.** There is no separate root-search reference.

## 2. Conventions

- Evaluations are from the **mover's** point of view (the side making the move being judged)
  unless a field says `white_*`. UI display (eval bar/graph) is always **White POV**.
- `cp` is clamped to **[-1000, +1000]**. Forced mates are ±1000 (sign = who mates).
- `wp` = win probability of the mover in **percentage points, 0–100**, where a draw counts
  half: `wp = 100 · (win + draw/2)`.
- All differences are in **percentage points (pp)** or **centipawns (cp)**; never mix.

## 3. Oracle procedure (per position)

Engine: Stockfish 19, `Threads=1`, `Hash=64`, `UCI_ShowWDL=true`, full strength.
Depth `D` = **18** (position-suite oracle, M5) or **14** (live game judge: eval graph, ACPL, adjudication). `D` is stored per row.

```
send "ucinewgame"; "isready"
for each legal move m, in ascending UCI order:
    child = apply(position, m)
    if child is checkmate:       cp = +1000, wp = 100, mate = +0
    elif child is stalemate / insufficient material:  cp = 0, wp = 50
    else:
        send "position fen <child>"; "go depth D"
        read the last "info ... depth D ... score ... wdl W D L ... pv ..." before "bestmove"
        cp_child  = score cp (mate n → ±1000)           # child side-to-move POV
        cp  = clamp(-cp_child)                           # mover POV
        wp  = 100 · (L + D/2) / 1000                     # W/D/L are child-to-move; loss for child = win for mover
    store (m, cp, wp, mate_in_or_null, depth, sf_version, pv[0:5])
```

Notes:
- Threefold/50-move draws inside the search are handled by Stockfish; we do not special-case.
- `ucinewgame` once per position (not per child) keeps the run deterministic given the fixed
  move order. Cache key: `(position_hash, sf_version, depth, hash_mb, threads)`.
- Mate scores: `mate_in` is signed plies-to-mate from the mover's POV (positive = mover mates).
- Cost: CPU only. Estimated 5–20 s per position at D=18 (35 moves) — **measured in M1**; the
  suite builder parallelises over `JudgePool`.

## 4. Per-move quantities (given the oracle)

```
best_cp = max_m cp_m          best_wp = max_m wp_m
cpl_m   = best_cp - cp_m      (≥ 0 by construction)
wl_m    = best_wp - wp_m      (≥ 0 by construction)        # "win% loss", pp
best    = argmax_m wp_m (tie-break: higher cp, then lower UCI)
```

Sets and classes (thresholds in pp of `wl`):

| Name | Rule | Used for |
| --- | --- | --- |
| `best_set` | `wl ≤ 0.5` | top-1 that does not punish equal moves |
| `acceptable` | `wl ≤ 2.0` | headline "good move" rate and P(acceptable) |
| `inaccuracy` | `5 ≤ wl < 10` | move annotations |
| `mistake` | `10 ≤ wl < 20` | move annotations |
| `blunder` | `wl ≥ 20` | blunder rate |

Secondary (reported alongside, never as the headline): `cpl ≥ 200` count.

## 5. Per-decision metrics

A decision = one model answer for one position/repeat. Let `p_i` be the returned
probabilities **renormalised to sum 1** (raw sum stored; warn if outside [0.9, 1.1]), `m*`
the pick, `n` the option count.

| Metric | Formula |
| --- | --- |
| `cpl`, `wl` of pick | `cpl_{m*}`, `wl_{m*}` |
| `top1` | `m* == best` |
| `top1_set` | `m* ∈ best_set` |
| `acceptable_pick` | `m* ∈ acceptable` |
| `P_best_set` | `Σ_{i ∈ best_set} p_i` |
| `P_acceptable` | `Σ_{i ∈ acceptable} p_i` |
| `E_wl` | `Σ p_i · wl_i` (expected win% loss) |
| `E_cpl` | `Σ p_i · cpl_i` |
| `p_pick`, `confidence` | returned values (M0: confidence ≈ p_pick) |
| `entropy` | `−Σ p_i ln p_i / ln n` ∈ [0,1] |
| `rank_of_pick` | 1 + number of moves with higher `wp` than `m*` |

Uniform baseline for the same position: `P_acceptable_unif = |acceptable|/n`,
`E_wl_unif = mean_i wl_i`. Report **lift** = model − uniform.

### Worked example (toy position, 6 legal moves)

| Move | cp | wp | cpl | wl |
| --- | --- | --- | --- | --- |
| Re1 | 23 | 52.4 | 0 | 0.0 |
| h3 | 20 | 52.1 | 3 | 0.3 |
| b4 | 19 | 52.0 | 4 | 0.4 |
| Ng5 | −14 | 49.9 | 37 | 2.5 |
| d4 | −42 | 46.6 | 65 | 5.8 |
| Bxf7+ | −647 | 0.9 | 670 | 51.5 |

`best = Re1`; `best_set = {Re1, h3, b4}`; `acceptable = {Re1, h3, b4}` (Ng5 at 2.5 > 2.0).

Model answer: Bxf7+ 0.48, d4 0.20, Re1 0.12, h3 0.10, b4 0.06, Ng5 0.04 (sum 1.00), pick Bxf7+.

- `cpl = 670`, `wl = 51.5` → **blunder**; `top1 = false`, `acceptable_pick = false`
- `P_best_set = P_acceptable = 0.12 + 0.10 + 0.06 = 0.28`
- `E_wl = 0.48·51.5 + 0.20·5.8 + 0.10·0.3 + 0.06·0.4 + 0.04·2.5 = 26.03`
- Uniform: `P_acceptable_unif = 3/6 = 0.50`, `E_wl_unif = 60.5/6 = 10.08` → lift is **negative** (worse than random on this position)
- `entropy = 1.4565 / ln 6 = 0.81`; Brier term for calibration (§7): `(0.48 − 0)² = 0.2304`

## 6. Aggregation

- **Unit = position.** Average repeats within a position first, then average over positions
  (every position weighs the same). Games use plies as the unit and also report per-phase
  numbers (opening ply ≤ 20, middlegame, endgame ≤ 14 pieces).
- **Headline strata:** `quiet`, `tactical`, `opening`, `endgame`, `novel`. `mate` is excluded
  from headline numbers (it is a sanity check). Always also show *decisive-only*
  (`gap ≥ 5 pp`) and *overall*.
- Headline columns: `acceptable-pick rate`, `ACPL` (mean and median), `mean wl`,
  `error rate (wl ≥ 10)`, `blunder rate (wl ≥ 20)`, `P_acceptable`, `E_wl`, `top1_set`.
- Game ACPL: mean `cpl` over the model's plies (white and black reported separately).

## 7. Calibration

Event `A` = the pick is `acceptable`. Predicted probability = `p_pick`.

- **Brier** = mean `(p_pick − 1[A])²`
- **ECE** = Σ over 10 equal-width bins of `(n_bin/N) · |mean p_pick − mean 1[A]|`
- **Reliability points** = `(mean p_pick, mean 1[A], count)` per bin, drawn as a diagram
- **AUROC** of `p_pick` for predicting `A` (does confidence rank good picks above bad ones?)

Report by stratum (M0 hint: P(pick) 0.48–0.65 on a blunder vs 0.98 on a mate — confidence
is position-type dependent, so pooled calibration is misleading).

## 8. Stability and sensitivity

- **Pick agreement** = fraction of positions where all `N` repeats chose the same move.
- **Probability drift** = mean over positions of `max p_pick − min p_pick` across repeats.
- **Order sensitivity** (ablation) = for order A vs B: pick-flip rate and mean `|Δ p_pick|`.
- **Mirror consistency** (ablation) = fraction of positions where the pick on the colour-
  flipped copy is the mirrored pick.

## 9. Cost and latency

Only non-cached attempts count.

- `cost_per_1k_decisions = 1000 · mean(cost_usd)`; `cost_per_game = Σ cost_usd`
- Latency `p50`/`p95` from a **concurrency = 1** pass; other passes record `concurrency` and
  are labelled "loaded".
- Report average `input_tokens` per arm (the `clean` vs `hinted` token difference is a result).

## 10. Intervals and tests

- 95 % bootstrap CIs: 10,000 resamples of **positions**, percentile method, RNG seed 1234.
- Paired comparisons (arm A vs B, same positions): bootstrap the per-position difference;
  declare a difference only if the CI excludes 0. Show a warning when `N < 100`.
- Rank stability (M4): repeatedly subsample positions and report how often the arm ordering
  is preserved — this answers "how many positions do we need".

## 11. Baselines

| Baseline | Definition |
| --- | --- |
| `random` | pick uniformly among legal moves (expected values computed analytically, no sampling) |
| `uniform` | distribution `p_i = 1/n` (for `P_acceptable`, `E_wl`) |
| `greedy` | highest-value capture (MVV), else lowest-index legal move; deterministic |
| `stockfish-dN` | Stockfish at depth N picks `best` (ceiling; ACPL ≈ 0 by definition) |

---

# Part B — Series, ladder and Elo (headline)

## B1. Game result

For a game between a model arm and a ladder level, the model's score is `s ∈ {1, ½, 0}`.
Terminations: checkmate, stalemate (½), insufficient material (½), threefold/50-move (½),
200-ply cap (½), adjudication (win/loss for the side ahead, flagged `adjudicated`).
`aborted` games (transport failure after retries) are **excluded**, never counted as losses.

**Adjudication rule** (cost saver, standard in engine testing): using the depth-14 judge's
White-POV eval after each ply, if `ply ≥ 30` and the eval satisfies `|cp| ≥ 900` for 6
consecutive plies with the same sign, the game ends and the side ahead wins. The judge runs
asynchronously, so adjudication is checked when a ply's judge result arrives; at most one
extra ply may be played. Drawish adjudication is not used.

## B2. Ladder

A **level** is a deterministic recipe for an opponent. Ids and recipes (v1):

| id | Recipe |
| --- | --- |
| `random` | uniformly random legal move |
| `eps75`, `eps50`, `eps30`, `eps15` | with probability ε pick a uniformly random legal move, else play as `uci1320` |
| `uci1320` … `uci2800` | Stockfish 19, `UCI_LimitStrength=true`, `UCI_Elo=N`, `go movetime M`, `Threads=1`, `Hash=32`; N ∈ {1320, 1500, 1700, 1900, 2100, 2400, 2800} |

`M` = `ladder_movetime_ms` (default **50**), fixed for the whole ladder version. Random draws
use a per-game seeded RNG (logged), so a game is reproducible given its seed.

### Calibration (CPU only, $0)

`chessdecide ladder calibrate` plays engine-vs-engine games on a fixed set of seeded random
4-ply openings, colours swapped:

1. Pairs: every level against its two neighbours on the ordered list plus `uci1320` against
   `uci1700` and `random` against `eps50` (to tie the weak end into the chain).
   **200 games per pair** (≈ 100 openings × 2 colours); 4 parallel workers.
2. Fit one Elo per level by maximising the same quasi-likelihood used in B3 over *all*
   calibration games, with the single constraint **Elo(`uci1320`) = 1320**.
3. Write `data/ladder/ladder-v1.json`:
   ```json
   { "version": 1, "movetime_ms": 50, "sf_version": "Stockfish 19", "calibrated_at": "…",
     "anchor": {"level": "uci1320", "elo": 1320},
     "levels": [ {"id":"random","elo":250,"se":18,"games":400}, … ] }
   ```
4. Sanity output: nominal `UCI_Elo` vs measured Elo per level (a warning if any measured gap
   between adjacent SF levels differs from nominal by > 100 Elo — the *measured* values are
   still what the app uses).

The numbers in examples below (`random` 250, `eps75` 560, `eps50` 790, `eps30` 980,
`eps15` 1150, `uci1320` 1320, `uci1500` 1500) are **placeholders for illustration**; real
values come from step 3. Until a calibrated file exists the app loads
`packages/core/ladder/default_ladder.json` (nominal values, `"calibrated": false`) and the UI shows
a persistent "uncalibrated ladder" notice on every Elo.

Every series stores the ladder `version` it used; Elo values are only comparable across
series with the same ladder version.

## B3. Elo posterior

Given games `g = 1..n` against levels with Elo `R_g` and scores `s_g`:

```
grid R = 0, 1, …, 3500
logprior(R) = −½ ((R − 1200) / 600)²                       # weak normal prior
e_g(R)      = 1 / (1 + 10^((R_g − R) / 400))                # expected score
loglik(R)   = Σ_g [ s_g·ln e_g(R) + (1 − s_g)·ln(1 − e_g(R)) ]
post(R)     ∝ exp(logprior + loglik), normalised over the grid
```

Clamp `e_g` to `[1e-12, 1 − 1e-12]`. Report:

- `elo` = posterior **mean**
- `lo`, `hi` = the 2.5 % and 97.5 % posterior quantiles (**95 % credible interval**)
- `half_width = (hi − lo) / 2`
- `score_pct` = Σs / n; `W`, `D`, `L` counts

The quasi-likelihood treats a draw as ½ of a Bernoulli outcome. It is slightly conservative
(intervals a bit wide) when draws are frequent, and needs no draw-model parameters.

### Worked example (placeholder ladder values)

| Step | Games | Posterior mean | 95 % CrI |
| --- | --- | --- | --- |
| prior only | — | 1233 | 196 – 2381 |
| block 1 vs `eps15` (1150, nearest to 1200) | 0, 0, ½, 0, 0 | **751** | 220 – 1150 |
| next = nearest to 751 → `eps50` (790). Block 2 | 0, ½, 0, 1, 0 | **681** | 368 – 949 |
| next = nearest to 681 → `eps50` (790). Block 3 | 1, 0, ½, 0, 1 | **733** | 518 – 933 |

(Prior mean is 1233, not 1200, because the grid is truncated at 0.) Tests must reproduce
these values to ±1 Elo.

## B4. Scheduler (adaptive blocks)

```
block_size = 5 games
game i uses colour white if i is even else black (model's colour), opening index floor(i/2)
block 1 opponent  = level nearest to 1200 (prior mean)
block k+1 opponent = level nearest to posterior mean after block k
run up to 2 games of a block in parallel (provider concurrency cap)
after every finished game: recompute posterior, publish `elo` event
```

Openings are paired (same opening, colours swapped) when both games fall in the same block;
a pair split across a block boundary may face different opponents — an accepted loss of
pairing. All opening seeds derive from `series.seed`.

**Stop rules**

| Preset | Stops when |
| --- | --- |
| Quick | 25 games finished |
| Standard | 50 games finished |
| To completion | `half_width ≤ target` (default 75, minimum 25 games first), or 200 games, or budget cap, or user stop |

All presets also stop on budget cap (`stopped_budget`, resumable after raising the cap), and
on 3 consecutive `aborted` games (`stopped_error`).

A **fixed-opponent** series (user picks one level) skips the adaptation; the posterior and
stop rules are identical.

## B5. Precision guide (shown in the UI)

95 % half-width ≈ `1.96 · 695 · √(0.25/n)` Elo at a 50 % score: 25 games ≈ ±136, 50 ≈ ±96,
100 ≈ ±68, 200 ≈ ±48. Adaptive opponent selection keeps scores near 50 %, so this is close to
the achievable precision; draws and a tighter prior only improve it.

## B6. Comparing arms

- Two arms are "separated" if their 95 % credible intervals do not overlap; if they overlap,
  the leaderboard shows no rank order, only the overlap.
- When intervals overlap but you need an answer: extend the weaker-evidenced series
  ("To completion") or play a head-to-head match (M5).
- Compute the difference posterior by convolving the two grid posteriors; report
  `P(arm A > arm B)`.

## B7. Secondary metrics from games

Every model ply is judged at depth 14 (Part A formulas, with the live oracle). Per series:
ACPL (mean, median), acceptable-move rate, mistake rate (`wl ≥ 10`), blunder rate (`wl ≥ 20`),
mean `P_acceptable`, mean `E_wl`, Brier/ECE of `P(pick)` vs `acceptable`, score as White vs as
Black, per-phase ACPL (opening ply ≤ 20 / middlegame / endgame ≤ 14 pieces), average plies per
game, adjudicated fraction, cost per game, latency p50/p95, tokens per decision. Report these
*with* the Elo so a rating is never shown without its explanation.

## B8. Later: model vs model

A head-to-head game is an observation between two free parameters. Joint fit: for all arms
`A` with free `R_A` and the fixed ladder anchors, maximise
`Σ_games s·ln e + (1−s)·ln(1−e)` over every game (ladder or head-to-head) plus the weak prior,
with `e` from the two ratings' difference. Report per-arm posterior (coordinate-wise marginals
from a Laplace approximation or MCMC; implementation choice deferred to M5) and a pairwise
cross-table of scores.
