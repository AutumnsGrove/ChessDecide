# ChessDecide build curriculum (for the implementing model)

You are the implementing model. This folder is your complete brief. **Do not design; build.**
Every decision is already made in `DECISIONS.md`; every task says exactly which files to create,
which signatures to use, which tests to write and what "done" means. If something is missing,
follow the rule in §4 instead of guessing.

## 1. What is already built (verified)

`docs/build/reference/` is a working, tested foundation (80+ tests, typecheck and `svelte-check` clean,
checked from a fresh copy with `pnpm install --frozen-lockfile`). It contains:

| Package | What it already does |
| --- | --- |
| `packages/core` | rules wrapper (chess.js), bare/annotated move descriptions, request builders + parser for the `clean`/`hinted`/`image` arms, Elo posterior, ladder levels + fit, oracle math, adjudication, `stepGame`/`playToEnd`, series scheduler (`nextAction`), seeded random openings, series stats |
| `packages/engine` | `Engine` port, native UCI adapter (crash recovery), Stockfish/ε/random opponents, `EngineJudge` (full per-move oracle, cached) |
| `packages/providers` | OpenRouter Decisions client (retry, per-model concurrency, rate limit), `ModelPlayer`, `MockPlayer`, budget helpers |
| `packages/db` | Drizzle schema + migration, D1 game/ply/attempt store, spend query |
| `packages/api` | Hono API (`createApi`): health, games, game, SSE, control routes |
| `packages/runner` | local D1 opener, runtime, `LocalControlPlane` (auto/pause/step/stop), daemon (`serve`), CLI `game` |
| `apps/web` | SvelteKit 3 app: read-only API route, Viewer (replay + live attach), games list |

**T00 installs it. Read the code before extending it: it is the style guide.** Match its naming,
comment density and structure. Do not rewrite working code to taste.

## 2. Order of work

```
T00 install & verify the foundation
T01 real model wiring (catalog, estimate, key handling, probe)
T02 web: New game dialog, spend chip, banners, Playwright tests
T03 viewer extras: decision panel + Playwright tests
T04 FIRST REAL GAME  ── STOP: report to Autumn and wait ──
T05 ladder calibration job
T06 series runner (control plane, store, events)
T07 series UI
T08 FIRST REAL SERIES ── STOP: report to Autumn and wait ──
T09 leaderboard
T10 publish + read-only deploy
T11 exports
T12 image arm
T13 headless bench (batch plan → committed results)
```

Phase 2/3 (live on Cloudflare, scale-out) are **not** in this curriculum.

## 3. How to work

1. Read `DECISIONS.md` once, fully. Re-read the relevant section before each task.
2. Open the task file. Do the steps in order. Write tests first when the task lists test cases.
3. Run `pnpm verify` before each commit (it runs the lockfile guard, typecheck, `svelte-check`, all tests).
   Paid or live tests only run with `LIVE=1`; never in `pnpm verify`.
4. **One commit per task**, message: present tense, first line < 50 chars, e.g. `Add real model players and probe command`.
   Add a section to `docs/CHANGELOG.md` per task (what you built, deviations, numbers measured).
5. If a task's acceptance check fails, fix the code, not the test, unless the test contradicts a doc;
   then stop and ask (§4).
6. Never: use npm/npx/yarn/bun, add Tailwind or a UI/chart library, commit a key or `.env`, spend money in
   tests, add features that are not in a task, generate commentary with a model, edit an applied migration.

## 4. When you are stuck

Use the AskUserQuestion tool. Ask only when:

- a task or doc contradicts the code or itself, and the fix is a decision (not a bug);
- a task says **STOP and ask** (T04, T08, and the Cloudflare-credential step in T10);
- you need a spend beyond the budget stated in a task;
- a measured number makes a documented default unreasonable (for example one game takes > 3 minutes of wall-clock).

Otherwise decide using `DECISIONS.md`, note the decision in `docs/QUESTIONS.md` (one line) and continue.
A good question names the files involved, gives 2–3 concrete options and your recommendation.

## 5. Where the specs live

| Topic | Doc |
| --- | --- |
| Decisions you must follow | `DECISIONS.md` |
| Types and event order | `CONTRACTS.md` (source of truth: `reference/packages/core/src/types.ts`, `ports.ts`) |
| Architecture and phases | `../ARCHITECTURE.md` |
| Prompt/request formats | `../PROMPTS.md` |
| Elo, oracle, series maths | `../METRICS.md` |
| HTTP/SSE API and SQL schema | `../API.md` |
| UI tokens and behaviour | `../UI.md`, target look `../mockups/simple.html` |
| Spike measurements | `../SPIKE.md` |
