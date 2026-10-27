# ChessDecide

Local benchmark + GUI for playing **decision models** (Jev, D1 Ultra, Microsoft Decision 1,
Clef, …) at chess, with text models as the comparison arm and Stockfish as the baseline.

> **Status: design locked, M0 spikes passed (2026-10-27).** No app code yet.
> - [`docs/PLAN.md`](docs/PLAN.md) — design, benchmark protocol, architecture, milestones
> - [`docs/SPIKE.md`](docs/SPIKE.md) — what we measured and what it changed
> - [`docs/RESEARCH.md`](docs/RESEARCH.md) — API shapes, catalog, toolchain facts

## The idea in one paragraph

Decision models take a `state` plus typed questions (`choice`, `noul`, `score`) and return
calibrated answers — no prose, free output tokens, very cheap. Chess gives us a closed set of
legal moves, so we can ask "which move is best?" as a `choice` question, score the answer
against Stockfish (ACPL, top-1, blunder rate), and also score the **probability distribution**
(P(best move), expected CPL, calibration). A SvelteKit GUI shows the board move-by-move; a Go
backend owns Stockfish (UCI), the OpenRouter clients, and the benchmark runner.

## Scope (locked)

- **v1:** Play vs Stockfish (watchable, step/auto) + Compare (same position, many models).
- **Move options:** all legal moves (verified up to 63 options).
- **Decision models:** live catalog dropdown, filtered to `decisions` output modality.
- **Text arm:** six standard models (`deepseek-v4.1-flash`, `claude-haiku-5.5`, `gpt-6-luna`,
  `mimo-v2.6-flash`, `glm-5.3-flash`, `muse-spark-1.3`) × free-text / forced tool / JSON schema.
  Reasoning effort is a recorded dimension.
- **Judge:** Stockfish 19, depth 18, WDL + centipawn loss; CPL and win% loss.

## What M0 already showed

- 63 choice options: accepted, P sums to ~1, ~0.5–0.9 s per decision, $0.0001–$0.0002.
- Option order does not change the pick, but shifts P(pick) by ±0.05–0.08.
- Mate-in-1 is saturated (P≈0.98); quiet positions are where models differ.
- Text models cost 10–40× more once reasoning is on; reasoning effort is the dominant knob.
- Protocol fixes needed: reasoning budget, empty-response nudge, tool-choice fallback, 429 backoff.

## Planned shape

```
web/                 SvelteKit + chessground (board, controls, leaderboard)
cmd/chessdecide/     Go server (HTTP + SSE)
internal/            chess, engine, openrouter, providers, game, bench, store, api
spikes/              M0 protocol scripts (throwaway, results gitignored)
data/                SQLite DB, position suites, run exports (gitignored)
docs/                plan, spike findings, research
```

## Before building

1. `OPENROUTER_API_KEY` in the environment.
2. `brew install stockfish` (already installed on this machine; Stockfish 19).
3. Read `docs/SPIKE.md` §6 for the locked protocol changes.

## Non-goals (v1)

- No online deployment, accounts, or auth — bound to `127.0.0.1`.
- Not a chess engine, not a training pipeline, not a human play app.
- No per-model prompt tuning; templates are fixed and shared.
