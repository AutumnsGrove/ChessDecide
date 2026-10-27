# ChessDecide

Local harness that **rates decision models at chess**. Each model (Jev, D1 Ultra, …) plays a
**series of games against Stockfish** on an adaptive ladder, and we estimate its **Elo with a
confidence interval**. A lichess-style dark GUI lets you watch any game live or play it back
move by move. Costs are tiny and capped (a 25-game series ≈ $0.10).

> **Status: design locked v3 (2026-10-27); M0 spikes passed; clickable mockups done. No app code yet.**
> Open [`docs/mockups/index.html`](docs/mockups/index.html) in a browser to see the planned UI.

## Documents

| Doc | What it is |
| --- | --- |
| [`docs/PLAN.md`](docs/PLAN.md) | Locked decisions, scoring approach, cost model, architecture, risks |
| [`docs/METRICS.md`](docs/METRICS.md) | Elo/series maths (posterior, ladder, stop rules) + per-move oracle metrics |
| [`docs/PROMPTS.md`](docs/PROMPTS.md) | Verbatim request builders (keys, descriptions, state, parsing, retries) |
| [`docs/API.md`](docs/API.md) | HTTP + SSE contract, Go/TS types, SQLite schema |
| [`docs/UI.md`](docs/UI.md) | Design tokens, screens, components, playback behaviour, states |
| [`docs/IMPLEMENTATION.md`](docs/IMPLEMENTATION.md) | **Build guide** for the implementing model: ordered tasks + acceptance checks |
| [`docs/SPIKE.md`](docs/SPIKE.md), [`docs/RESEARCH.md`](docs/RESEARCH.md) | M0 measurements; API/toolchain facts |
| [`docs/TEXT_ARM.md`](docs/TEXT_ARM.md) | Deferred: text-model comparison (not in v1) |
| [`docs/HANDOFF.md`](docs/HANDOFF.md) | **Start here when resuming**: state, decisions, open questions, next steps |

## The idea

Decision models take a `state` plus typed questions (`choice`, `noul`, `score`) and return
calibrated answers — no prose, free output tokens, very cheap. Chess gives a closed set of legal
moves, so "which move is best?" is a `choice` question and illegal moves are impossible.

- **Headline:** Elo on the ChessDecide Stockfish ladder (adaptive blocks of 5 games; opponent
  chosen near the current estimate; weak levels below Stockfish's 1320 floor built by mixing in
  random moves and calibrated with free CPU-only games).
- **Explanation:** every game ply is judged by Stockfish (depth 14): ACPL, acceptable-move rate,
  blunders, probability mass on good moves, calibration of P(pick).
- **Two arms per model:** `clean` (UCI keys, no hints) and `hinted` (SAN keys, "check/mate" text).

## Scope (locked)

- **v1:** single games (watch live / playback) and **Series** (Quick 25 · Standard 50 · To completion).
- **Roster:** `typesafe/jev-1.14`, `liquid/d1-ultra` first; the rest of the catalog is one click away.
- **Budget:** hard cap per game/series, default $1.00, estimate-first.
- **Later:** model vs model matches (M5), position suite/ablations, text-model arm (optional).
- **Dropped from v1:** same-position multi-model Compare.

## Planned shape

```
web/                 SvelteKit + chessground (Series, Games, Viewer)
cmd/chessdecide/     Go server (HTTP + SSE) and CLI (serve, game, probe, ladder calibrate)
internal/            chessx, engine, oracle, openrouter, providers, budget, game, ladder, series, store, api
tools/               python helpers (golden fixtures)
docs/mockups/        clickable UI prototypes (+ vendored chessground)
spikes/              M0 protocol scripts (throwaway)
data/                SQLite DB, ladder files, exports (gitignored)
```

## Before building

1. `OPENROUTER_API_KEY` in the environment (never committed).
2. `brew install stockfish` (Stockfish 19 is installed on this machine).
3. Read `docs/IMPLEMENTATION.md` and follow its task order.

## Non-goals (v1)

No online deployment/auth (bound to `127.0.0.1`), not a chess engine, no human-vs-model play,
no per-model prompt tuning, no text-model spend.
