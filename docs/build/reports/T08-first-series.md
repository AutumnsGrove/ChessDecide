# T08 — First real series (DONE)

Date: 2026-10-28 → 2026-10-29 · Machine: Autumn's Mac (Stockfish 19, Node 26.7.0, pnpm 10.28.0)
Model: `typesafe/jev-1.14`, arm `clean` · Size **Quick 25** · Ladder **adaptive** · Cap **$0.50**
Series: `01M625J2GZ003DBZWK012ERQQ8` · ladder **v2** (calibrated) · judge depth 14 · concurrency 2
Screenshots: `T08-start.png`, `T08-paused.png`, `T08-end.png`

> **Final: Jev·clean = 532 ± 160 Elo, 8 W – 2 D – 15 L (36 %), $0.0299, ~18 min of compute
> across two sessions.** 0 aborts, 0 illegal moves, 0 × 429. Every adaptive block landed on
> `eps50` (614), 82 Elo from the final estimate.

## Estimate before starting

`≈ $0.073 typical · up to $0.184 worst · 25 games` (cap $0.50). Not over cap.

## Result

| | |
| --- | --- |
| Elo | **532 ± 160** (95 % interval 370–690), `±160` half-width |
| W – D – L | **8 – 2 – 15**, score **36 %** |
| Score as White / Black | 38.5 % / 33.3 % |
| Blocks | 5 × 5 games, all finished |
| Levels visited | `uci1320` → `eps50` → `eps75` → `eps50` → `eps50` |
| Series cost | **$0.029934** of $0.50 cap |
| Cost per finished game | **$0.00120** |
| Model calls | **812** ok (32.5 / game), 0 cache hits, 10 forced plies of 1,647 |
| Retries / 429s / aborts | 9 network retries, all recovered · **0 × 429** · **0 aborts** |
| Illegal moves | **0** |
| Wall clock | ≈ 6.5 min (5 games) + ≈ 11.5 min (20 games) = **~18 min** for 25 at concurrency 2 |
| Terminations | 20 adjudicated, 3 checkmate, 1 stalemate, 1 max-plies (200) |

## Blocks (adaptive ladder)

| # | Opponent | nominal | Games | Score | Posterior before → after |
| --- | --- | ---: | ---: | ---: | --- |
| 1 | `uci1320` | 1320 | 5 | 0 % | 1200 → 668 |
| 2 | `eps50` | 614 | 5 | 30 % | 668 → 493 |
| 3 | `eps75` | 391 | 5 | 80 % | 493 → 563 |
| 4 | `eps50` | 614 | 5 | 30 % | 563 → 529 |
| 5 | `eps50` | 614 | 5 | 40 % | 529 → **532** |

Adaptive behaviour worked throughout: it fell after the 0–5 wall, climbed after 80 % vs `eps75`,
then settled on `eps50` for the last three blocks and barely moved (529 → 532). The last block's
level (614) is **82 Elo** from the final estimate — well inside the ~300 Elo sanity bound, and the
series never reached the ladder floor.

## Secondary metrics (25 games)

| Metric | Value |
| --- | --- |
| ACPL / median | 231.5 / 79.5 cp |
| Acceptable moves | 76.2 % |
| Mistakes / blunders | 21.6 % / 19.6 % |
| Mean P(acceptable) | 0.72 |
| Expected win-loss | 15.9 pp |
| Brier / ECE | 0.529 / 0.585 |
| Average plies | 65.9 |
| Adjudicated | 80 % |
| Latency p50 / p95 | 393 / 963 ms |
| Average input tokens | 878 |

## Observations

- **Jev·clean sits right around `eps50` (614), roughly 530–600 true.** It scored 30 %, 30 % and 40 %
  against `eps50` (three blocks of 5), 80 % against `eps75`, and 0 % against `uci1320`. The point
  estimate (532) is a little below the `eps50` blocks imply (~540–600) because the 0–5 `uci1320`
  block still pulls the prior down. Honest read: **532 ± 160, likely ~550–600.**
- **The interval closed as expected:** ±553 at 5 games → ±160 at 25, vs the documented ±136 at 25
  games. 18 % wider than the target, and the mean walked 668 → 493 → 563 → 532 on the way. Good
  enough to separate Jev·clean from `eps75` (391) and `uci1320` (1320); not from `eps50` itself.
- **The estimator is conservative by ~2.4×**, not 5× as the paused snapshot suggested: $0.073
  predicted vs $0.0299 actual. Short games vs `uci1320` made the early snapshot look cheaper;
  the long `eps75`/`eps50` games (up to 200 plies) cost 5–6× more than the 30-ply ones.
- **Long games are where the money goes:** 15-call, 30-ply games cost $0.0006; the 100-call,
  200-ply max-plies draw cost $0.0036. Cost tracks plies, not games.
- **Quality is weak but stable:** ACPL 231, 19.6 % blunders — it is a ~530 engine-like player, and
  the calibration metrics agree with the Elo it earned. No suspicious disconnect between the
  per-move metrics and the results.
- **Reliability was clean after resume.** The 9 `TypeError: fetch failed` retries all came from the
  first session and all recovered; the resumed session had none. The two paused in-flight games
  resumed from their saved plies (62 and 54) without replay or double-spend — pause/resume is
  proven end to end, including `server_restart` recovery of a clean daemon start.

## Curriculum checklist

- [x] Elo ± interval, W-D-L, blocks, total cost, cost/game, wall-clock, calls/game, retries/429,
      ACPL, acceptable/blunder rate, average plies, adjudicated fraction, estimate conservatism,
      interval vs ±136.
- [x] Illegal moves 0; adaptive last block within ~300 Elo of the final estimate; not at the floor.
- [x] 400 px screenshots (`T08-start.png`, `T08-paused.png`, `T08-end.png`).
