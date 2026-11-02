# ChessDecide

A benchmark that **rates AI decision models at chess**. Each model plays a series of games against
Stockfish on a calibrated ladder, and we estimate its **Elo with a 95 % credible interval**. Every move
a model makes is judged by Stockfish, and any game can be replayed move by move.

**Live site: https://chessdecide-web.m7jv4v7npb.workers.dev**
&nbsp;·&nbsp; [Leaderboard](https://chessdecide-web.m7jv4v7npb.workers.dev/)
&nbsp;·&nbsp; [Games](https://chessdecide-web.m7jv4v7npb.workers.dev/games)
&nbsp;·&nbsp; [Paper](https://chessdecide-web.m7jv4v7npb.workers.dev/paper)

## Disclosure: built by AI coding agents

**The code in this repository was written by AI coding agents, not by hand.** Exactly two models wrote
it, and no others:

- **Claude Sonnet 5.5** (Anthropic), used through Claude Code.
- **DeepSeek V4.1 Flash 1017**, used through the **Pi** coding harness.

Commits made through Claude Code are authored by `Claude` or carry a `Co-Authored-By: Claude Sonnet 5.5`
trailer in the git history.

**The benchmark run was also done by an agent.** The full leaderboard sweep reported in the paper (20
models, two arms each, 2,002 games) ran from this repository's own runner, headless, on a cloud Linux
VM inside a **Claude Code on the web** session. It took about **30 hours** of wall-clock time in
time-sliced runs, including restarts of the VM. The report describes the environment in detail.

Treat the results accordingly: the protocol, the opponents and every raw series are in this repository
so they can be checked and rerun, and there is a test suite (`pnpm verify`), but none of it should be
taken on trust because of who wrote it.

## Results

From the first full sweep ([report](docs/BENCHMARK-REPORT.md), [PDF](docs/BENCHMARK-REPORT.pdf), as of 2026-11-01):
20 models, each in two arms, 50 games per model per arm.

- Decision models play chess at **122 to 711 Elo** when the menu of moves is bare (`clean`) and **249 to
  886 Elo** when each option carries a few rule-derived facts (`hinted`).
- **Hints are the largest effect.** The hinted arm lifts all 20 models, by +56 to +465 Elo.
- **The ranking is tiers, not an order.** With 50 games the 95 % interval is about ±105 Elo, so most
  neighbouring ranks are statistically tied. The site groups arms by interval overlap instead of ranking
  them.
- 5 of the 25 catalog models could not play at all, because of how they handle the interface.

The whole sweep cost about $2.57 of API spend. The protocol, the opponents and the raw series are all in
this repository.

## The idea

Decision models take a `state` plus typed questions (`choice`, `noul`, `score`) and return calibrated
answers: no prose, very cheap. Chess gives a closed set of legal moves, so "which move is best?" is a
`choice` question and an illegal move is impossible: the options come from a rules library, never from
the model. The question is how a model built for quick general decisions copes in an environment it was
never trained for.

- **Rating:** Elo on the ChessDecide Stockfish ladder. Opponents are Stockfish levels of known strength;
  levels below Stockfish's 1320 floor are built from random-move mixes, and every level is calibrated by
  playing the levels against each other. A series plays in blocks of five games, each block against the
  level nearest the current estimate, and the rating is the mean of the Elo posterior with its 95 %
  credible interval. The scale is relative to this ladder, not FIDE or lichess.
- **Explanation:** every model move is judged by Stockfish (win-probability loss, ACPL, blunder flags).
- **Arms, reported separately:** `clean` (bare options), `hinted` (adds capture, check and mate text),
  `image` (a board picture instead of FEN; supported, not part of the first sweep).

## Run it locally

Requires Node 22+, pnpm 10+ (the only supported package manager) and Stockfish
(`brew install stockfish`, or set `STOCKFISH_PATH`). Real model calls need `OPENROUTER_API_KEY` in the
environment (never committed); without it, run in mock mode.

```bash
pnpm install
pnpm db:migrate                  # local D1 under data/d1
CHESSDECIDE_MOCK=1 pnpm dev      # runner daemon on :8731 and the web app on :5273, no API spend
```

Drop `CHESSDECIDE_MOCK=1` to play real models. Local mode shows the controls (new game, new series, spend
meter); the deployed site is read-only.

```bash
pnpm cli game | probe | ladder calibrate | publish | bench | backfill-stats   # runner CLI (see its usage text)
pnpm verify                      # lockfile check, typecheck, svelte-check, unit tests
pnpm e2e                         # Playwright, phone and desktop
```

Running a full sweep headless is covered by [`docs/BENCH-RUNBOOK.md`](docs/BENCH-RUNBOOK.md) and
[`bench/`](bench/README.md). Publishing results to the read-only site is covered by
[`docs/DEPLOY.md`](docs/DEPLOY.md).

## Repository

```
packages/core/       pure TypeScript: rules, prompts, parsers, Elo, ladder, leaderboard, game stepping
packages/engine/     Engine port + native UCI adapter (Stockfish)
packages/providers/  OpenRouter Decisions client, budget and cost estimates, mock provider
packages/db/         Drizzle schema, migrations, stores and queries
packages/api/        HTTP + SSE API (Hono), shared by the daemon and the Worker
packages/render/     board rendering for the image arm
packages/runner/     CLI and local daemon: game, series, ladder calibration, bench, publish
apps/web/            SvelteKit app (adapter-cloudflare); the public site
bench/               sweep plans
docs/                specs, the report, runbooks (below)
scripts/ spikes/     repo tooling; throwaway M0 protocol scripts
data/                local DB and exports (gitignored); the calibrated ladder files are committed
```

The same core runs locally and on Cloudflare: the public site is a read-only Worker over a D1 database
that the runner publishes into.

## Documents

| Doc | What it is |
| --- | --- |
| [`docs/BENCHMARK-REPORT.md`](docs/BENCHMARK-REPORT.md) | **The research report** (also as [PDF](docs/BENCHMARK-REPORT.pdf)): protocol, ladder, scoring, results, limits |
| [`PRODUCT.md`](PRODUCT.md) | Who the public site is for and its design principles |
| [`docs/UI.md`](docs/UI.md) | Design tokens, screens, components, playback behaviour |
| [`docs/API.md`](docs/API.md) | HTTP + SSE contract, TypeScript types, SQLite/D1 schema |
| [`docs/METRICS.md`](docs/METRICS.md) | Elo and series maths (posterior, ladder, stop rules) and per-move oracle metrics |
| [`docs/PROMPTS.md`](docs/PROMPTS.md) | Verbatim request builders: clean, hinted and image arms, parsing, retries |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Stack, ports and adapters, run phases, limits |
| [`docs/DEPLOY.md`](docs/DEPLOY.md) | Publishing to the read-only Cloudflare site |
| [`docs/BENCH-RUNBOOK.md`](docs/BENCH-RUNBOOK.md) | Running a sweep on a remote machine |
| [`docs/CHANGELOG.md`](docs/CHANGELOG.md) | What changed, task by task |
| [`docs/PLAN.md`](docs/PLAN.md), [`docs/IMPLEMENTATION.md`](docs/IMPLEMENTATION.md), [`docs/build/README.md`](docs/build/README.md) | The original plan and build curriculum (historical) |
| [`docs/SPIKE.md`](docs/SPIKE.md), [`docs/RESEARCH.md`](docs/RESEARCH.md), [`docs/TEXT_ARM.md`](docs/TEXT_ARM.md) | M0 measurements, API and toolchain facts, a deferred text-model arm |

## Scope

- **Done:** run locally, publish results to a read-only Cloudflare site, and the full 20-model sweep.
- **Next:** more models as they ship (same plan, same ladder); running live on Cloudflare (Durable Objects
  plus a Stockfish server) is designed but not built.
- **Budget:** a hard cap per run, default $1.00, with an estimate before anything is spent.
- **Non-goals:** not a chess engine, no human-vs-model play, no auth, no per-model prompt tuning, and no
  generated commentary. Every sentence on the site is fixed wording filled in with numbers.

## License

[MIT](LICENSE). Copyright (c) 2026 Autumn Brown.
