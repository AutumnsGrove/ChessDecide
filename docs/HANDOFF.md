# Handoff — where we left off (2026-10-27, session 2)

For the next Claude Code session (possibly remote). Read this first, then `README.md`,
`docs/PLAN.md` and `docs/ARCHITECTURE.md`. Autumn uses **she/her** pronouns. She often works by
voice on a walk: **keep replies short and conversational**, no walls of text, expect transcription errors.

## 1. State of the project

**Design locked at v4; there is still no application code.** This session re-planned the stack and
rewrote the docs. Nothing has been run against the live API since M0.

| Done | Where |
| --- | --- |
| M0 protocol spikes (Decisions API, Stockfish, text models) | `spikes/`, `docs/SPIKE.md` |
| Plan v4: stack, phases, arms, viewer-first order | `docs/PLAN.md`, `docs/ARCHITECTURE.md` |
| Elo posterior, ladder calibration, stop rules, per-move metrics | `docs/METRICS.md` |
| Request builders: clean / hinted / image arms | `docs/PROMPTS.md` |
| HTTP + SSE contract, TS types, SQLite/D1 schema | `docs/API.md` |
| UI spec | `docs/UI.md` |
| Build guide (TypeScript, viewer-first) | `docs/IMPLEMENTATION.md` |
| **Simple phone-friendly mockup** (real chessground board, simulated moves) | `docs/mockups/simple.html`, published as an Artifact |
| Older dense mockups (still valid for later screens) | `docs/mockups/index.html` and pages |

Artifact link for the simple mockup (private to Autumn): https://claude.ai/artifact/VLGNvGEUkvB8p8mf7D3eww

## 1b. Curriculum for the implementing model (added later in session 2)

`docs/build/` is the brief for DeepSeek (or any smaller model): `README.md` (workflow), `DECISIONS.md` (every decision pre-made, versions pinned, gotchas),
`CONTRACTS.md`, `tasks/T00–T12`, `fixtures/`, and `reference/` = a **working, tested foundation** (80+ tests; verified from a fresh copy with
`pnpm install --frozen-lockfile && pnpm db:migrate && pnpm verify`). T00 installs it; T01–T03 add real models/web/viewer; **T04 and T08 are STOP-and-ask checkpoints**
(first real game, first real series). Key findings while building it: SvelteKit 3 needs TypeScript 6.0.3 (7.x breaks it), `$lib` is gone (`#lib`), `getPlatformProxy`
state path vs wrangler CLI (`…/v3`), Workers cannot spawn Stockfish so games run in a Node **daemon** with a Hono API (the same API is mounted read-only in the deployed site),
and the FK order game-before-ply. Publishing = generate idempotent SQL and run it with `wrangler d1 execute --remote` (no tokens in the repo).

## 2. What changed this session (v3 → v4)

- **Why chess works for her:** she liked the Pokémon run because the model was dropped into an
  environment it was never trained for and had to adapt. Chess is the same kind of test: a generalist
  decision model against a specialist engine. Cheap runs matter (the Pokémon run cost about $2).
- **Scope reset:** v1 starts from "did it win" plus a move-by-move replay; **Elo remains the way to
  compare models** (she wants Jev vs Clef vs D1 etc.) but is built after the viewer and one real game.
  Elo was explained to her in plain terms; keep UI language simple.
- **Weakened Stockfish:** full-strength Stockfish is pointless; the ladder (weak levels below 1320)
  covers it.
- **Stack: TypeScript, not Go.** SvelteKit, raw CSS (**no Tailwind**, she is firm), Drizzle + SQLite →
  Cloudflare D1, `chess.js`, Durable Objects later. Reason: she wants to publish it on Cloudflare
  (free tier today; she could pay for Workers later).
- **Phases:** (1) run locally, publish results to a read-only public site; (2) live runs on Cloudflare
  (Durable Objects, Stockfish in a Container or on a server); (3) many models × hundreds of games.
  "It should be as easy as swapping something out": hence ports/adapters and a one-ply `stepGame`.
- **Engine adapter:** Stockfish first, other UCI engines later (she wants that extensibility).
- **Cloudflare facts (checked 2026-10-27):** free Workers = 10 ms CPU and 50 subrequests per
  invocation; Containers need the paid plan; Durable Objects (SQLite) work on free. Stockfish cannot
  run inside a free Worker. Re-check before phase 2 (`ARCHITECTURE.md` §5).
- **Arms:** `clean` is now **fully bare** (`Knight g1 to f3`, no capture/check/mate hints, no
  `in_check`); `hinted` is opt-in; new optional **`image` arm** (rendered board PNG + the same bare
  options; no FEN). Jev uses a slower long-context mode for any image; the arm is reported separately.
