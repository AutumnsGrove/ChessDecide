# Handoff — where we left off (2026-10-30, session 6)

Autumn uses **she/her** pronouns. She often works by voice: keep replies short and conversational.

## 1. State

**The core buildout is finished (T00–T13) and the public site is live.** A real `core-v1` bench run
is **in progress right now** (restarted 14:42 local / 18:42 UTC after raising `max_hours` to 16), writing results that auto-commit when
it ends.

| Task | State |
| --- | --- |
| T00–T12 | done; T10–T12 deployed |
| **T13 headless bench** | **done: code committed, `core-v1` run in progress** |
| **Next: roster sweep** | **runbook `docs/BENCH-RUNBOOK.md` + plan `bench/plans/all-models-v1.json`** |
| Live site | https://chessdecide-web.m7jv4v7npb.workers.dev (4 arms, 100 games, ladder v2) |

Current numbers on the public site (Quick 25 series): D1U hinted 895 ± 162, Jev hinted 775 ± 159,
D1U clean 733 ± 158, Jev clean 532 ± 160.

## 2. The run in progress

- Command: `pnpm cli bench run --plan bench/plans/core-v1.json` (detached; log `/tmp/bench-core-v1.out`).
- 4 cells × standard 50 = 200 games, caps $0.50/series and $2.00/run, `max_hours` 16. Measured pace
  early on ≈ 1–2 min/game, so **ETA ≈ 4–7 h**, spend ≈ $0.10–0.25 (per-game logs: $0.0004–$0.0025).
  The first 5 games of cell 1 survived the restart (resume matched the series name).
- Watch: `pnpm cli bench status` (or `--json`), `tail -f /tmp/bench-core-v1.out`,
  `pnpm cli bench status --run core-v1-20261030-1842`.
- A detached watcher (`/tmp/commit-bench.sh`, pid in `/tmp/commit-bench.pid`) commits
  `docs/build/reports/bench-core-v1-*/` as **`Record core-v1 bench results`** once `report.md` appears.
  It does **not** push; push when you are happy with the report.
- The run's SQL lives in that bundle: `docs/build/reports/bench-core-v1-*/sql/part-*.sql`. Publish later
  with `wrangler d1 execute DB --remote --config wrangler.production.jsonc --file …` per file
  (`docs/DEPLOY.md` §7), then check `/api/leaderboard` shows ladder v2 and the 50-game intervals.
- Do **not** run `pnpm verify` or `pnpm e2e` while it runs (Stockfish contention).

## 3. After the run

1. Read `docs/build/reports/bench-core-v1-*/report.md`; the leaderboard should keep one series per arm
   (T09 picks the latest finished), so the 50-game intervals replace the 25-game ones.
2. Commit (the watcher does it) and push.
3. Publish the bundle's SQL to the production D1, then open the site and confirm the new intervals.
4. For the full roster sweep, hand a remote agent **`docs/BENCH-RUNBOOK.md`**. It installs Stockfish,
   runs `bench/plans/all-models-v1.json` (19 models ≤ $0.06/M × clean + hinted × 50 games, 1,900 games; Jev 1.14 and D1 Ultra are left to `core-v1`), keeps a monitor
   log, and commits the bundle. That box has no wrangler: publish its `sql/part-*.sql` from this
   machine afterwards (`docs/DEPLOY.md` §7).

## 4. Catches worth remembering

- **Bench plan paths resolve from where you invoked the CLI** (`INIT_CWD`), not `packages/runner`;
  artifacts default to `<repo>/docs/build/reports`, scratch to `data/bench/<run>/`.
- **`--mock`/`CHESSDECIDE_MOCK=1`** runs the identical code path with zero spend. Preflight still
  checks git identity, Stockfish, the ladder file and the DB.
- **Resume:** re-running the same command continues an unfinished manifest. A finished run says
  "already complete". Changing the plan is an error (`--new`) except after a budget stop (raising
  `run_cap_usd` is the documented resume).
- **`attempts.request_gz` was always null until T12** — `ModelPlayer` never recorded the request.
  It now stores `request_json` (local-only), so the raw pair D13 promises exists.
- **Image arm** (`@chessdecide/render`): first real game was 0-1 adjudicated, 40 plies, $0.001467,
  ~22 % more per game than clean, no visible gain. `docs/SPIKE.md` §10.
- **PGN move numbers follow the start FEN**: random-opening games start at move 3, so the export says
  `3. e4`, and a Black-to-move start emits `1... e5`.
- **Public mode derives the ladder from published rows** (`loadPublishedLadder`) and serves
  `/api/ladder` read-only; otherwise the public leaderboard filters on nominal v0 and is empty.
- A leaderboard arm is **model + arm** (`liquid/d1-ultra#hinted`). Never merge the preset alone.
- `ApiError(code, message, status)` — the third argument is the HTTP status.
- `pnpm build` needs `apps/web` to depend on `cookie@2.0.1` (SvelteKit externalises it); a stray CJS
  copy outside the repo broke the route analysis.
- `outputPaths` in `publish.ts` now always numbers files (`part-001.sql`) so a single-file run matches
  the DEPLOY runbook.

## 5. Real-run numbers so far (Quick 25, ladder v2, cap $0.50)

| Model · arm | Elo (95 %) | W-D-L | ACPL | Cost |
| --- | ---: | --- | ---: | ---: |
| D1 Ultra · hinted | **895 ± 162** | 11-2-12 | 140.8 | $0.0091 |
| Jev · hinted | **775 ± 159** | 11-1-13 | 154.3 | $0.0210 |
| D1 Ultra · clean | **733 ± 158** | 8-2-15 | 177.6 | $0.0099 |
| Jev · clean | **532 ± 160** | 8-2-15 | 231.5 | $0.0299 |

The `core-v1` run replaces these with 50-game series (same arms) unless it stops early.

## 6. Not planned

Phase 2 (live Cloudflare: Durable Objects + hosted Stockfish), scale-out, and model-vs-model are out
of this curriculum.
