# Running a model sweep headless (bench runbook)

Use this when a new Decisions model ships, or when you want fresh numbers for the whole roster.
It runs every planned series on a remote box with **no browser, no daemon and no wrangler**, commits the
results bundle to the repo, and leaves publishing for the machine that holds the Cloudflare login.

Spec: `docs/build/tasks/T13-headless-bench.md`. Plan format and internals: `bench/README.md`.

## 0. What you get

```
docs/build/reports/bench-<plan>-<stamp>/
  report.md                 # the table to read (Elo always with its 95 % interval)
  summary.json              # machine-readable: plan, cells, Elo, spend, environment
  leaderboard.csv           # same columns as /api/leaderboard/export.csv, filtered to this run
  series/<seriesId>.json    # full Series export per cell (T11 shape)
  sql/part-001.sql …        # publish SQL for production D1 (apply later, from a machine with wrangler)
```

Scratch (not committed): `data/bench/<run>/{manifest,status}.json`, `run.log`.

**Do not publish from the remote box.** It has no wrangler; commit the bundle and publish later
(`docs/DEPLOY.md` §7).

## 1. Machine and setup

Assumed: Linux/macOS, Node ≥ 22, ~15 GB RAM, 30 GB free disk, network access to OpenRouter.

```bash
# Node 22+ and pnpm 10
node -v || (curl -fsSL https://fnm.vercel.app/install | bash)   # or your distro's Node 22
npm install -g pnpm@10.28.0

# Stockfish (the judge; the ladder opponents use the same binary)
brew install stockfish                                   # macOS
sudo apt-get update && sudo apt-get install -y stockfish  # Debian/Ubuntu
stockfish --version                                      # must print a version

# Repo
git clone https://github.com/AutumnsGrove/ChessDecide.git
cd ChessDecide
git config user.email "you@example.com"    # preflight fails without this
git config user.name  "Autumn"
pnpm install --frozen-lockfile
pnpm db:migrate                            # local D1 schema in data/d1/v3

# Key: environment only, never committed
printf 'OPENROUTER_API_KEY=%s\n' "$OPENROUTER_API_KEY" > .env
chmod 600 .env
```

The calibrated ruler is committed (`data/ladder/ladder-v2.json`), so a fresh clone rates on v2.
Do not touch `data/ladder/`.

Disk: the local D1 grows ~0.2–0.5 GB for a 25-cell run; committed artifacts ~70 MB
(~55 KB of SQL per game). 30 GB is plenty.

## 2. The roster (fetched 2026-10-30)

`pnpm cli bench models` prints the live Decisions catalog with prices; refresh it before every sweep.
**Cost rule: skip anything above $0.06/M input tokens.** That excludes `baseten/mammoth-1` and
`openai/gpt-6-luna-decisions` ($0.10), `cloudflare/clef-omni` ($0.15) and `cloudflare/clef` ($0.24).
`typesafe/jev-1.14` and `liquid/d1-ultra` are also left out: the `core-v1` run already covers both with
50-game clean+hinted series, so that bundle is the source for those two arms. The sweep below is the 19
included models, cheapest first:

| slug | $/M in | ctx | name |
| --- | ---: | ---: | --- |
| `baseten/joey-1` | 0.01 | 16k | Baseten: Joey 1 |
| `perplexity/pplx-decider-flash-v1.2` | 0.01 | 262k | Perplexity: Decider Flash V1.2 |
| `respan/span-02` | 0.01 | 131k | Respan: Span-02 |
| `inception/mercury-decide` | 0.02 | 65k | Inception: Mercury Decide |
| `liquid/d1` | 0.02 | 65k | LiquidAI: d1 |
| `liquid/d1.1` | 0.02 | 65k | LiquidAI: d1.1 |
| `perplexity/pplx-decider-v1.2` | 0.02 | 262k | Perplexity: Decider V1.2 |
| `baseten/elephant-1` | 0.04 | 16k | Baseten: Elephant 1 |
| `cloudflare/clef-flash` | 0.04 | 24k | Cloudflare: Clef Flash |
| `nace-ai/drex-v1.5` | 0.04 | 131k | Nace.AI: Drex v1.5 |
| `scaledown/classify-1` | 0.04 | 1M | ScaleDown: Classify-1 |
| `jaredpalmer/kev-4b` | 0.04 | 8k | Jared Palmer: Kev 4B |
| `microsoft/microsoft-decision-1` | 0.04 | 32k | Microsoft: Microsoft-Decision-1 |
| `togethercomputer/tev1-4b-experimental` | 0.04 | 32k | Together: Tev1 4B Experimental |
| `typesafe/jev-1.13` | 0.04 | 262k | TypeSafe: Jev 1.13 |
| `upstage/solar-decide` | 0.05 | 524k | Upstage: Solar Decide |
| `upstage/solar-decide-flash` | 0.05 | 524k | Upstage: Solar Decide Flash |
| `nace-ai/drex-max` | 0.06 | 262k | Nace.AI: Drex Max |
| `nace-ai/drex-v2.0` | 0.06 | 131k | Nace.AI: Drex v2.0 |

