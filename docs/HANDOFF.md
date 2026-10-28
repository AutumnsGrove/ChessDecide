# Handoff — where we left off (2026-10-28, session 3)

Autumn uses **she/her** pronouns. She often works by voice: keep replies short and conversational.

## 1. State

The app is real now: daemon + web run locally, real decision models play, the ladder is calibrated,
series run live. **T00–T07 are done and committed; T08 is paused mid-series.**

| Task | State |
| --- | --- |
| T00 foundation | done |
| T01 real models, catalog, estimate, probe | done |
| T02 New game dialog, spend chip, banners, Playwright | done |
| T03 decision panel, live controls, viewer e2e | done |
| T04 first real game (Jev vs eps75; extra vs eps30) | done, report in `docs/build/reports/` |
| T05 ladder calibration + full v2 run | done |
| T06 series runner, store, API | done |
| T07 series screens | done |
| **T08 first real series** | **PAUSED at 5/25 finished** |
| T09–T12 | not started |

Commits on `main` (pushed at end of session): `Add series screens`, `Add series runner, store and API`,
`Record ladder calibration v2`, `Add ladder calibration job`, `Record second real game vs eps30`,
`Record first real game results`, `Add decision panel…`, `Add new game dialog…`,
`Add real model players…`.

`pnpm verify` is green. `pnpm e2e` is green (30 tests: 15 specs × 2 viewports). `pnpm install
--frozen-lockfile` is clean.

## 2. Resume T08 (first thing next session)

Series id: **`01M625J2GZ003DBZWK012ERQQ8`** (Jev clean, Quick 25, adaptive, cap $0.50, ladder v2).

```bash
pnpm dev            # daemon 8731 + vite 5273
# open http://127.0.0.1:5273/series/01M625J2GZ003DBZWK012ERQQ8 and press Resume
# or: curl -X POST localhost:8731/api/series/01M625J2GZ003DBZWK012ERQQ8/start
```

It is paused with 5 finished (all losses vs `uci1320`), 2 in-flight `eps50` games (plies 62/54),
0 aborts, provisional Elo **668 ± 553**, cost so far **$0.0029** (all attempts $0.0053).
Report skeleton: `docs/build/reports/T08-first-series.md`. Finish all 25, update the report, take the
final screenshot, then ask the T08 STOP question (D1 Ultra next / hinted arm / T09 / pause).

## 3. Calibrated ladder v2 (this is the ruler)

`data/ladder/ladder-v2.json` (gitignored data dir), 4,200 games, 2 h 6 m, $0, Stockfish 19,
50 ms/move, 4 workers. No warnings. Full table in `docs/SPIKE.md` §9.

| rung | nominal | measured ± se |
| --- | ---: | ---: |
| random | 250 | 160 ± 26 |
| eps75 | 560 | 391 ± 19 |
| eps50 | 790 | 614 ± 18 |
| eps30 | 980 | 819 ± 18 |
| eps15 | 1150 | 1037 ± 19 |
| uci1320 | 1320 | 1320 (anchor) |
| uci1500 | 1500 | 1583 ± 17 |
| uci1700 | 1700 | 1744 ± 15 |
| uci1900 | 1900 | 1879 ± 15 |
| uci2100 | 2100 | 2016 ± 17 |
| uci2400 | 2400 | 2250 ± 21 |
| uci2800 | 2800 | 2669 ± 39 |

The daemon loads the highest valid `data/ladder/ladder-vN.json`; `GET /api/ladder` reports
`calibrated: true, version: 2`. E2E uses an empty `CHESSDECIDE_DATA` so it gets the nominal ladder.

## 4. Real-run numbers so far

- **T04a** Jev clean (White) vs eps75: 1-0 checkmate in 21 plies, 11 calls, **$0.000545**, ~71 s,
  ACPL 198, acceptable 82 %, 1 blunder, 0 errors.
- **T04b** Jev vs eps30: 1-0 adjudicated in 35 plies, 16 calls + 2 cache hits, **$0.000711**, ~62 s,
  ACPL 198, acceptable 89 %, 2 blunders.
- **T08 (partial)** Jev vs uci1320: 0-5, games ~30 plies, provisional 668 ± 553, **$0.00058/game**.
  Estimate was $0.073 for 25 games; actual is ~5× lower. Jev is below uci1320; likely ~600–820.

## 5. What was built (quick map)

- `packages/core`: types, rules, prompts, Elo, ladder fit/warnings, series scheduler/events,
  `decisionRows` lives in the web package.
- `packages/engine`: native UCI, Stockfish/ε/random opponents, `EngineJudge` (now **serializes**
  `oracle`/`evalPosition` so two series games can judge at once — fixed the single-flight crash).
- `packages/providers`: Decisions client, ModelPlayer, mock, catalog, game/series estimates.
- `packages/db`: Drizzle schema/migrations, game/ladder/series stores, spend, rolling mean tokens.
- `packages/api`: Hono API (games, models, estimate, spend, ladder, series + SSE, health).
- `packages/runner`: local D1, runtime/ports, game daemon, ladder calibration, series control plane.
- `apps/web`: SvelteKit viewer, New game/New series dialogs, games/series lists and detail, decision
  panel, live controls, mini boards, hand-written SVG Elo chart and ladder axis.

## 6. Environment / gotchas added this session

- `.env` exists at the repo root with `OPENROUTER_API_KEY` (gitignored). `loadEnv()` resolves the repo
  root even when pnpm runs a CLI from `packages/runner`.
- Daemon `127.0.0.1:8731`, Vite `5273` (`strictPort`). `pnpm dev` runs both.
- `EngineJudge` is serialized internally; do not call native engines concurrently from two games.
- Series tests use a fake judge that is always +10 for White so adjudication ends games at ply 30;
  without that they hit 200 plies and local D1 writes make the suite very slow.
- E2E: `apps/web/playwright.config.ts` migrates a temp D1 and points `CHESSDECIDE_DATA` at a temp
  dir. `pnpm e2e` is not part of `pnpm verify`.
- Migration `0002_harsh_tarantula.sql` adds `series.concurrency` and `series.judge_depth`.
- `pnpm verify` runs ~1–2 min when the machine is free; do not run it during a calibration run
  (core perft/completion tests can time out under 4 Stockfish workers).

## 7. Next steps

1. **Finish T08** (resume series, update report, STOP question).
2. Then T09 leaderboard, T10 publish/read-only deploy, T11 exports, T12 image arm.
3. Phase 2 (live Cloudflare) is out of this curriculum.
