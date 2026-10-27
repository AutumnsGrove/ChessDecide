# Handoff — where we left off (2026-10-27)

For the next Claude Code session (possibly remote). Read this first, then `README.md` and
`docs/PLAN.md`. Autumn uses **she/her** pronouns.

## 1. State of the project

**Design is locked at v3; there is no application code yet.** Everything so far is docs, M0
spike scripts, and clickable UI mockups. Nothing has been run against the live API since M0.

| Done | Where |
| --- | --- |
| M0 protocol spikes (Decisions API, Stockfish, text models) | `spikes/`, `docs/SPIKE.md` |
| Plan v3: Series + Elo as the headline, cost caps, arms | `docs/PLAN.md` |
| Elo posterior, ladder calibration, stop rules, per-move metrics | `docs/METRICS.md` |
| Verbatim request builders / parsing / retries | `docs/PROMPTS.md` |
| HTTP + SSE contract, Go/TS types, SQLite schema | `docs/API.md` |
| UI spec, tokens, playback state machine | `docs/UI.md` |
| Task-by-task build guide for the implementing model (DeepSeek) | `docs/IMPLEMENTATION.md` |
| Parked text-model arm | `docs/TEXT_ARM.md` |
| Clickable mockups (real chessground board, lichess dark) | `docs/mockups/index.html` |

To see the mockups: `open docs/mockups/index.html` (no server, no key). Start with **Series ·
leaderboard** and the **Game viewer** (autoplay, scrub the eval graph, state menu in the footer).

Caveats on the mockups: the model's probability bars and all Series/leaderboard numbers are
**simulated or invented** and labelled as such; board positions and evals in the sample game are
real Stockfish 19 (depth 11). They were smoke-tested in jsdom (no runtime errors) but the user was
the first to look at them in a real browser; she said they look great.

## 2. What the project is (one paragraph)