The catalog also lists `~…-latest` aliases (`~liquid/d1-latest`, `~typesafe/jev-latest`,
`~perplexity/pplx-decider-latest`, `~perplexity/pplx-decider-flash-latest`,
`~liquid/d1-ultra-latest`). They resolve to the same models as the canonical slugs above; leave them
out so a sweep does not test the same model twice.

`typesafe/jev-1.14` and `liquid/d1-ultra` also have 50-game clean+hinted results from `core-v1`; they
are in this plan too so the sweep stays uniform.

Every time a **new** model appears: add its slug to a **new** plan (below). Do not edit an old plan.

## 3. The plan

`bench/plans/all-models-v1.json` (committed): 19 models × `clean` + `hinted` × standard 50 =
**1,900 games, 38 cells**, adaptive ladder v2, caps **$10 per series / $50 per run** (the caps are a
runaway guardrail, not a budget: a cell is expected to cost $0.01–0.30).

```json
{
  "name": "all-models-v1",
  "models": ["…19 slugs…"],
  "arms": ["clean", "hinted"],
  "size": { "preset": "standard" },
  "ladder": { "mode": "adaptive" },
  "ladder_version": 2,
  "series_cap_usd": 10,
  "run_cap_usd": 50,
  "repeat": 1,
  "concurrency": 2,
  "judge_depth": 14,
  "max_hours": 48,
  "cell_timeout_min": 120,
  "artifacts": { "sql": true }
}
```

Variants:

- `"arms": ["clean"]` halves cells and time (950 games) if the box is short on wall clock.
- Add `"image"` only for an image round; it is slower and costs ~1.2× per game.
- A new model must be ≤ $0.06/M to join the default sweep; beyond that, ask first.
- A new sweep gets a new `"name"` (e.g. `all-models-2026-11`). A different name means a separate
  prefix, new series and a fresh run; the leaderboard still keeps one row per model+arm (latest
  finished series wins).

Expected wall clock on a box like the four `core-v1` series: ~40–50 s/game → **≈ 25–32 h** for the
1,900-game sweep, less on a faster machine. Preflight estimates this plan at **$4.56 typical /
$11.39 worst**; measured actuals run 2–8× below typical, so expect **$2–4**. The preflight estimate is
the honest upper bound.

## 4. Preflight and dry run (spends nothing)

```bash
pnpm cli bench models
pnpm cli bench run --plan bench/plans/all-models-v1.json --dry-run
```

The dry run prints a checklist (git identity, key, Stockfish, catalog prices, ladder, DB, disk,
estimate) and the 38-cell matrix with a typical cost per cell. Stop if:

- a model is unknown or `disabled_reason` is set → remove it from **your copy** of the plan;
- the typical total is beyond what you are willing to spend → shrink `models` (the estimate is
  printed as `typical $X of $50 cap`);
- the ladder line is not `v2` calibrated.

`--allow-over-cap` only exists for the case where the *typical* total exceeds `run_cap_usd`; with the
caps above it should not be needed.

## 5. Launch it

Detached, survives a dropped session:

```bash
nohup pnpm cli bench run --plan bench/plans/all-models-v1.json \
  --commit-each-cell > data/bench-sweep.out 2>&1 &
echo $! > data/bench-sweep.pid
```

`--commit-each-cell` commits `docs/build/reports/bench-…` after every cell, so a dead session still
leaves finished work committed. Drop it if you prefer one commit at the end.

Prefer `tmux` when it is available (`tmux new -s bench`, run the command, `Ctrl-b d`).

## 6. Observability while it runs

Everything the runner prints goes to stdout **and** `data/bench/<run>/run.log`. `status.json` is
rewritten after every game; `bench status` reads it plus the DB.

```bash
pnpm cli bench status                 # newest run: per-cell state, Elo so far, spend, ETA
pnpm cli bench status --json          # status.json verbatim
tail -f data/bench-sweep.out          # one line per finished game
tail -f data/bench/<run>/run.log      # same, from the run directory
```

