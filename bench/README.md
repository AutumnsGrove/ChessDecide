# Bench — headless series sweeps

A **plan** is a JSON file that expands into a matrix of series (`models × arms × repeat`) and runs them
back to back with no UI. Spec: `docs/build/tasks/T13-headless-bench.md`.

```bash
pnpm cli bench models                                  # eligible models + prices (no spend)
pnpm cli bench run --plan bench/plans/core-v1.json --dry-run
pnpm cli bench run --plan bench/plans/core-v1.json     # tmux, hours, real spend
pnpm cli bench status                                  # progress of the newest run
```

## Plans

| File | What | Cost |
| --- | --- | --- |
| `plans/core-v1.json` | 2 models × 2 arms, standard 50, adaptive ladder v2, caps $0.50 / $2.00 | ≈ $0.15–0.25, ≈ 2 h 20 min |
| `plans/all-models-v1.json` | 19 models (≤ $0.06/M, minus the two core-v1 arms) × `clean` + `hinted` × 50 games (38 cells, 1,900 games) | ≈ $2–4, ≈ 25–32 h |
| `plans/smoke.json` | 1 cell, 3 games, fixed `eps50`, for `--mock` | $0 |

Running a sweep on a remote box (no wrangler, commit the bundle, publish later):
[`docs/BENCH-RUNBOOK.md`](../docs/BENCH-RUNBOOK.md).

Add models by editing `models` (slugs from `pnpm cli bench models`). Keep `ladder_version` equal to the
calibrated file in `data/ladder/` — the report records it, and a run on the wrong ruler is not
comparable with anything already published.

## What a run leaves behind

Committed (travels to your laptop, is the publish input):

```
docs/build/reports/bench-<run>/
  report.md  summary.json  leaderboard.csv  series/<id>.json  sql/part-001.sql …
```

Ignored (scratch): `data/bench/<run>/{manifest,status}.json` and any log you tee.

The SQL is the "publish from another machine" path: `wrangler d1 execute DB --remote --config
wrangler.production.jsonc --file <file>` per chunk, in filename order. See `docs/DEPLOY.md`.

## Rules of thumb

- Series are sequential; each series already plays 2 games at once. Do not add series-level
  parallelism without measuring 429s first.
- Re-running the same command **resumes** the plan; it never duplicates spend. `--new` starts a fresh
  copy under `<name>@<stamp>/`.
- The per-series cap is `min(series_cap_usd, run_cap_usd − spent)`. If a run stops on budget, raise
  `run_cap_usd` and re-run the same command — finished cells are skipped.
- Do not run `pnpm verify` or `pnpm e2e` while a bench run is going.
