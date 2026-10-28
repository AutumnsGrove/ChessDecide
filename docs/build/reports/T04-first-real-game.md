# T04 — First real game

Date: 2026-10-28 · Machine: Autumn's Mac (Stockfish 19, Node 26.7.0, pnpm 10.28.0)
Model: `typesafe/jev-1.14`, arm `clean` · Opponent: `eps75` (Stockfish 1320, 75 % random)
Game: `01M61RFX98RJV4HC5Z3V3RXNZV` · Jev White, start position · pace Watch (600 ms) · cap **$0.05**
Raw data: `T04-game.json` · Screenshots: `T04-start.png`, `T04-mid.png`, `T04-end.png`

## 1. Probe (one call, start position)

| | |
| --- | --- |
| Pick | `e4` (e2e4), p_pick 0.89 |
| Latency | 704 ms |
| Tokens | 769 input, 220 output |
| Cost | **$0.000032** |
| Request size | 778 bytes |
| Retries | 0 |

The estimator's formula would price this call at 1,750 tokens → $0.0000735, i.e. 2.3× the actual
cost. First data point that the estimator is conservative.

## 2. Game result

| Metric | Value |
| --- | --- |
| Result | **1-0, checkmate** (Jev wins) |
| Termination | `checkmate` — `Qxf7#` on ply 21 |
| Plies | 21 (11 model plies, 10 engine plies) |
| Forced plies | 0 |
| Wall clock | ≈ 71 s (Watch pace) |
| Total cost | **$0.000544782** |
| Model calls | 11 (0 cache hits) |
| Avg cost / call | $0.0000495 (range $0.000032–$0.000067) |
| Avg latency | 430 ms |
| Avg input tokens | 1,179 |
| Retries / 429s / HTTP errors | 0 / 0 / 0 |
| Illegal moves | 0 |
| `invalid_choice` retries | 0 |
| `/api/spend?since=session` | `{ usd: 0.000544782, calls: 11, cache_hits: 0 }` |
| Total T04 spend (probe + game) | **$0.000577** |

## 3. Cost vs estimate

The dialog estimated **$0.00294** (40 calls × 1,750 tokens × $0.042/M) before the game.
Actual: **$0.000545**. Relative error `|actual − estimate| / actual` = **4.40 (440 %)**.

The estimator is conservative (≥ actual), which is the desired direction. The gap has two causes:

1. the game ended in 11 model calls instead of the typical 40 (21 plies, not 80);
2. real input was 1,179 tokens per call, not 1,750 (33 % lower).

The rolling mean (after 20 real calls) will tighten this automatically. No change needed.

## 4. Move quality (Stockfish 19, depth 14)

| Metric | Value |
| --- | --- |
| ACPL (mean `judge.cpl`, 11 judged plies) | **198.2 cp** |
| Acceptable (`win_loss ≤ 2 pp`) | 81.8 % (9 / 11) |
| Inaccuracies | 0 |
| Mistakes | 0 |
| Blunders | 1 |
| Mean p_pick | 0.16 (range 0.07–0.86) |

The one blunder was ply 7 `Nxd4` (cpl 132, Stockfish preferred `Nxe5`); Jev was still winning
afterwards. Plies 9–17 show large raw CPLs (246–545) but are classed `ok` because the position was
already winning (`win_loss ≤ 5 pp`): they are slower mates, not losing moves. ACPL alone therefore
overstates the weakness here; the acceptable rate and W/D/L are the better signals.

Confidence is low in the opening/middlegame (p_pick 0.07–0.24) yet the chosen moves are strong, so
`p_pick` should not be read as move quality.

## 5. What looked wrong

- Nothing in the game path: 0 illegal moves, 0 retries, 0 errors, 0 forced-move surprises.
- One setup bug, fixed before the run: `loadEnv()` resolved `.env` from the process cwd, and pnpm runs
  the CLI with cwd `packages/runner`, so the root `.env` was ignored. It now resolves the repo root
  (`packages/runner/src/config.ts`) and has a unit test.
- The New game dialog's estimate showed "Estimating…" in the automated capture because the screenshot
  was taken immediately after opening; the value arrives ~300 ms later. Not a product bug.
- The game was capped at `max_plies: 120` for T04 (route interception on the create call); it ended
  long before that. The dialog still sends 200 by default.

## 6. Recommendation

**Continue** to T05 (ladder calibration) and T06 (series runner). The stack works end to end with a
real model: UI → API → model call → Stockfish judging → D1 → live viewer. Cost is ~$0.00055 per game
(≈ 1 % of the cap), so a 25-game Quick series should cost well under $0.05 rather than the $0.10–0.15
budgeted. `eps75` was too weak for Jev — the adaptive ladder is the right next step to find its level.

## 7. Extra game before calibration (eps30)

Requested after the first result: same setup, opponent one rung up (`eps30`, nominal 980).
Game `01M61RTAG7TFTR8HQEPBXBRYRC`, raw data `T04b-game.json`, screenshots `T04b-*`.

| Metric | Value |
| --- | --- |
| Result | **1-0, adjudicated** (Jev ahead ≥ 900 cp for 6 plies from ply 30) |
| Plies | 35 (18 model plies) |
| Wall clock | ≈ 62 s |
| Cost | **$0.00071064** |
| Model calls | 16 real + **2 cache hits** (0 cost) |
| Avg cost / call | $0.0000444 |
| Avg latency | 302 ms |
| Avg input tokens | 1,058 |
| Forced / retries / errors | 0 / 0 / 0 |
| ACPL | 198.2 cp |
| Acceptable | 88.9 % (16 / 18) |
| Inaccuracies / mistakes / blunders | 0 / 0 / 2 |

The two cache hits are repeated requests inside the game (same position + history + arm), served
from `attempts` at zero cost. The estimator again over-predicted ($0.00294 vs $0.000711).

Jev also beat the nominal 980 level, so the interesting next question is where it sits relative to
`uci1320` (the ladder anchor). That is exactly what T05 calibration + the adaptive series are for.
Combined T04 spend: probe $0.000032 + game 1 $0.000545 + game 2 $0.000711 = **$0.001288**.
