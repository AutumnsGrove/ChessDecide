# T04 — FIRST REAL GAME (checkpoint: stop and ask)

**Goal:** prove the whole stack with one real, cheap game, and give Autumn what she needs to decide whether to continue.

Requires Autumn's OpenRouter key in `.env` (`OPENROUTER_API_KEY=…`). **Do not proceed without it: ask for it** (AskUserQuestion: "Please add your
key to .env and say 'ready'"). Expected spend ≈ $0.003–$0.006; hard cap $0.05 for this task.

## Steps

1. `pnpm cli probe --model typesafe/jev-1.14 --arm clean` once. Record cost (≈ $0.00005), latency, tokens.
2. Start `pnpm dev`, open the New game dialog: model `typesafe/jev-1.14`, arm Clean, opponent `eps75` (weakest non-random, so Jev has a chance),
   Jev plays White, start position, Watch pace, budget **$0.05**. Watch it play live in the browser.
3. When it ends (or after 120 plies if it drags): record from the game row and API: result, termination, plies, total cost, per-call average cost,
   average latency, wall-clock, number of forced plies, mistakes/blunders, ACPL (mean `judge.cpl` over the model's non-forced plies), the
   count of calls that needed retries, and `spend` from `/api/spend`.
4. Verify against the estimate: `|actual − estimate| / actual` and report whether the estimator is conservative (it should be ≥ actual).
5. Take screenshots (Playwright, 400 px) of the Viewer at the start, mid-game and end; save to `docs/build/reports/T04-*.png`.
6. Write `docs/build/reports/T04-first-real-game.md`: the numbers above, anything that looked wrong (illegal-move rate must be 0; any `invalid_choice`
   retries; any 429s), and a recommendation: continue to the ladder/series work, or change something first.
7. Commit the report: `Record first real game results`.

## STOP

Use AskUserQuestion: "First real game done: <one-line summary>. Continue to ladder calibration and series?" with options
**Continue** (recommended if the game completed with 0 errors), **Run one more game with another opponent first**, **Pause here**. Do not start T05 until answered.