Keep a monitor log (do this in a second background shell; no spend):

```bash
while true; do
  { date -u +%FT%TZ
    pnpm cli bench status 2>/dev/null | head -40
    ps -o pid,etime,%cpu,rss -p "$(cat data/bench-sweep.pid)" 2>/dev/null
    du -sh data/d1 data/bench docs/build/reports 2>/dev/null
  } >> data/bench-monitor.log
  sleep 900
done &
```

Sanity signals: cells go `pending → running → finished`; spend per cell stays within a few dollars;
`report.md` exists only after the run ends (or after each cell with `--commit-each-cell`).

Do **not** run `pnpm verify`, `pnpm e2e` or a ladder calibration while the sweep runs — they compete
for the Stockfish workers and the bench will report timeouts.

## 7. Stop conditions and resume

The command exits:

| code | meaning | what to do |
| --- | --- | --- |
| `0` | every cell finished | commit/push, done |
| `2` | preflight or plan error, nothing written | fix and re-run |
| `3` | stopped on run cap, wall clock or a failed cell | results are usable; commit them |
| `130` | interrupted (SIGINT/SIGTERM) | results are usable; re-run to continue |

Resume is the default and never duplicates spend: re-running the same command continues unfinished
cells and skips finished ones. `--new` starts a fresh copy under `<name>@<stamp>/`. Raising
`run_cap_usd` after a budget stop is allowed and resumes the same run; any other plan edit needs
`--new` or a new plan name.

If a cell ends `stopped_error` (one model is broken) the run continues; its row appears under
“Not finished” in the report with the reason. `--stop-on-error` only if you want the opposite.

## 8. Finish: commit and push (no publishing here)

```bash
pnpm cli bench report --run <runId>     # regenerate/verify the bundle (idempotent)
git status --short                      # expect docs/build/reports/bench-<plan>-<stamp>/ only
git add docs/build/reports/bench-<plan>-<stamp>
git commit -m "Record <plan> bench results"
git push origin main
```

Never commit `.env` or `data/` (both are gitignored; keep it that way). If `--commit-each-cell` was
used, the per-cell commits already exist — push them.

Report back: run id, cells finished/failed, games, spend, wall clock, and any model that stopped
early. The numbers a human reads are in `report.md`; the machine-readable truth is `summary.json`.

## 9. Publishing later (on the machine with wrangler)

```bash
git pull
pnpm --filter @chessdecide/web exec wrangler d1 execute DB --remote \
  --config wrangler.production.jsonc --file ../../docs/build/reports/bench-<run>/sql/part-001.sql
# … repeat per file, in filename order
```

Then check `/api/leaderboard`, `/api/ladder` (version must match `summary.json`) and the row counts,
exactly as in `docs/DEPLOY.md` §6–7. Re-running a file is safe (`INSERT OR REPLACE`).

Publish the `core-v1` bundle too: it is the source for `typesafe/jev-1.14` and `liquid/d1-ultra`
(clean + hinted, 50 games each), which this sweep deliberately leaves out.

## 10. Troubleshooting

| symptom | cause / fix |
| --- | --- |
| `preflight failed: Stockfish` | `stockfish` not on PATH; install it or set `STOCKFISH_PATH` |
| `OpenRouter key is not set` | `.env` missing/empty, or `OPENROUTER_API_KEY` unset |
| `git identity` failed | `git config user.email` / `user.name` |
| `series table missing — run pnpm db:migrate` | migrations not applied |
| `unknown model …` | slug typo or model removed; `pnpm cli bench models` |
| `plan … changed since run …; use --new` | you edited a plan mid-flight; new name or `--new` |
| a cell is `timeout` | model too slow; the run continues, the cell stays paused and is recorded |
| cell `stopped_budget` | only if a cell spent `series_cap_usd` (set high above); raise it and resume |
| many `429` retries | `DecisionsClient` backs off by itself; if it persists, lower `concurrency` to 1 |
| disk filling | `du -sh data/benc* data/d1 docs/build/reports`; `--no-sql` skips the SQL bundle |
| nothing in `docs/build/reports` | the bundle is written when the run ends (or per cell with `--commit-each-cell`) |

## 11. Hard rules

- No `wrangler`, no `publish`, no Cloudflare from the remote box. Commit only.
- No `.env`, no keys, no `data/` in git.
- Do not edit the plan while a run is going; use `--new` or a new name.
- Do not run `pnpm verify`/`pnpm e2e`/`ladder calibrate` during a sweep.
- Elo is only comparable on the ruler recorded in `summary.json` (`ladder_version`, v2 today).
