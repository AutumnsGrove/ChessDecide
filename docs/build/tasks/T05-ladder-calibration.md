# T05 — Ladder calibration (CPU only, $0)

**Goal:** replace nominal ladder Elos with measured ones. Output `data/ladder/ladder-vN.json` and `ladder_levels` rows.
Pure maths already exists and is tested: `fitLadder`, `calibrationPairs` (`packages/core/src/ladder-fit.ts`).

## Files

`packages/runner/src/ladder.ts` (new), `packages/runner/src/cli.ts` (command), `packages/db/src/ladder-store.ts` (new, + test),
`packages/core/src/ladder-warnings.ts` (new, + test), `packages/api/src/api.ts` (`GET /api/ladder` real), `packages/runner/test/ladder.test.ts`.

## 1. Command

`pnpm cli ladder calibrate [--games-per-pair 200] [--workers 4] [--movetime 50] [--seed 1] [--resume]`

1. Levels = `DEFAULT_LADDER.levels` ordered by nominal Elo. Pairs = `calibrationPairs(ids)`.
2. Version `N` = (highest existing `data/ladder/ladder-v*.json`) + 1. Create `ladder_levels` rows only at the end; `ladder_games` rows as games finish.
3. Openings: 100 seeded openings `randomOpening(subSeed(seed, i), evalCp)` where `evalCp` is one depth-10 search by a dedicated Stockfish (full strength).
   Game `g` of a pair uses opening `floor(g/2) % 100`, and level `a` plays White when `g` is even.
4. Each game: build both opponents with `makeOpponent(level, makeEngine, rng, movetime)` where `rng = mulberry32(subSeed(seed, hash(pair, g)))`;
   loop `applyMove`/`outcomeOf` (reuse `core` functions; **no judge, no store of plies**), `max_plies` 200 → draw; record
   `{a, b, a_color, result, plies, opening_seed}` into `ladder_games`. Close engines after each game.
5. Run `--workers` games concurrently (default 4). Each worker owns its engine processes. Do not run while a series is running (the daemon refuses: see §4).
6. After a first batch of 20 games print an ETA (`games_total × mean_seconds / workers`). No prompt, just print.
7. `--resume`: skip games already present in `ladder_games` for this version (same pair, same game index: store `game_index`). Without `--resume` start a new version.
8. When all games are in: `fitLadder(games, ids, {level:'uci1320', elo:1320}, nominalStart)`. Write the file:
   ```json
   { "version": N, "calibrated": true, "movetime_ms": 50, "sf_version": "<engine.version()>", "calibrated_at": "<iso>",
     "anchor": {"level":"uci1320","elo":1320}, "levels": [ {"id","kind","label","elo","se","games","eps?","uci_elo?"} ] }
   ```
   and insert `ladder_levels` rows. Print a table `id · nominal · measured ± se · games` and warnings.
9. `ladderWarnings(levels, nominal)` (pure): for each adjacent pair of `uci*` levels, warn when the measured gap differs from the nominal gap by > 100 Elo;
   warn when levels are not strictly increasing in the nominal order. The **measured** values are still what the app uses.

## 2. Loading

`loadLadder(dataDir): LadderFile` in the runner: highest-numbered `ladder-v*.json` if present (validate shape; ignore a corrupt file with a warning),
else `DEFAULT_LADDER` (`calibrated:false`, `version:0`). `GET /api/ladder` returns it; series store its `version` (T06).

## 3. DB helper (`ladder-store.ts`)

`saveLadderLevels(db, file)`, `loadLadderLevels(db, version)`, `addLadderGame(db, row)`, `ladderGameCount(db, version, a, b)`; tests on local D1.

## 4. Guard

The daemon refuses `calibrate` while any series or game is `running` (the CLI checks `games.status='running'` in the DB and exits 2 with a message).

## Tests

- Fast end-to-end with fake engines: a `makeEngine` stub returning an engine that always plays the first legal move; with `--games-per-pair 6` the run
  finishes in seconds, writes `ladder-v1.json`, inserts rows, and `loadLadder` returns it. Resume: killing after N games and rerunning with `--resume` plays only the rest.
- `ladderWarnings` table tests. `loadLadder` ignores a corrupt file.
- (needs Stockfish, skipped otherwise) one real pair, 4 games, 20 ms: completes and results are legal games.

## Acceptance

`pnpm verify` green. Then run the real calibration **in the background** and record the wall-clock in `docs/CHANGELOG.md`:
`pnpm cli ladder calibrate --games-per-pair 200 --workers 4` (expect roughly 1–3 hours on a laptop). If it is projected to take > 6 h, ask.
Record nominal-vs-measured in `docs/SPIKE.md` §10.

Commit: `Add ladder calibration job`.