Rate **decision models** (OpenRouter's Decisions API: Jev, D1 Ultra, …) at chess by having each play a
**series of games vs Stockfish** on an adaptive ladder and estimating **Elo with a 95 % interval**
(`METRICS.md` Part B). Every ply is judged by Stockfish, which explains the rating (ACPL, acceptable-move
rate, blunders, calibration). A lichess-style dark web UI shows games live or as playback. Cost is a
first-class constraint: ~$0.003–0.006 per game, ~$0.10–0.15 per Quick series, hard cap default $1.00.

## 3. Locked decisions (from Autumn)

- **Goal #1:** test decision models. **Goal #2:** keep cost down. Text models are *not* in v1 or any
  default path (`TEXT_ARM.md` is a parked appendix).
- **Roster:** start with just `typesafe/jev-1.14` and `liquid/d1-ultra`; expand only if testing goes well.
- **Two arms per model, both reported, never merged:** `clean` (UCI keys, plain descriptions) and
  `hinted` (SAN keys, check/mate text).
- **Scoring:** Elo via an **adaptive ladder** (blocks of 5 games, opponent nearest the current estimate).
- **Series sizes:** Quick **25** (default), Standard **50**, and **To completion** (until ±75 Elo, or 200
  games / budget cap). No "thorough" preset.
- **Weak models:** build our own ladder levels below Stockfish's 1320 floor (random mover + ε-random mixes),
  calibrated with free CPU-only games.
- **Openings:** single games may use start position or random 4 plies; series always use seeded random
  4-ply openings, paired with colours swapped.
- **Budget:** per-run hard cap, default $1.00, estimate-first.
- **Compare** (same position, many models) is **dropped from v1**.
- **Model vs model** (e.g. Jev vs D1 Ultra) is wanted **later**, once the thing is proven (planned as M5,
  `PLAN.md` §4.9; the `Player` abstraction already supports it).
- **UI:** dark, lichess-like, nice board, and a **playback mode she can watch**. She wants the **web UI
  first**, with the command line used for backend work.

## 4. Autumn's context and the open question (important)

Autumn **doesn't play chess much**. Her honest worry: it's hard for her to judge whether the project is
being done *well*, and chess is more abstract to her than other games. She compared it to watching someone
have **Jev play Pokémon**, which made sense to her because there's a "traditional game sense" there
(story, progress, a game she understands). She thinks the project is still a good idea but "might be a bit
more nuanced than I'm giving it credit for", and wants to **plan what it will look like** in the next session.

What I told her (so the next session stays consistent):

- She doesn't have to judge chess quality herself — Stockfish's eval bar, move labels (mistake/blunder) and
  the Elo number do that, and she can learn by watching.
- Weak models hanging their queen are entertaining even to non-players; but chess has a score and not much
  narrative, unlike Pokémon. If a rising number doesn't motivate her, it may feel flat.
- The real cost is attention and build time, not money.
- **Cheap test proposed:** build the viewer against the **mock provider ($0)**, then run **one real Jev game
  (~half a cent)** and watch it. Continue to Series/Elo only if she's curious. This reorders the guide so the
  **web UI (M2 viewer + mock) comes before the Series/ladder work**; CLI (`game --mock`, `probe`) stays as the
  backend dev tool.
- The harness (model picks → judge scores → rating) is not chess-specific in shape, but the move generator,
  Stockfish and the ladder are. Swapping to a game she follows (Pokémon-like) would be real work, but it's a
  fair question to ask before committing.

**I ended by asking her:** what did she like about the Pokémon run — the model's personality in its choices,
the progress through the game, or just watching an AI do something she understands? Her answer decides whether
chess can scratch the same itch, and may change scope (e.g. more emphasis on watching/narrating games,
"commentary" on blunders, model-vs-model drama, or a different game entirely).

## 5. Suggested agenda for the next session

1. **Ask / hear her answer on the Pokémon question** and what "watchable" means to her.
2. **Decide the order of work**: recommended = (a) bootstrap + chessx + mock provider + game orchestrator +
   API + **Viewer** with mock (`IMPLEMENTATION.md` T1.0–T1.1, T1.5, T1.8, T2.x), (b) one real game, (c) go/no-go,
   (d) ladder + Series (M3).
3. Consider small additions that make games *more legible to a non-chess-player*: plain-language move
   commentary ("Jev left its queen undefended"), a "what just happened" highlight on blunders, captured-material
   display, a simple "who's winning" sentence beside the eval bar. (These are ideas only; not in the docs yet.)
4. Re-order `IMPLEMENTATION.md` so the Viewer-with-mock path is first; possibly trim M1 to the minimum needed.
5. Optionally revisit whether chess is the right game (see §4) before handing `IMPLEMENTATION.md` to DeepSeek.

## 6. Known facts and caveats to remember

- **Ladder numbers in the docs are placeholders** (random 250, ε.75 560, ε.5 790, ε.3 980, ε.15 1150, SF 1320+).
  Real values come from `chessdecide ladder calibrate`. The worked Elo example in `METRICS.md` B3 was computed
  with those placeholders and reproduced numerically.
- M0 results are N=1–2 positions; `docs/SPIKE.md` now carries a banner listing which claims are hypotheses
  (determinism, order invariance, calibration) and why mate-in-1 "saturation" was confounded by SAN `#` /
  "checkmate" in descriptions (the `clean` arm removes that).
- M0 oracle inconsistency (root-search reference vs child-search move scores) is why `METRICS.md` §3 defines
  one procedure for every move.
- Unverified until M1: `slim` vs `full` state equivalence, whether `GET /api/v1/key` shows remaining credit,
  oracle seconds per position at depth 14/18, how strong these models really are.
- Environment: Stockfish 19 (Homebrew), Go 1.26, Node 26/Bun, `uv`; no browser automation installed in the CLI
  sandbox (jsdom was used for smoke tests). Chessground 9.2.1 is vendored in `docs/mockups/vendor/` (the min.js
  is patched from ESM export to `window.Chessground` so it works over `file://`; GPL-3 licence file included).
- Repo: `origin` = `github.com/AutumnsGrove/ChessDecide`, branch `main`. The project's parent `CLAUDE.md` says to
  use `uv run` for Python and format Python with Black; commit messages in present tense, first line < 50 chars.
- Never commit an API key. `spikes/out/` and `data/` are gitignored.

## 7. File map

```
README.md                      overview + doc index
docs/PLAN.md                   decisions, scoring, cost, architecture, risks, milestones
docs/METRICS.md                Part A per-move oracle; Part B Elo/series/ladder (headline)
docs/PROMPTS.md                request builders, parsing, retry, cache, estimator
docs/API.md                    endpoints, SSE events, types, SQLite DDL, env config
docs/UI.md                     tokens, screens, components, Viewer state machine, states
docs/IMPLEMENTATION.md         ordered tasks + acceptance checks for the implementer
docs/TEXT_ARM.md               deferred text-model arm
docs/SPIKE.md  RESEARCH.md     M0 findings; API/toolchain facts
docs/HANDOFF.md                this file
docs/mockups/                  index.html, play.html (viewer), series.html, series-list.html, games.html,
                               app.css, common.js, newgame.js, sample_game.js, tools/gen_sample_game.py, vendor/
spikes/                        M0 scripts (throwaway)
```
