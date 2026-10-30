# T13 — Headless bench runs (plan → series → committed results)

**Goal:** one command takes a **plan** (models × arms × size × repeats), runs every cell as a normal
series with no UI and no browser, unattended, on a remote box, under a **run-level budget cap**, and
leaves a **committed results bundle** (report, summary JSON, leaderboard CSV, per-series JSON, publish
SQL) that can be published to D1 from a different machine later.

Everything a series needs already exists (T06 `SeriesControlPlane`, T07 UI, T09 leaderboard, T10
publish, T11 exports). What is missing is orchestration: today a series can only be created by
`POST /api/series`, so a multi-model sweep means clicking the New series dialog N times and watching it.

## 0. What "done" looks like

```bash
tmux new -s bench
pnpm cli bench run --plan bench/plans/core-v1.json; rc=$?
[ "$rc" -ne 2 ] && git add docs/build/reports/bench-core-v1-* \
  && git commit -m "Record core-v1 bench results" && git push
```

…runs 4–16 series back to back over a few hours, survives a dropped SSH session, and ends with:

```
docs/build/reports/bench-core-v1-20261030-1412/
  report.md                 # the table Autumn reads
  summary.json              # machine-readable: plan, cells, Elo, spend, environment
  leaderboard.csv           # same columns as /api/leaderboard/export.csv
  series/<seriesId>.json    # full Series export (T11 shape), one per cell
  sql/part-001.sql …        # T10 publish SQL: the "publish from my laptop later" path
```

`git add … && git commit` is the last step of that chain, so the results exist outside the remote
box. **Nothing in T13 publishes to Cloudflare**; the SQL files are applied by hand later (see §9).

## 1. Decisions (do not re-litigate)

| # | Decision | Why |
| --- | --- | --- |
| D1 | **In-process, no HTTP.** `bench` builds the same deps `serve.ts` builds (`openLocalDb`, `createRuntime`, `SeriesControlPlane`) and drives them directly. | One process owns the local D1 and the Stockfish pool. No port, no second writer, no SSE client to keep alive. Unattended runs must not depend on a browser tab. |
| D2 | **Series are always sequential in v1.** One series at a time; each series already runs 2 games at once (`MAX_PARALLEL`). | That is the level measured at 0 × 429 over four real series. Concurrency beyond it is unmeasured, and a benchmark that throttles itself into bad data is worse than a slow one. |
| D3 | **The plan name is the experiment identity.** Series are named `<plan.name>/<model>#<arm>[/r<n>]`; `--new` re-runs under `<plan.name>@<stamp>/…`. | Resume, status and the run cap all key off the name prefix. No schema change, no migration, and the names are readable in the UI. |
| D4 | **Resume is the default; duplicate spend is the failure mode to avoid.** Re-running the same command continues unfinished cells and skips finished ones. | A dead remote session will be restarted with the same command. |
| D5 | **A run-level cap exists** (`run_cap_usd`) on top of the per-series cap. A cell's cap is `min(series_cap, run_cap − spent)`. | Per-series caps alone let a 16-cell plan spend 16 × $0.50. |
| D6 | **The estimate gate mirrors the API:** refuse when the *typical* total exceeds the run cap; warn when the *worst case* does. `--allow-over-cap` overrides. | One rule everywhere (`POST /api/series` already 402s on typical > cap). Measured actuals are 2.4–8× *below* typical, so typical is the honest gate. |
| D7 | **The ladder file is committed.** `.gitignore` keeps `data/*` ignored but allows `data/ladder/*.json`. Preflight imports it into `ladder_levels` if the local DB has no rows for that version. | `loadLadder()` silently falls back to the **nominal v0** ruler when `data/ladder/` is absent — a fresh remote clone would rate everything on the wrong ruler and publish an incomparable leaderboard. This is the same trap T10 hit in public mode. The ruler is an input, not a run artifact. |
| D8 | **Fail forward, never silently.** A cell that ends `stopped_error` or with aborted games is recorded and the run continues (unless `--stop-on-error`). | One bad model must not throw away 3 hours of finished cells. |
| D9 | **A cell watchdog.** A cell running longer than `cell_timeout_min` (default 90) is paused, marked `timeout`, and the run continues. | `DecisionsClient` has a 60 s timeout + 3 retries per call, but a wedged game loop should not eat the whole day. `pause` is graceful: in-flight plies finish, nothing is lost. |
| D10 | **Artifacts are written to `docs/build/reports/bench-<run>/` (committed); working state lives in `data/bench/<run>/` (ignored).** | The bundle must travel; `manifest.json`, `status.json` and the log are scratch. |
| D11 | **`--mock` (or `CHESSDECIDE_MOCK=1`) runs the identical code path** with `MockPlayer`, judge depth 6, catalog and estimate skipped. | The harness itself gets an end-to-end test that spends nothing and needs no network. |
| D12 | **The report never shows a bare number.** Elo always with its 95 % interval; overlapping arms get `≈`. | House rule (`docs/METRICS.md` B6, UI copy). |
| D13 | **No new migration, no new package.** Pure logic in `packages/core/src/bench.ts`, I/O in `packages/runner/src/bench.ts`. | Matches the repo's split (`core` pure + tested, `runner` adapter). |

