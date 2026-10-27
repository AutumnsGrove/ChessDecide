# T12 — Image arm (optional, separate arm)

**Goal:** `arm: "image"` works end to end: board PNG + bare options (no FEN). Reported as its own arm. Request format is in `PROMPTS.md` §12 and is **verified live** (`SPIKE.md` §9).
The builder (`build()` with `arm.interface === 'image'`) already exists; you add the renderer and wiring.

## 1. `packages/render` (new, pnpm package `@chessdecide/render`)
- Dependency `@resvg/resvg-js` 2.6.2. Exports: `boardSvg(fen, size = 512): string`, `boardPng(fen, size = 512): Uint8Array`, `boardDataUrl(fen): string` (`data:image/png;base64,…`).
- Start from `spikes/s2-image/render.ts` (verified output) but **do not read CSS at runtime**: add `scripts/extract-pieces.ts` that reads
  `chessground/assets/chessground.cburnett.css`, decodes the 12 piece SVGs and writes `src/pieces.ts` (committed, generated; header comment says so).
- Fixed look (D30): squares `#f0d9b5` / `#b58863`, White at the bottom, coordinates (file letters bottom row, rank numbers left column), **no** last-move highlight, no check highlight, no arrows.
- Deterministic: same FEN → identical SVG text and identical PNG bytes (pin `fitTo` width, no timestamps).
- Tests: SVG snapshot for the start position and for the Italian-game FEN in `PROMPTS.md` §7; PNG decodes to 512×512 (read the PNG header); `sha256(png)` of the start position is pinned in the test
  (compute once, commit the value, with a comment on how to regenerate); size < 300 KB; a position with a promoted queen renders; FEN with black to move still has White at the bottom.

## 2. Wiring
- `packages/runner/src/runtime.ts`: pass `renderImage: async (fen) => boardDataUrl(fen)` to `ModelPlayer`; remove the "arrives in T12" `ApiError`.
- Estimate: image adds 600 input tokens per call (already in T01's `estimateGame`; add a test).
- UI: enable the **Image** option in New game / New series dialogs with a one-line caveat: "Sends a picture of the board instead of text positions. Jev switches to a slower mode for images."
- Leaderboard/series chips show `image`. The `attempts.interface` column is `'image'`.

## 3. Live check (skipped unless `LIVE=1`)
`packages/runner/test/image.live.test.ts`: one call each to `typesafe/jev-1.14` and `liquid/d1-ultra` at the start position with the image arm; assert HTTP 200, a legal pick, record tokens and cost
(≈ $0.0001). **Autumn runs this with her key.**

## 4. Report
After one real image-arm game (cap $0.05, ask first), append a short section to `docs/SPIKE.md` §9: result, cost per game vs the clean arm, latency vs clean.

## Acceptance
`pnpm verify` green; mock-mode game with arm `image` works (mock ignores the image but the request builder runs in a unit test). Commit: `Add image arm and board renderer`.