- **No generated commentary** (costs money). The one-line status in the mockup uses templates over
  Stockfish numbers only.
- **Legality:** options come from the rules library (`chess.js`), never from the model, so illegal
  moves are impossible. Stockfish is not used for legality.

## 3. Locked decisions (carried over)

- Goal #1: test decision models. Goal #2: keep cost down. Text models are out of v1.
- Roster: `typesafe/jev-1.14`, `liquid/d1-ultra`; expand only if testing goes well.
- Scoring: Elo via an adaptive ladder (blocks of 5), Quick 25 / Standard 50 / To completion.
- Series use seeded random 4-ply openings, colours alternate; single games may start from startpos.
- Budget: hard cap per run, default $1.00, estimate-first.
- Compare (same position, many models) dropped from v1. Model-vs-model wanted later (M8).
- UI: dark, lichess-like, nice board, a playback mode she can watch, **phone-readable**.

## 4. Open items

1. **Spike S1** (`ARCHITECTURE.md` §9): local D1 via `getPlatformProxy()` + Drizzle from Node, else
   `better-sqlite3`.
2. **Spike S2:** how the Decisions API accepts an image; do Jev/D1 Ultra pick sensibly from it (≈ $0.01).
3. Spike S3 (optional): single-thread WASM Stockfish in a Worker on the paid plan.
4. M0 results are N = 1–2 positions; claims about determinism, order invariance and calibration are
   hypotheses (`SPIKE.md` banner). Ladder numbers in the docs are placeholders until calibrated.
5. Unverified until M1: `slim` vs `full` state equivalence, whether `GET /api/v1/key` shows credit,
   oracle seconds per position, how strong these models really are.
6. Does she want the Ratings tab in `simple.html` simplified further? (Asked; no answer yet.)

## 5. Suggested next session

1. Confirm the docs read right to her (short summary, not the files).
2. Run spikes S1 and S2, then start `IMPLEMENTATION.md` M1 (T1.0–T1.7) and M2 (viewer + mock),
   then the **one real game and go/no-go (T2.6)**. Ask her before continuing to Series.
3. Mockup caveat: probabilities, model moves and all ratings in `simple.html` are simulated; board
   positions and evals are real Stockfish 19 (depth 11).

## 6. Facts and caveats

- Environment (her machine): Stockfish 19 (Homebrew), Node 26 (needed by pnpm), `uv`. Package manager: **pnpm only** (Autumn's rule; no npm, yarn or Bun). No browser automation in the
  CLI sandbox; Chromium + Playwright exist in the cloud sandbox and were used to screenshot the mockup.
- Chessground 9.2.1 is vendored in `docs/mockups/vendor/` (min.js patched to `window.Chessground`;
  GPL-3 licence included). `simple.html` inlines it plus the piece/board images, so it works as a
  self-contained Artifact. Its script is wrapped in an IIFE because chessground declares globals.
- Repo: `origin` = `github.com/AutumnsGrove/ChessDecide`. Work branch this session:
  `claude/decision-model-chess-bench-lj0106`. Parent `CLAUDE.md`: `uv run` for Python, Black, commit
  messages in present tense, first line < 50 chars.
- Never commit an API key. `spikes/out/` and `data/` are gitignored.

## 7. File map

```
README.md                      overview + doc index
docs/PLAN.md                   decisions, scoring, cost, risks, milestones
docs/ARCHITECTURE.md           TS stack, ports/adapters, phases, Cloudflare limits, spikes
docs/METRICS.md                Part A per-move oracle; Part B Elo/series/ladder (headline)
docs/PROMPTS.md                request builders, parsing, retry, cache, estimator, image arm
docs/API.md                    endpoints, SSE events, TS types, SQLite/D1 DDL, env config
docs/UI.md                     tokens, screens, components, Viewer state machine, states
docs/IMPLEMENTATION.md         ordered tasks + acceptance checks for the implementer
docs/TEXT_ARM.md               deferred text-model arm
docs/SPIKE.md  RESEARCH.md     M0 findings; API/toolchain facts (RESEARCH Go notes are history)
docs/HANDOFF.md                this file
docs/mockups/simple.html       v1 target mockup (self-contained)
docs/mockups/                  index.html, play.html, series.html, series-list.html, games.html, app.css,
                               common.js, newgame.js, sample_game.js, tools/gen_sample_game.py, vendor/
spikes/                        M0 scripts (throwaway)
```