## 2. Files

| File | What |
| --- | --- |
| `bench/README.md` | what a plan is, how to run one, what gets committed |
| `bench/plans/core-v1.json` | the real sweep: 2 models × 2 arms, standard 50, adaptive, cap $0.50 / $2.00 |
| `bench/plans/smoke.json` | 1 cell, custom 3 games, fixed `eps50`, for `--mock` tests |
| `.gitignore` | allow `data/ladder/*.json` (D7) |
| `packages/core/src/bench.ts` | **new**: plan type + parser, cell expansion, cap maths, cell state, report + summary (pure) |
| `packages/core/src/index.ts` | export the above |
| `packages/core/test/bench.test.ts` | **new** |
| `packages/runner/src/bench.ts` | **new**: preflight, run loop, resume, watchdog, artifacts, status |
| `packages/runner/src/cli.ts` | `bench run \| status \| report \| models` |
| `packages/runner/test/bench.test.ts` | **new** (mock, fake judge + fake opponent) |
| `docs/DEPLOY.md` | new section: publishing a bench run from another machine |
| `docs/build/README.md` | add T13 to the order list |
| `docs/CHANGELOG.md` | section per house rule, written after the real run |

## 3. The plan file

`bench/plans/core-v1.json`:

```json
{
  "name": "core-v1",
  "models": ["typesafe/jev-1.14", "liquid/d1-ultra"],
  "arms": ["clean", "hinted"],
  "size": { "preset": "standard" },
  "ladder": { "mode": "adaptive" },
  "ladder_version": 2,
  "series_cap_usd": 0.5,
  "run_cap_usd": 2.0,
  "repeat": 1,
  "concurrency": 2,
  "judge_depth": 14,
  "max_hours": 8,
  "cell_timeout_min": 90,
  "artifacts": { "sql": true }
}
```

`bench/plans/smoke.json` is the same shape with `models: ["typesafe/jev-1.14"]`, `arms: ["clean"]`,
`size: {"preset":"custom","games":3}`, `ladder: {"mode":"fixed","level":"eps50"}`, `judge_depth: 6`,
caps `0.05 / 0.10`, `artifacts: {"sql": false}`.

Validation (`parseBenchPlan`, pure, throws `BenchPlanError(field, message)`):

