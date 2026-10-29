# T08b — Four arms on one ladder (Jev and D1 Ultra, clean and hinted)

Date: 2026-10-29 · Machine: Autumn's Mac (Stockfish 19, Node 26.7.0, pnpm 10.28.0)
Ladder **v2** (calibrated) · Quick 25 · adaptive · cap $0.50 · judge depth 14 · concurrency 2
Screenshots: `T08-end.png` (Jev clean), `T08b-jev-hinted.png`, `T08b-d1u-clean.png`, `T08b-d1u-hinted.png`

Four Quick series, one after another, all finished on the same ruler. No aborts, no illegal moves,
no 429s, no series hit the cap.

| Model · arm | Series | Elo (95 %) | W-D-L | Score | ACPL | Acc. | Blunders | Cost | Calls |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| **D1 Ultra · hinted** | `01M64EK96XRMJWEAQXA97CFXYY` | **895 ± 162** (734–1057) | 11-2-12 | 48 % | 140.8 | 83.5 % | 11.5 % | $0.0091 | 556 |
| **Jev · hinted** | `01M64BJR3QV9KBBT2NQY2ETB0M` | **775 ± 159** (618–935) | 11-1-13 | 46 % | 154.3 | 79.2 % | 15.1 % | $0.0210 | 581 |
| **D1 Ultra · clean** | `01M64D1GEA348WMA5H8WGPBRFX` | **733 ± 158** (573–888) | 8-2-15 | 36 % | 177.6 | 76.9 % | 16.5 % | $0.0099 | 571 |
| **Jev · clean** | `01M625J2GZ003DBZWK012ERQQ8` | **532 ± 160** (370–690) | 8-2-15 | 36 % | 231.5 | 76.2 % | 19.6 % | $0.0299 | 812 |

Total spend for the four series: **$0.0709** (Jev hinted + both D1 Ultra runs added $0.0410 on top of
the $0.0299 T08 run). Wall clock ≈ 18 + 17 + 15 + 17 min ≈ **67 min** of machine time.

## What the arms did

| # | Opponent | Jev clean | Jev hinted | D1U clean | D1U hinted |
| --- | --- | ---: | ---: | ---: | ---: |
| 1 | `uci1320` (1320) | 0 % | 0 % | 0 % | 20 % |
| 2 | `eps50` (614) | 30 % | 80 % | 70 % | — |
| 3 | `eps75` (391) | 80 % | — | — | — |
| 4 | `eps30` (819) | — | 20 % / 30 % | 60 % / 10 % / 40 % | 30 % / 90 % |
| 5 | `eps15` (1037) | — | — | — | 0 % |
| 6 | `eps50` (614) | 30 % / 40 % | 100 % | — | 100 % |

- **Every arm is bounded by `uci1320` above and somewhere around `eps50`–`eps30` below.** Nothing
  beat 1320 except a single D1 Ultra hinted game (1 of 5).
- **The adaptive ladder behaved sanely in all four runs**: it walked down after losing blocks and up
  after winning ones, and the last block was always within ~300 Elo of the final estimate.
- **Results are noisy at 5-game blocks.** Jev hinted won 5/5 vs `eps50` in its last block after
  scoring 4/5 in its first; D1 Ultra clean scored 60 % then 10 % then 40 % against the same `eps30`.
  Five games cannot separate 600 from 800, which is exactly what the intervals say.

## Are they separable? (METRICS.md B6)

`GET /api/leaderboard/compare` on the finished series:

| A vs B | P(A stronger) | Elo gap (95 %) | Verdict |
| --- | ---: | --- | --- |
| Jev clean vs Jev hinted | 1.6 % | −243 (−470 … −20) | **separated**: hinted is better |
| D1U clean vs D1U hinted | 7.8 % | −162 (−389 … +61) | not separable yet |
| Jev clean vs D1U clean | 3.9 % | −201 (−424 … +24) | not separable yet |
| Jev hinted vs D1U hinted | 14.9 % | −120 (−345 … +106) | not separable yet |
| Jev clean vs D1U hinted | 0.1 % | −363 (−591 … −137) | **separated** |
| D1U clean vs Jev hinted | 35.6 % | −42 (−267 … +179) | not separable yet |

Only two of the six pairs are separated at 25 games. The rest overlap — the leaderboard shows `≈`
and says so instead of inventing a rank order.

## Observations

- **The hinted arm helps both models.** Jev +243 Elo (separated), D1 Ultra +162 (same direction, not
  separated). The hinted arm gives SAN keys and move annotations, so it is a different prompt, not a
  different model: this is the first evidence that the arm matters as much as the model.
- **D1 Ultra is much cheaper for the same or better level:** $0.00037/game vs Jev's $0.00084–0.00120,
  and ~390–412 input tokens per call vs Jev's ~860. It is also faster at the median (464–565 ms vs
  425 ms, similar) but has a heavier tail (p95 2.2 s on hinted).
- **Quality metrics track Elo in the expected direction.** ACPL falls from 231 (Jev clean) to 141
  (D1U hinted); blunder rate from 19.6 % to 11.5 %; D1U hinted also has the best acceptable-move rate.
  No arm has a rating that its per-move metrics contradict.
- **All four series stayed far under the estimate.** Estimate $0.0735 each; actual $0.009–$0.030
  (2.4–8× conservative). Long games dominate cost: the 200-ply max-plies draw alone cost $0.0036.
- **Termination mix differs by arm:** Jev hinted and D1U hinted mate more often (7 checkmates each)
  and draw less; Jev clean and D1U clean gave two `insufficient material` draws and more adjudications.

## Follow-ups worth knowing

- The 895 point estimate sits above the highest level D1U hinted beat consistently (`eps30`, 819) and
  below `eps15` (1037), where it scored 0/5 — the interval (734–1057) brackets both. Treat "≈900" as
  "somewhere between `eps30` and `eps15`".
- One 5-game block per arm cannot settle clean vs hinted for D1 Ultra. A "To completion" run of one
  arm, or a head-to-head match, is the next honest step (T12/M5 territory).
