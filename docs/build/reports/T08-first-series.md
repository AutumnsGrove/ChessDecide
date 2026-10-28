# T08 — First real series (PAUSED, resume next session)

Date: 2026-10-28 · Machine: Autumn's Mac (Stockfish 19, Node 26.7.0, pnpm 10.28.0)
Model: `typesafe/jev-1.14`, arm `clean` · Size **Quick 25** · Ladder **adaptive** · Cap **$0.50**
Series: `01M625J2GZ003DBZWK012ERQQ8` · ladder **v2** (calibrated) · judge depth 14 · concurrency 2
Screenshots: `T08-start.png`, `T08-paused.png`

> **Status: paused at 5 finished / 25** to wrap up the session. The two in-flight `eps50` games
> (ply 62 and 54) are paused too. Resume next session: start `pnpm dev`, open
> `/series/01M625J2GZ003DBZWK012ERQQ8`, press **Resume** (or `POST /api/series/:id/start`).

## Estimate before starting

`≈ $0.073 typical · up to $0.184 worst · 25 games` (cap $0.50). Not over cap.

## What has happened so far

| | |
| --- | --- |
| Finished games | **5** (all vs `uci1320`) |
| In flight (paused) | 2 vs `eps50` (plies 62 and 54) |
| Aborted / errors | **0 / 0** |
| Result so far | **0 W – 0 D – 5 L**, score 0 % |
| Provisional Elo | **668 ± 553** (95 % interval 81–1186) |
| Blocks | 1: `uci1320` (1320), 5 games, 0 % · 2: `eps50` (614), 2 games in flight |
| Series cost (finished games) | **$0.002885** |
| All attempts so far (incl. in-flight) | **$0.005262** · session spend $0.0053 |
| Wall clock | ≈ 6.5 min for 5 finished + 2 in flight |
| Model calls (5 finished games) | **74** (14.8 / game), 0 cache hits, 1 forced ply |
| Retries / 429s | **9 network retries, 0 × 429**, all recovered; 0 aborts |
| Illegal moves | **0** |

Adaptive behaviour worked: after losing 0–5 to `uci1320`, the next block moved down to `eps50`
(614), the level nearest the provisional mean (668). That is within 54 Elo of the estimate.

## Secondary metrics (5 finished games)

| Metric | Value |
| --- | --- |
| ACPL / median | 97.9 / 5.0 cp |
| Acceptable moves | 81.1 % |
| Mistakes / blunders | 14.9 % / 9.5 % |
| Mean P(acceptable) | 0.75 |
| Expected win-loss | 8.7 pp |
| Brier / ECE | 0.545 / 0.615 |
| Score as White / Black | 0 % / 0 % |
| Average plies | 30.2 |
| Adjudicated | 80 % |
| Cost per finished game | **$0.00058** |
| Latency p50 / p95 | 531 / 1,787 ms |
| Average input tokens | 928 |

## Observations

- **Jev is clearly below `uci1320`**: five straight losses, all around 30 plies, four adjudicated.
  The two `eps50` games are much longer (60+ plies), so its level is likely around `eps50`/`eps30`
  (≈ 600–820), not 1000+. The next blocks will settle it.
- The estimator is conservative: $0.073 / 25 = $0.00294 per game vs **$0.00058** actual (≈ 5× high).
  Games are short and calls cheap.
- The 95 % interval at 5 games is ±553, wider than the documented ±136 at 25 (and the ±304 hint at 5)
  because the prior is still strong and the record is 0–5. Expect it to tighten quickly.
- The 9 retries were `TypeError: fetch failed` network errors, all retried successfully by the client;
  no 429s, no aborts, no illegal moves.
- Cost is far below the $0.10–0.15 expectation: 25 games should land around **$0.015–0.02**, not $0.10.

## Next session

1. Resume the series; let it finish all 25 games.
2. Update this report with the final Elo ± interval, W-D-L, all blocks, final cost, wall-clock and
   per-game numbers; take the final 400 px screenshot.
3. Run the T08 STOP question (D1 Ultra next / hinted arm / continue to T09 / pause).