| Rule | Message names |
| --- | --- |
| `name` matches `^[a-z0-9][a-z0-9-]{1,30}$` | `name` |
| `models` non-empty, unique, non-empty strings | `models[2]` |
| `arms` non-empty, unique, every key in `ARM_PRESETS` | `arms[1]` |
| `size` is a valid `SeriesSize` (reuse the API's rules: custom 1..400, completion fields positive) | `size.games` |
| `ladder.mode` is `adaptive` or `fixed` with a non-empty `level` | `ladder.level` |
| `ladder_version` is a non-negative integer | `ladder_version` |
| `0.01 ≤ series_cap_usd ≤ 50` and `run_cap_usd ≥ series_cap_usd` | `run_cap_usd` |
| `repeat` integer 1..5 (default 1), `concurrency` 1 or 2 (default 2) | `repeat` |
| `judge_depth` integer 6..20 (default 14) | `judge_depth` |
| `max_hours` number 0.25..48 (default 8) | `max_hours` |
| `cell_timeout_min` number 5..360 (default 90) | `cell_timeout_min` |

Unknown keys are rejected (typo protection). `seed` is optional; when absent the run stamp is used, so
every run is reproducible from its `summary.json`.

`image` is a valid arm only once T12 is merged; before that the validator rejects it with
`image arm is not wired yet (T12)`.

## 4. Pure core (`packages/core/src/bench.ts`)

```ts
export interface BenchPlan { /* §3, defaults filled */ }
export interface BenchCell { index: number; model: string; arm: ArmName; repeat: number; seriesName: string }
export type CellState = 'pending' | 'running' | 'finished' | 'budget' | 'failed' | 'timeout';

export class BenchPlanError extends Error { constructor(readonly field: string, message: string) }

export function parseBenchPlan(json: unknown): BenchPlan;
/** "<name>/" or "<name>@<stamp>/" — the run's series-name prefix (D3). */
export function planPrefix(plan: BenchPlan, stamp?: string): string;
/** Stable order: models (plan order) × arms (plan order) × repeat. Names filled in. */
export function expandCells(plan: BenchPlan, prefix: string): BenchCell[];
/** min(series_cap, run_cap − spent), clamped at 0 (D5). */
export function seriesCapFor(plan: BenchPlan, spentUsd: number): number;
/** One series row → one cell state. */
export function cellState(row: { status: string; status_reason: string | null }): CellState;
export function benchReport(input: BenchReportInput): string;     // markdown, deterministic
export function benchSummary(input: BenchReportInput): BenchSummary;
```

`BenchReportInput` carries everything the report needs, including `startedAt` / `finishedAt` /
`generatedAt` as **strings passed in** (no `Date.now()` inside, so tests are stable):

```ts
export interface BenchCellResult {
  cell: BenchCell; seriesId: string | null; state: CellState;
  status: string; statusReason: string | null;
  games: number; target: number | null; costUsd: number;
  elo: { mean: number; lo: number; hi: number; games: number } | null;
  w: number; d: number; l: number;
  acpl: number | null; acceptableRate: number | null; blunderRate: number | null;
  blocks: { levelId: string; levelElo: number; games: number; score: number }[];
  abortedGames: number;
  startedAt: string | null; finishedAt: string | null;
}
export interface BenchReportInput {
  runId: string; plan: BenchPlan; planPath: string; planSha256: string; prefix: string;
  env: { node: string; stockfish: string; gitSha: string | null; host: string; mock: boolean };
  ladder: { version: number; calibrated: boolean; file: string | null };
  startedAt: string; finishedAt: string | null; stopReason: BenchStopReason;
  cells: BenchCellResult[];
  /** Result of compareArms for every pair of finished cells, already computed by the caller. */
  pairs: { a: string; b: string; pAGtB: number; diffMean: number; diffLo: number; diffHi: number }[];
}
```

`cellState` mapping: `finished → finished`; `stopped_budget → budget`; `stopped_error → failed`;
`aborted → failed`; everything else (`created`, `running`, `paused`) → `running` when it has games,
`pending` otherwise. `timeout` is set by the runner (it is a runtime fact, not a row state).

**Report layout** (deterministic, sorted by plan order, no bare numbers):

```markdown
# Bench run core-v1-20261030-1412

Plan `bench/plans/core-v1.json` (sha256 4f2a…) · seed 20261030 · judge depth 14 · concurrency 2
Ladder v2 (calibrated) · size standard (50) · caps $0.50 per series, $2.00 per run
Ran 2026-10-30 14:12 → 16:41 UTC (2 h 29 min) · node 26.7.0 · Stockfish 19 · git 1a2b3c4
**Spend $0.2134 of $2.00** · 4 cells: 4 finished · 200 games · 2 aborted

| Model · arm | Series | Elo (95 %) | W-D-L | Score | ACPL | Acc. | Blunders | Cost | Games |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| **D1 Ultra · hinted** | `01M6…` | **908 ± 112** (796–1020) | 23-4-23 | 50 % | 141.2 | 83.1 % | 11.8 % | $0.0192 | 50 |
| **D1 Ultra · clean** | `01M6…` | **769 ± 110** (659–879) | 18-3-29 | 39 % | 170.4 | 78.0 % | 15.2 % | $0.0181 | 50 |
| …

## Separated pairs (METRICS.md B6)
| A vs B | P(A stronger) | Elo gap (95 %) | Verdict |
| --- | ---: | --- | --- |
| D1U hinted vs Jev clean | 0.1 % | +371 (+149 … +593) | **separated** |
| D1U clean vs Jev hinted | 41.2 % | −18 (−241 … +205) | ≈ not separable |

## Ladder walk
| Model · arm | uci1320 | eps50 | eps30 | eps15 |
| --- | ---: | ---: | ---: | ---: |
| D1 Ultra · hinted | 20 % | 90 % | 70 % | 0 % |

## Not finished
- cell 3 (Jev · clean, r1) stopped_budget at 41/50 games, $0.49 of $0.50
- 2 aborted games (transport) in cell 2, excluded from W-D-L

## Provenance
- plan: `bench/plans/core-v1.json` sha256 4f2a… · seed 20261030 · host `bench-box`
- catalog prices at run time: `typesafe/jev-1.14` $0.20/M in · `liquid/d1-ultra` $0.05/M in
```

When `env.mock` is true the header says **"MOCK RUN — do not compare"** in bold. When
`ladder.calibrated` is false it says **"uncalibrated ruler — do not compare"**.

`benchSummary` is the same data as JSON: `{ run, environment, ladder, caps, totals, cells, pairs,
leaderboard }`, keys in a fixed order, `elo` null rather than missing.

## 5. Runner (`packages/runner/src/bench.ts`)

```ts
export type BenchStopReason = 'completed' | 'stopped_budget' | 'stopped_time' | 'stopped_error' | 'interrupted';
export interface BenchRunOptions {
  planPath: string; newRun?: boolean; resume?: boolean;   // resume defaults true (D4)
  runId?: string;                                         // resume this run explicitly
  dryRun?: boolean; mock?: boolean; sql?: boolean;        // sql overrides plan.artifacts.sql
  stopOnError?: boolean; commitEachCell?: boolean;
  reportsDir?: string;                                    // default docs/build/reports
  log?: (line: string) => void;                           // default process.stdout
}
export interface BenchRunResult { runId: string; stopReason: BenchStopReason; artifactsDir: string;
  cells: BenchCellResult[]; exitCode: 0 | 2 | 3 | 130 }
export async function runBench(o: BenchRunOptions): Promise<BenchRunResult>;
export async function benchStatus(o: { runId?: string; json?: boolean }): Promise<string>;
export async function benchModels(): Promise<string>;
```

### 5.1 Preflight (no spend, fails fast)

Run in order, collect `{ ok, name, detail }`, print the checklist, throw `BenchPreflightError` listing
everything that failed:

1. **git identity** — `git config user.email` is set (a remote sandbox often has none; the final
   commit would fail after 3 hours).
2. **key** — `OPENROUTER_API_KEY` present (skipped with `--mock`).
3. **Stockfish** — `findStockfish()` resolves, `version()` answers, `judgeWorkers() ≥ 1`.
4. **catalog** — reachable; every planned model exists, is not `disabled_reason`, and is a text model
   (skipped with `--mock`; print price per M input).
5. **ladder** — `data/ladder/ladder-v<plan.ladder_version>.json` exists and parses; `calibrated` is
   true (warn, do not fail, if false); every `fixed` level exists in it. If the DB has no
   `ladder_levels` rows for that version, call `saveLadderLevels(db, file)` (D7).
6. **DB** — a `select count(*) from series` works; if the table is missing, fail with
   "run `pnpm db:migrate`".
7. **disk** — free space on the data volume ≥ 1 GB (warn below).
8. **estimate** — `estimateSeries` per cell, printed as a table with typical/worst and totals; refuse
   when `Σ typical > run_cap_usd` unless `--allow-over-cap` (D6). With `--mock`, print
   "mock: estimate skipped".

`--dry-run` stops here: prints the expanded matrix (cell index, series name, model, arm, size,
estimate) and writes nothing, exit 0.

### 5.2 Run loop

```
runId  = manifest for this plan name with the same sha256 and no finished_at, else <plan.name>-<stamp>
prefix = planPrefix(plan, newRun ? stamp : undefined)
for cell of expandCells(plan, prefix):
  if stopRequested                       → break (interrupted)
  if spent >= run_cap_usd                → break (stopped_budget)
  if elapsed >= max_hours                → break (stopped_time)
  row = series named exactly cell.seriesName (latest if duplicates)
  if row is terminal                     → record, continue      (never re-run a finished cell)
  if !row:
     if seriesCapFor(plan, spent) < 0.05 → break (stopped_budget)
     row = series.create({ name, model, arm, size, ladder, seed: plan.seed ?? stampSeed,
                           budget_usd: seriesCapFor(plan, spent), concurrency, judge_depth })
  else:
     saveSeries({ ...row, budget_usd: seriesCapFor(plan, spent) })   // raising a cap resumes (D5)
  log "cell <i>/<n> <name> <model>#<arm> → series <id>"
  series.start(row.id)
  await Promise.race([series.idle(row.id), timeout(plan.cell_timeout_min, () => series.pause(row.id))])
  result = read buildSeries(row.id) → BenchCellResult   // elo, w/d/l, secondary, blocks, aborted games
  write status.json (atomic: tmp + rename) + append one log line
  if commitEachCell → git add <artifactsDir> && git commit -m "Record bench cell <i> <model>#<arm>"
  if state === 'failed' && stopOnError → break (stopped_error)
```

Details:

- `spent` is recomputed from the DB each iteration (`Σ cost_usd` over series whose name starts with
  `prefix`), never kept only in memory — resume after a crash must see the real number.
- `status.json`: `{ run_id, prefix, updated_at, stop_reason, totals, cells: [{ index, name, series_id,
  state, games, target, cost_usd, elo }] }` — one small file, rewritten after every game via a
  hub subscription, so `bench status` is instant and a killed process loses nothing.
- Signals: on `SIGINT`/`SIGTERM` set `stopRequested`, `await series.pause(currentId)`, write artifacts,
  return `interrupted` / exit 130. `SIGTERM` gets 30 s before a hard exit.
- A `SeriesControlPlane` event subscription logs `game_finished` as one line
  (`<ts> cell 2 game 17/50 0-1 vs eps30 $0.0004`) and updates `status.json`. Every line goes to stdout
  **and** `data/bench/<run>/run.log` (append, flushed), so the log survives a dropped session without
  `tee`.

### 5.3 Resume semantics (D4)

| Situation | Behaviour |
| --- | --- |
| No manifest for this plan name | new run, new stamp |
| Manifest, same `plan_sha256`, `finished_at` null | resume it (same prefix) |
| Manifest, same hash, finished | nothing to do: every cell is terminal, print the report path, exit 0 |
| Manifest, **different** hash | error: "plan `core-v1` changed since run `<id>`; use `--new` or rename the plan" |
| `--new` | new stamp, prefix `<name>@<stamp>/`, fresh cells |
| `--run <id>` | resume that run explicitly (same hash check) |

Series left `running` by a killed process are flipped to `paused` by `recoverSeries(db)` before the
loop starts, and `start` continues each paused game from its last ply (T06 behaviour, no replay, no
double spend).

### 5.4 Artifacts (D10)

Written at the end of the run **and** by `bench report --run <id>` (idempotent, DB is the source):

1. `series/<seriesId>.json` — `buildSeries` output, byte-identical in shape to
   `GET /api/series/:id/export.json`.
2. `leaderboard.csv` — `leaderboardCsv(buildLeaderboard(...))` for the run's ladder version,
   filtered to the run's series ids (not every arm in the DB).
3. `summary.json` — `benchSummary(...)`, plus `pairs` from `compareArms` for every pair of finished
   cells.
4. `report.md` — `benchReport(...)`.
5. `sql/` — only when `artifacts.sql` (default true): `runPublish({ db, seriesIds, outBase:
   join(artifactsDir, 'sql/part.sql') })`. **Before writing, assert** the DB holds `ladder_levels`
   rows for the run's version, one per level in the ladder file; if not, fail the artifact step with
   "ladder_levels missing for v<N> — the published ruler would be empty" (the T10 public-mode trap,
   one layer earlier).
6. `manifest.json` and `run.log` in `data/bench/<run>/` (not committed): run id, prefix, plan +
   sha256, git sha, node/stockfish versions, `started_at`, `finished_at`, `stop_reason`; the log is
   every line `bench` printed, so `tail -f` works after a reconnect.

Expected size: ~55 KB of SQL per game (measured: 5.5 MB for 100 games). A 4-cell standard run is
≈ 11 MB of SQL in 6 files; a 16-cell Quick run ≈ 22 MB. That is the price of publishing from another
machine; `--no-sql` skips it when the run happens on the machine that holds the D1.

## 6. CLI

```
pnpm cli bench run --plan bench/plans/core-v1.json [--new] [--run <id>] [--dry-run] [--mock]
                   [--no-sql] [--stop-on-error] [--commit-each-cell] [--allow-over-cap]
pnpm cli bench status [--run <runId>] [--json]
pnpm cli bench report --run <runId>
pnpm cli bench models
```

- `bench models` prints the eligible catalog (`slug`, name, `$x.xx/M in`, context, roster flag,
  disabled reason) — the cheap way to pick `models` for a plan. No spend, no DB writes.
- `bench status` (no `--run`) reads the newest manifest, then the DB: one line per cell
  (`✓ finished 50/50 $0.019 908 ±112`), totals, elapsed, ETA from the measured per-game cost and
  time, and the last 5 lines of `run.log`. `--json` prints `status.json` verbatim.
- Exit codes: `0` completed, `2` preflight/usage/plan error, `3` stopped early (budget, time, error)
  or any cell `failed`, `130` interrupted.

Update the usage line in `cli.ts` accordingly.

## 7. Unattended runbook (goes in `bench/README.md`, referenced from the task report)

```bash
# once, on the remote box
pnpm install --frozen-lockfile
mkdir -p data/bench
pnpm db:migrate                                   # local D1 schema (data/d1/v3)
git config user.email "autumn@example.com"        # preflight checks this
git config user.name  "Autumn"
printf 'OPENROUTER_API_KEY=%s\n' "$KEY" >> .env   # never committed

# dry run first: matrix + estimate, spends nothing
pnpm cli bench run --plan bench/plans/core-v1.json --dry-run

# the real thing, in tmux; commit whatever finished, even on a partial or interrupted run
tmux new -s bench
pnpm cli bench run --plan bench/plans/core-v1.json; rc=$?
[ "$rc" -ne 2 ] && git add docs/build/reports/bench-core-v1-* \
  && git commit -m "Record core-v1 bench results" && git push
# detach with Ctrl-b d
```

Exit `2` means preflight or the plan was wrong, so there is nothing to commit. Exit `0`, `3` and `130`
all leave usable artifacts and are committed. Do not pipe through `tee` for the log: `bench` writes
`data/bench/<run>/run.log` itself, and a pipe would hide the exit code.

While it runs: `pnpm cli bench status` (or `--json`), `tail -f data/bench/<run>/run.log`.

Expected wall clock and spend, from the four measured Quick 25 series (15–18 min, $0.009–$0.030 each):

| Plan | Cells | Games | Wall clock | Typical estimate | Measured expectation |
| --- | ---: | ---: | --- | ---: | ---: |
| `smoke` (mock) | 1 | 3 | < 2 min | — | $0 |
| `core-v1` (standard 50) | 4 | 200 | ≈ 2 h 20 min | $0.59 | $0.10–0.25 |
| `core-v1` at Quick 25 | 4 | 100 | ≈ 1 h 10 min | $0.29 | $0.07–0.12 |
| `core-v1` + 2 more models | 8 | 400 | ≈ 4 h 40 min | $1.18 | $0.15–0.50 |

Do **not** run `pnpm verify` or `pnpm e2e` while a bench run is going (core perft timeouts under
Stockfish workers — HANDOFF §4).

## 8. Tests (no network, no Stockfish, no spend)

`packages/core/test/bench.test.ts` (pure):

- `parseBenchPlan`: minimal plan fills defaults (`repeat 1`, `concurrency 2`, `judge_depth 14`,
  `max_hours 8`, `artifacts.sql true`); every rejection row in §3 throws with the field name in
  `BenchPlanError.field`; unknown key rejected; `image` rejected before T12.
- `expandCells`: 2 models × 2 arms × 2 repeats = 8 cells in plan order, unique names, `/r1`/`/r2`
  only when `repeat > 1`; `planPrefix` with and without a stamp.
- `seriesCapFor`: `min` of the two caps; clamps at 0; a spent total above the run cap yields 0.
- `cellState`: one case per status string.
- `benchReport`: snapshot for a fixed 2-cell input — Elo always with interval, `≈` + "not separable"
  for an overlapping pair, "MOCK RUN" banner when `env.mock`, "uncalibrated ruler" when
  `ladder.calibrated` false, "Not finished" section for a `budget` cell, ladder-walk table from
  `blocks`, and byte-identical output for the same input twice (determinism).
- `benchSummary`: stable key order, `elo: null` (not omitted) for an unfinished cell, round-trips
  through `JSON.parse`.

`packages/runner/test/bench.test.ts` (in-process, `--mock`, fake judge + fake opponent as in T06):

- **smoke**: `bench/plans/smoke.json` with a temp reports dir → 1 finished series, 3 games, every
  artifact kind the plan enables on disk, `report.md` contains the series id, exit 0.
- **resume**: run, then set the series back to `paused` with 1 game removed (or kill after the first
  game with a fake player that throws once), re-run the same plan → same `series_id`, same total game
  count, no duplicate series rows.
- **finished cells are not re-run**: run twice → identical series ids, `games` unchanged, second run
  exits 0 immediately.
- **run cap**: plan with `run_cap_usd` just above one cell's cost and two cells → second series is
  never created, `stopReason === 'stopped_budget'`, exit 3, report lists the unfinished cell.
- **watchdog**: a fake player that never resolves → cell paused and marked `timeout` after a 1 s
  timeout, run continues to the next cell.
- **fail forward**: a cell whose series ends `stopped_error` does not stop the run unless
  `--stop-on-error`.
- **dry run**: prints the matrix and estimate, creates zero series rows, writes no artifacts.
- **preflight**: missing key (non-mock) names `OPENROUTER_API_KEY`; unknown model names it; a plan
  whose typical total exceeds the run cap is refused unless `--allow-over-cap`; missing `series`
  table says `pnpm db:migrate`. All of these happen before any row is written.
- **SQL artifact**: with `sql: true` the files exist and contain `INSERT OR REPLACE INTO series`;
  `--no-sql` writes no `sql/` dir; the artifact step's ladder guard (unit-tested directly) refuses to
  write when `ladder_levels` has no rows for the run's version.
- **status**: `benchStatus()` on a mid-run DB lists every cell with state and spend; `--json` matches
  `status.json`.

CLI arg parsing gets one test (unknown subcommand → usage, exit 2).

## 9. Publishing later, from a different machine (added to `docs/DEPLOY.md`)

```bash
git pull                                    # brings docs/build/reports/bench-<run>/sql/
pnpm --filter @chessdecide/web exec wrangler d1 execute DB --remote \
  --config wrangler.production.jsonc --file ../../docs/build/reports/bench-<run>/sql/part-001.sql
# … repeat per file, in filename order
```

Wrangler resolves `--file` from `apps/web/`, hence the `../../`.

Then check `/api/leaderboard` and `/api/ladder` (the ladder version must be the one the run used) and
`wrangler d1 execute … --command "select count(*) from games"` against `summary.json` totals.
Re-running the same files is safe (`INSERT OR REPLACE`), and a second run's SQL does not disturb the
first.

## 10. Acceptance

- `pnpm verify` green; `pnpm build` unaffected (no web changes).
- `CHESSDECIDE_MOCK=1 pnpm cli bench run --plan bench/plans/smoke.json` finishes in < 5 min, writes the
  bundle, exits 0.
- `pnpm cli bench run --plan bench/plans/core-v1.json --dry-run` prints 4 cells with estimates and
  spends nothing.
- A real run (Autumn's key, her call) is started with the §7 chain and produces
  `docs/build/reports/bench-core-v1-<stamp>/` with a report whose Elo numbers match
  `GET /api/series/:id` for every cell.
- Two commits: `Add headless bench runner` (code, plans, docs) and, after the real run,
  `Record core-v1 bench results` (the artifacts dir only).

## 11. Non-goals

- No Cloudflare publish (`--remote`) in this task; no Worker/D1 changes at all.
- No new web UI, no live bench page, no SSE consumer.
- No model-vs-model series (M5), no position suite, no text arm.
- No series-level parallelism (D2), no adaptive `repeat` scheduling.
- No attempt to make intervals tighter than the series size allows — that is what `standard` (50) and
  a second plan are for. `repeat` is for replication and for spotting variance between runs, and the
  leaderboard still reports **one series per arm** (T09), so repeats never merge into a headline Elo.
