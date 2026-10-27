# T08 — FIRST REAL SERIES (checkpoint: stop and ask)

**Goal:** one Quick series for one real arm, to learn the real cost, wall-clock and rating level. Needs the key and (ideally) a calibrated ladder from T05.

## Before starting
- If no `data/ladder/ladder-v*.json` exists, ask Autumn: **Run calibration first (recommended; hours of CPU, $0)** or **Use the nominal ladder for this first look**.
- Expected spend ≈ $0.10–$0.15 for 25 games; set the series cap to **$0.50** for this task.

## Steps
1. Start `typesafe/jev-1.14`, arm `clean`, size Quick, ladder adaptive, cap $0.50, from the UI. Let it run unattended; check in on `/series/:id`.
2. If a game aborts or the series stops, diagnose from the `attempts` table and the game's status reason; fix real bugs (new commit), not by skipping tests.
3. When finished record in `docs/build/reports/T08-first-series.md`: Elo ± interval, W-D-L, the levels visited (blocks), total cost, cost per game,
   wall-clock for the series and per game, calls per game, retries/429 counts, ACPL, acceptable-move rate, blunder rate, average plies, adjudicated fraction,
   whether the estimate was conservative, and the 95 % interval vs the documented ±136 for 25 games.
4. Sanity checks to report (do not hide failures): illegal moves must be 0; the adaptive levels must have moved toward the model's strength (the last block's level should be
   within ~300 Elo of the final estimate); if the series ended at the ladder floor (`random`, 250) say so plainly.
5. Screenshots (Playwright, 400 px) of the series detail, saved under `docs/build/reports/`.
6. Commit the report: `Record first real series results`.

## STOP
AskUserQuestion: "First series done: Jev·clean ≈ <elo> ±<hw>, $<cost>, <minutes> min. Continue?" Options: **Run D1 Ultra·clean next**, **Run hinted arm for Jev**,
**Continue with leaderboard and publishing (T09)**, **Pause here**. Do not start T09 until answered.
