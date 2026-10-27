# T03 — Viewer extras: decision panel, controls for live games, tests

**Goal:** a viewer that explains *what the model considered* using only stored numbers (no model calls), and controls to pause/resume live games.

## Files

`apps/web/src/lib/{DecisionPanel.svelte,LiveControls.svelte,Viewer.svelte (edit)}`, `apps/web/src/lib/viewer-model.ts` (+ tests),
`apps/web/e2e/viewer.spec.ts`.

## 1. DecisionPanel (below the status card, collapsed by default, `<details>`)

For the currently shown **model** ply with `decision` and `judge`:

- Heading: `What the model considered`.
- Up to 9 rows from `decision.top_options` sorted by `p` descending (the pick and Stockfish's best are always included): 
  `SAN` (mono) · probability bar (width = `p`, scale 0–100 %) · `p` as `34 %` · Stockfish loss chip: `best` (green) when `cpl === 0`, else
  `−1.3 pawns` coloured by class (≤ 0.2 pawns neutral, inaccuracy amber, mistake/blunder red). The picked row has an outline; Stockfish's best row has a ★.
- Footer line: `Confidence 0.34 · 23 options · $0.00004 · 190 ms · Jev 1.14` (from `decision`), plus `Cached` when `cache_hit`.
- For `forced` plies: "Only one legal move: no model call." For engine plies and unjudged plies: hide the panel.
- Pure helper in `viewer-model.ts`: `decisionRows(ply): Array<{san, uci, p, cpl, isPick, isBest, tone}>` with unit tests (sorting, pick/best inclusion, tones).

## 2. LiveControls (shown when `live` and the game is not terminal)

Buttons: **Pause** (`POST …/pause`) when `running`, **Resume** (`…/auto`) when `paused`/`ready`, **Step** (`…/step`) when `paused`, **Stop** (`…/stop`, confirm inline: first click turns the
button into "Confirm stop", second click sends, auto-reverts after 3 s). Reflect `game.status` from the SSE `status` events. Disabled while a request is pending.

## 3. Viewer fixes to verify (they exist; add tests)

Attached/detached following, `+N new moves` pill, `End` re-attaches, `←` detaches, `Space` toggles autoplay, graph click seeks,
`Home`/`End`, the evalbar follows the shown ply, status line uses templates only.

## 4. Playwright (`viewer.spec.ts`, mock mode, 12-ply games)

1. Replay: open a finished game; `→` ×5 shows ply 5 (move counter text); `Home` shows 0; `End` shows last; Space autoplays to the end and stops.
2. Graph click near the middle jumps to ≈ the middle ply.
3. Live: start a game with `pace_ms: 300`; while it plays, press `←` (detaches) → pill `+N` appears and grows; click the pill → follows live.
4. Pause/Resume/Stop buttons change the status and the game stops (check `GET /api/games/:id`).
5. DecisionPanel: open it on a model ply, rows sum ≤ 100 %, the picked row is marked, a ★ exists.
6. 400 px screenshot of the Viewer saved to `apps/web/e2e/__screens__/viewer-400.png` (not asserted; for Autumn to look at).

## Acceptance

`pnpm verify` + `pnpm e2e` green. Commit: `Add decision panel and live controls to the viewer`.
