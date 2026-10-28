# T02 — Web: New game, spend chip, banners, Playwright

**Goal:** from the browser you can start a game (mock or real), watch it live, and see spend and errors. Phone-first.

## Files

`apps/web/src/lib/{api.ts,stores.svelte.ts,NewGameDialog.svelte,SpendChip.svelte,Banner.svelte}`,
`apps/web/src/routes/+layout.svelte` (header), `apps/web/src/routes/games/+page.svelte` (list + dialog),
`apps/web/playwright.config.ts`, `apps/web/e2e/*.spec.ts`, root `package.json` script `e2e`.

## 1. `api.ts` (typed fetch helpers)

`getJson<T>(path)`, `postJson<T>(path, body)` that throw `ApiClientError {status, code, message, detail}` parsed from the error envelope.
Typed wrappers: `listGames, getGame, createGame, gameAction(id, 'auto'|'pause'|'step'|'stop', body?), getModels, estimate, getSpend, getHealth, getLadder`.

## 2. Header (`+layout.svelte`)

`ChessDecide` link, nav `Games`, health chips (OpenRouter key present, Stockfish ok, ladder calibrated/uncalibrated — amber when
uncalibrated), `SpendChip` showing session spend (`$0.0031`) from `GET /api/spend?since=session`, refreshed every 10 s and after each game event.
In public mode (`health.control === false`) hide New game, spend and the chips (read-only site).

## 3. New game dialog (`NewGameDialog.svelte`)

Opened from a "New game" button on `/games`. Fields (all with labels and ids):

| Field | Control | Default |
| --- | --- | --- |
| Model | `<select>` roster first, "More models" optgroup, disabled models listed with `disabled_reason` | `typesafe/jev-1.14` |
| Arm | radio: Clean (default), Hinted; Image shown **disabled** with "coming soon" until T12 | clean |
| Opponent | `<select>` from `GET /api/ladder` levels, label `Random mover · 250` etc., plus the ladder's calibrated flag | `eps50` |
| Model plays | radio White / Black / Random | White |
| Opening | radio Start position / Random 4 plies | Start position |
| Pace | `<select>` Fast (0 ms) / Watch (600 ms) / Slow (1500 ms) | Watch |
| Budget cap | number input USD | 1.00 |
| Mock model | checkbox shown only when `health.mock` is true | on in mock mode |

- A live estimate line under the form from `POST /api/estimate` (debounced 300 ms): `≈ $0.003 · up to $0.012 · 30 model calls`; red if `over_cap`.
- **Start** posts `POST /api/games` then `POST /api/games/:id/auto {pace_ms}` then navigates to `/games/:id`. Errors show in a `Banner`
  (402 → "Estimated $X exceeds your cap of $Y", 424 → "No OpenRouter key is set on the server", 400 → the message).
- Colour "Random" uses `crypto.getRandomValues`; the choice is stored in the config (White/Black assignment), never decided server-side.
- Keyboard: Esc closes, Enter submits. Focus moves into the dialog and returns to the button on close. Use `<dialog>`.

## 4. Games list

Table/list rows: result chip (Model won / Model lost / Draw / In progress), short id, model, opponent, plies, cost, time ago.
Empty state: "No games yet" with the New game button. Polls `GET /api/games` every 5 s while any game is `running`.

## 5. Banner states (component)

`info | warn | error`, dismissible, `role="status"` / `role="alert"`. The Viewer (T03) shows: *retrying* (from `error`/`status` events),
*paused (error: …)* with a Resume button (`auto`), *stopped_budget* with "Raise cap" (PATCH is out of scope: show a hint to restart with a higher cap),
*server_restart paused* with Resume.

## 6. Playwright

`pnpm --filter @chessdecide/web add -D @playwright/test@1.64.1`; `pnpm --filter @chessdecide/web exec playwright install chromium`.
`playwright.config.ts`: `webServer` array starting the daemon (`CHESSDECIDE_MOCK=1 pnpm --filter @chessdecide/runner dev`, port 8731,
wait on `/api/health`) and Vite (`pnpm --filter @chessdecide/web dev`); projects: Chromium at 400×800 and 1280×800.
Isolate state: set `CHESSDECIDE_D1_PATH` (already honoured by `openLocalDb` and `vite.config.ts`; default `data/d1/v3`) to a temp dir per run and apply the migrations there first (`wrangler d1 migrations apply DB --local --persist-to <dir without /v3>`).

Specs (all in mock mode, `max_plies` 12, `pace_ms` 0, judge depth 6 for speed):
1. Create a game from the dialog → lands on the Viewer → plies appear live → finishes (`Draw`).
2. Estimate line appears and turns red when the cap is set to 0.001; submit is blocked or returns the 402 banner.
3. List shows the finished game with the right chip; clicking opens the Viewer.
4. Header: chips render; uncalibrated notice visible.
5. 400 px layout: no horizontal scroll (`document.documentElement.scrollWidth <= innerWidth`) on `/games` and `/games/:id`.

Add root script `"e2e": "pnpm --filter @chessdecide/web exec playwright test"`. `e2e` is **not** part of `pnpm verify` (needs browsers).

## Acceptance

`pnpm verify` and `pnpm e2e` green. Manual: in mock mode, New game → watch it play at "Watch" speed on a phone-width window.

Commit: `Add new game dialog, spend chip and e2e tests`.
