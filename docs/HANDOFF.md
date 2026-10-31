# Handoff — where we left off (2026-10-31, session 7)

Autumn uses **she/her** pronouns. She often works by voice: keep replies short and conversational.

## 1. State

**Phase 1 (T00–T13) is finished and the public site is live.** The full model sweep is running on a
**remote Claude Code box**, on branch `origin/bench/all-models-v1` — not here. Nothing is running on
this laptop: no bench, no Stockfish, no daemon, ports 8731/5273 clear.

| Item | State |
| --- | --- |
| T00–T13 | done; T10–T12 deployed |
| `main` | clean at `64fbe5f` (merge of the code-review branch PR #2) |
| **Remote sweep** | **in progress on `bench/all-models-v1`** (was 16 h in, ~8 h left at last check) |
| Local runs | **none needed.** The local `core-v1` attempt is void (network died at game 22) and its rows/artifacts/branch were deleted |
| Live site | https://chessdecide-web.m7jv4v7npb.workers.dev (4 arms, 100 games, ladder v2) |

The remote branch runs the sweep in waves, each with its own plan and committed bundle:

| Plan on the branch | What |
| --- | --- |
| `joey-1-v1` | single-model pilot |
| `rest-clean-v1` | the rest of the roster, clean |
| `spread-v1` | parallel-model spread (`parallel_models`) |
| `rest-hinted-v2` | hinted arm, without the models that turned out unusable |
| `premium-v1` | `gpt-6-luna-decisions`, `clef-omni`, `clef` (costs stayed low, so premium came back in) |

Models ruled out during the sweep (see the branch's reports/commits): `togethercomputer/tev1-4b-experimental`,
`jaredpalmer/kev-4b`, `scaledown/classify-1`, and `cloudflare/clef-flash`, `upstage/solar-decide`,
`upstage/solar-decide-flash` (marked unsupported on the branch). It includes **all other models**,
premium tier included, clean + hinted, 50 games per cell.

## 2. When the remote job lands

1. `git fetch origin && git log --oneline origin/bench/all-models-v1` — read the commit trail; each wave
   ends with a `Finalize … results` / `Record …` commit plus `docs/build/reports/bench-<plan>-<stamp>/`.
2. Read every `docs/build/reports/bench-*/report.md`. Sanity: Elo always with its interval, ladder v2,
   `summary.json` totals match the SQL row counts, unsupported models listed, spend per wave in the log.
3. Merge the branch into `main` (PR #2's follow-up or a fast-forward if main has not moved). Run
   `pnpm verify` here afterwards — the review branch changed bench/series/engine/providers code.
4. **Publish from this machine** (the remote box has no wrangler), per bundle, files in filename order:
   ```bash
   pnpm --filter @chessdecide/web exec wrangler d1 execute DB --remote \
     --config wrangler.production.jsonc \
     --file ../../docs/build/reports/bench-<run>/sql/part-001.sql
   # … repeat for each part, and for every bench-* bundle that should be public
   ```
   This includes the bundle that covers **Jev 1.14 and D1 Ultra** (clean + hinted): the remote job ran
   them too, so the old local core-v1 plan is not needed.
5. Check the live site: `/api/leaderboard` (one row per model+arm, 50-game intervals), `/api/ladder`
   (must report v2), a replay, and the row counts against each `summary.json`.
6. Update `docs/CHANGELOG.md` and the "real-run numbers" table below with the sweep's headline numbers.

## 3. The next sweep (new model ships)

The remote box is the machine for this: more compute and better uptime. Hand the agent
**`docs/BENCH-RUNBOOK.md`** as it stands on `main` (the branch also improved it: attached `--for` slices,
`--heartbeat`, exit 75 = run again, `parallel_models` 1–4). Then:

- refresh the roster with `pnpm cli bench models`; a new model gets a **new plan name** (e.g.
  `all-models-2026-11`), never an edit of a finished one;
- keep the cost rule pragmatic: premium was affordable in the 2026-10 sweep, so include it unless a
  dry run says otherwise; skip models that cannot answer the Decisions protocol (the branch records them);
- `--for 7` slices in the agent loop, commit each wave, push.

## 4. Catches worth remembering

- **Bench plan paths resolve from where the CLI was invoked** (`INIT_CWD`); artifacts default to
  `<repo>/docs/build/reports`, scratch to `data/bench/<run>/`.
- **`--for MINUTES` + `--heartbeat` + exit 75** is the mode for agent-driven runs: each call is a normal
  tool call, the command pauses cleanly and the next identical call resumes without re-spending.
- **`parallel_models`** runs different models at once; the same model never overlaps itself, and running
  cells keep their unspent cap reserved.
- **Resume:** re-running continues unfinished cells. A finished run says "already complete". Editing a
  plan needs `--new` (or a new plan name) except after a budget stop.
- **Network failures are the realistic killer.** `fetch failed` × retries ends a cell `stopped_error`;
  the sweep continues, but a `completed` manifest with zero finished cells is not a result. The review
  branch fixed several of these paths (abort signal, engine reboot, stop reasons).
- **`attempts.request_gz` was always null until T12** — `ModelPlayer` never recorded the request. It now
  stores `request_json` (local-only), so the raw pair D13 promises exists.
- **Image arm** (`@chessdecide/render`): first real game 0-1 adjudicated, 40 plies, $0.001467, ~22 % more
  per game than clean, no visible gain (`docs/SPIKE.md` §10).
- **PGN move numbers follow the start FEN** (`3. e4` for random openings; `1... e5` when Black starts).
- **Public mode derives the ladder from published rows** (`loadPublishedLadder`) and serves `/api/ladder`
  read-only; otherwise the public leaderboard filters on nominal v0 and is empty.
- A leaderboard arm is **model + arm** (`liquid/d1-ultra#hinted`), never the preset alone.
- `ApiError(code, message, status)` — the third argument is the HTTP status.
- `apps/web` must depend on `cookie@2.0.1`; `pnpm build` fails otherwise (stray CJS copy trap).
- `outputPaths` in `publish.ts` always numbers files (`part-001.sql`).
- Do not run `pnpm verify`/`pnpm e2e`/`ladder calibrate` while a sweep is running.

## 5. Real-run numbers so far (Quick 25, ladder v2, cap $0.50)

| Model · arm | Elo (95 %) | W-D-L | ACPL | Cost |
| --- | ---: | --- | ---: | ---: |
| D1 Ultra · hinted | **895 ± 162** | 11-2-12 | 140.8 | $0.0091 |
| Jev · hinted | **775 ± 159** | 11-1-13 | 154.3 | $0.0210 |
| D1 Ultra · clean | **733 ± 158** | 8-2-15 | 177.6 | $0.0099 |
| Jev · clean | **532 ± 160** | 8-2-15 | 231.5 | $0.0299 |

The remote sweep replaces these with 50-game series and adds every other model.

## 6. Not planned

Phase 2 (live Cloudflare: Durable Objects + hosted Stockfish), scale-out, and model-vs-model are out of
this curriculum.
