# ChessDecide — UI spec

The mockups in `docs/mockups/` are the visual reference. **Start with `simple.html`**: the
phone-friendly target for v1 (board, transport, eval bar, tappable eval graph, plain one-line
status, stats; plus a simple Ratings tab). `index.html` and its pages show the older, denser
screens that arrive after v1's core works. Where this doc and a mockup disagree, this doc wins;
copy tokens from `mockups/app.css` rather than eyeballing.
Stack: SvelteKit (Svelte 5 runes, TypeScript strict, `adapter-cloudflare`), `chessground@9.2.1`,
**plain CSS with custom properties. No Tailwind, no UI framework, no chart library**; charts are
small hand-written SVG components. Layouts must work at **400 px width** first (Autumn reads on a
phone), then scale up.

**v1 scope for the UI:** the Viewer (replay + live) and Games list come first; Series and
leaderboard screens follow once the go/no-go passes. The deployed site is **read-only** (no New
game/New series buttons, no spend meter); local mode shows the controls. **No generated
commentary**: the one-line status under the board uses fixed templates over Judge numbers.

## 1. Principles

1. **Lichess-dark, calm, dense.** Brown board, cburnett pieces, `#161512` page, flat panels with
   4 px radius, one green accent. Information over decoration.
2. **A rating never appears without its uncertainty.** Elo is always `mean ± half-width` with
   the 95 % interval available; overlapping arms are never ranked.
3. **Money is always visible.** Header spend meter; every paid action shows an estimate first.
4. **One Viewer.** Live follow and playback are the same component (`attached` vs `detached`).
5. **Honest empty/error states.** Every async surface has loading, empty, error, retrying.
6. **Sample/simulated data is always labelled** (mockups only; the real app shows real data).

## 2. Design tokens (CSS custom properties)

```css
--bg:#161512; --bg-deep:#100f0d; --panel:#262421; --panel-2:#2e2b27; --panel-3:#383430;
--line:#3b3834; --text:#bababa; --text-hi:#ececec; --text-dim:#8a8681; --text-faint:#625f5a;
--green:#629924; --green-hi:#7fb82e; --blue:#3692e7; --orange:#e69d00; --red:#db3031;
--inacc:#56b4e9; --gold:#d8b04a; --radius:4px;
--font: "Noto Sans", system-ui, sans-serif; --mono: "Roboto Mono", ui-monospace, monospace;
--board: clamp(340px, min(calc(100vh - 372px), 46vw), 660px);
```

- Numbers (evals, probabilities, tokens, money) use `--mono` with tabular numerals.
- Move quality colours: acceptable = green, ≤5 pp = slate `#6d8794`, inaccuracy `#56b4e9`,
  mistake `#e69d00`, blunder `#db3031`. Annotation glyphs `?!`, `?`, `??` follow the same colours.
- Arm colours: Jev clean `#3692e7`, Jev hinted `#8cc4f5`, D1 clean `#e69d00`, D1 hinted `#f2cf6b`
  (used in leaderboard bars, axis, legends). Colour is never the only signal (labels, glyphs).
- Board: `chessground.base.css`, `chessground.brown.css`, `chessground.cburnett.css`
  (copy to `web/src/lib/chessground/`). Last-move highlight `rgba(155,199,0,.41)`.
  Arrow brush `best` = `#7fb82e`, width 10.

## 3. App shell

```
┌ ♞ ChessDecide   Series  Games     ● OpenRouter ● Stockfish   Session $0.0031 ▬ cap $1.00   [New game] [New series] ┐
```

- Top bar 52 px, sticky. Nav: **Series**, **Games**. Right side: status chips (green/amber/red
  dot; amber = degraded, e.g. catalog stale; red = missing key / engine absent), the spend chip
  (session total, meter vs the *active run's* cap), `New game` (secondary), `New series` (primary).
- Routes: `/` → `/series`; `/series`; `/series/[id]`; `/games`; `/games/[id]` (Viewer).
  `/games/[id]` highlights **Games** in the nav.
- Page container max 1640 px (Viewer) / 1300 px (lists), 18 px padding.

## 4. Screens

### 4.1 Series list (`series-list.html`)

1. Notice strip if the ladder is uncalibrated.
2. **Ladder axis card**: horizontal Elo axis 0–3000 with ladder level ticks (labels `250 random`,
   `1150 ε.15`, `1500 SF 1500`, …) and one CI bar per arm (95 % interval, white tick = mean, label
   at right end). This is the hero graphic: "where do the models sit?"
3. **Leaderboard table**: arm, Elo, interval, games, W-D-L, score %, ACPL, acceptable %, blunders %,
   cost, *Separated from* (arms whose intervals do not overlap). Rows link to the series.
   A reference row for the random mover. Footer hint lists overlapping pairs with the overlap in
   Elo and buttons "Extend both to completion".
4. **All series** table (status, size, when, Elo ± , games, cost) + `New series`.

### 4.2 Series detail (`series.html`)

Top row (3 cards):

- **Elo** — `1,082 ± 131` (52 px mono), interval text, and the ladder axis (same component as
  4.1, single arm, an amber "playing now" marker above the current opponent's level).
- **Record** — score %, stacked W/D/L bar (green/grey/red), as-White / as-Black score,
  adjudicated count, average plies.
- **Progress & budget** — `n / total games` (or `n / ~60` for completion), block + current
  opponent, spent, cap, per-game cost, time left, cap meter.

Body (2 columns): left = **Elo-over-games chart** (mean line, 95 % band, block boundaries,
amber dots for opponent level), **Blocks table** (opponent, score, W-D-L, estimate after),
**"Why this rating?"** stat grid (ACPL, acceptable %, blunder %, P(acceptable), Brier·ECE,
latency, tokens, cost/game). Right = **Live games** (two mini boards, 1:1, no coordinates,
captioned `Game 14 · W vs SF 1500 · ply 33`; click opens the Viewer attached to that game)
and the **Games table** (newest first, result glyph, `adj` badge, row opens Viewer).

Controls: `Pause/Resume`, `Stop` (rating stands), `Continue to completion` (finished Quick/
Standard), `Raise cap & continue` (budget stop). States: running, paused, finished/converged,
stopped (budget), stopped (error), aborted.

### 4.3 Games list (`games.html`)

Filter chips (All / Single / Series / Running) + model/arm selectors; table with eval
sparkline (120×26 SVG, win-probability scaled), result, plies, ACPL, mistakes·blunders, cost,
series link. Row → Viewer (`?live` if running).

### 4.4 Viewer (`play.html`) — the playback centrepiece

Three columns (≥1280 px): **board column** | **moves/table card** | **decision card**.

**Board column** (top → bottom): state banners (retry/error/budget), opponent player bar,
`[eval bar | board]`, own player bar, game-control strip (live only: status, Pause/Auto, Step,
Stop), transport controls, "pause on mistakes" toggle, evaluation graph.

- *Player bar*: avatar tile (`J` / `D1` / `SF`), name, subtitle (`Decision model · arm clean` or
  `Ladder level uci1500 · Stockfish 19`), right side live stats (cost, avg latency; ladder Elo,
  ms/move), "asking model… 0.8 s" spinner while a call is in flight, green left edge on the side
  to move when attached to a live game.
- *Eval bar* (24 px): White share = win probability of the White-POV eval
  (`50 + 50·(2/(1+e^(−0.00368208·cp)) − 1)`), number at the leading side; dims while the judge is
  pending for the current ply.
- *Transport*: `⏮ ◀ ▶/❚❚ ▶ ⏭`, speed segmented control (0.5×, 1×, 2×, 4×), pill
  (`REPLAY` / `● LIVE` / `Jump to live (+N)`), best-move arrow toggle, flip.
- *Eval graph*: 600×96 viewBox, win-probability scaled, white fill under the curve, dashed midline,
  coloured dots at mistakes (amber) and blunders (red), green cursor at the current ply, hover
  tooltip (`12. Nxe5 +0.45`), click/drag scrubs.

**Moves card**: game header (title, subtitle), tabs **Moves | Decisions table**, summary grid
(ACPL, acceptable %, mistakes·blunders, cost, avg latency, model calls). Move list is a 3-column
grid (number, White, Black); each cell shows SAN, annotation (`?!` `?` `??`) once judged, and a dot
(green = model move, grey = engine). The selected move scrolls into view **inside the list only**
(never scrolls the page). Pending live move shows a spinner cell. Table tab rows: ply, move,
P(pick), CPL, win loss, class pill, ms, $; row click selects.

**Decision card** (for the selected ply):
- *Model ply*: header (`Decision · ply 23`, `35 legal moves`), model name + arm chip, big pick
  SAN with verdict (`Matches Stockfish ★`, `Acceptable · −1.3 pp`, `Mistake · −12.4 pp`,
  `judging…`), **probability bars** (top 8 by P, plus the pick if outside; picked row outlined with
  `◂ pick`, Stockfish best marked ★; bar colour by win loss; win loss printed inside each bar;
  "+ N other moves x.x %" row), colour legend, 8-cell metric grid (P(pick), confidence,
  P(acceptable), Stockfish best, CPL, latency, input tokens, cost), actions (`Copy request`,
  `Copy FEN`, `Raw response`).
- *Engine ply*: opponent explanation + SF best + win loss.
- *No ply selected*: start-position hint.

**Board arrows**: one green arrow = Stockfish's best move *for the move just played* when it
differs from the played move (chess.com-style; origin square may be vacated). Toggle `A`.

### 4.5 New series / New game dialog

Tabs **Series (Elo rating)** | **Single game**. Shared: model select (roster first, "More models"
with prices; unusable models disabled with the reason inline), arm segmented control with a one-line
explanation, budget cap.
- Series: size cards **Quick · 25** (default) / **Standard · 50** / **To completion** (shows the target
  half-width input, default 75 Elo, "or when the budget cap is hit"), ladder mode (Adaptive default |
  Fixed level + select), explanatory text.
- Game: side (White/Black/Random), opponent level select, opening (Start position | Random 4 plies),
  pace select.
- Estimate box: **typical** and **worst case** cost + calls; turns red and disables Start when the
  *typical* estimate exceeds the cap; if only the worst case does, shows
  "typical under cap · worst case would stop at $X". Footer line: wall-clock estimate, adjudication
  note, "Stockfish is free".

## 5. Component inventory (Svelte)

| Component | Props / contract |
| --- | --- |
| `Board.svelte` | wraps chessground; props `fen`, `orientation`, `lastMove`, `check`, `shapes`, `viewOnly`, `coordinates`; imperative `set()` inside `$effect`; owns no rules |
| `EvalBar.svelte` | `cp` (White POV), `pending`, `flipped` |
| `EvalGraph.svelte` | `points: {cp, class?}[]`, `cursor`, `total`, `onSeek(i)`; SVG; hover tooltip |
| `PlayerBar.svelte` | `player`, `stats`, `thinking`, `toMove` |
| `Transport.svelte` | `playing`, `speed`, `mode: 'replay'\|'live'`, `attached`, `unread`, events |
| `MoveList.svelte` | `plies`, `cursor`, `onSelect`, `judged[]` |
| `DecisionPanel.svelte` | `ply`, `judged`; renders bars + metric grid |
| `ProbBars.svelte` | `options`, `picked`, `best`, `judged` |
| `Viewer.svelte` | composes the above; props `gameId`; owns `ViewerState` (below) |
| `LadderAxis.svelte` | `levels`, `arms: {label,color,mean,lo,hi}[]`, `playing?` |
| `EloChart.svelte` | `history`, `blocks`, `target?` |
| `WdlBar.svelte`, `Sparkline.svelte`, `Meter.svelte`, `Chip.svelte`, `Banner.svelte`, `Toast.svelte` | small presentational pieces |
| `NewRunDialog.svelte` | the dialog in 4.5; calls `/api/estimate` (debounced 200 ms) |
| `SpendChip.svelte` | polls `/api/spend` + listens to SSE `spend` |

Stores (`$state` classes in `web/src/lib/stores/`): `game.svelte.ts` (SSE client, snapshot +
event reducer, reconnect with `Last-Event-ID`), `series.svelte.ts`, `catalog.svelte.ts`,
`spend.svelte.ts`, `settings.svelte.ts` (speed, arrow, pause-on-mistake, flipped — persisted in
`localStorage`).

## 6. Viewer behaviour (state machine)

```
ViewerState { cur: number /*0..total*/, total, mode: 'live'|'replay', attached: boolean,
              playing: boolean, speed: 0.5|1|2|4, unread: number, flip, showBest, pauseOnMistake }
```

- `cur` is the number of plies applied; `cur=0` is the start position.
- **Replay play loop**: every `950 ms / speed` advance one ply; stop at `total`; if
  `pauseOnMistake` and the new ply is a model mistake/blunder, stop and toast "Paused on blunder: Nf3".
  Pressing play at `total` restarts from 0.
- **Live**: `mode='live'`. New plies from SSE increment `total`. If `attached`, `cur` follows; if not,
  `unread++` and the pill reads `Jump to live (+N)`. Any manual navigation away from the head sets
  `attached=false`; `⏭`, `End` or the pill re-attach. Transport buttons **navigate history**; the
  separate game-control strip controls the game (Pause/Auto, Step, Stop) — the two never share a button.
- A ply whose `judge` is null renders with a pending style (dimmed eval bar, grey move dot, skeleton
  chips, "judging…"); when `judged` arrives it fills in place, no layout shift.
- Eval graph holds the last judged value across pending plies.
- Board animation 220 ms; `prefers-reduced-motion` disables animation and pulses.

### Keyboard

`←` `→` step · `Home` `End` first/last (End re-attaches) · `Space` play/pause (replay) or
Auto/Pause (live) · `F` flip · `A` best-move arrow · `[` `]` speed · `Esc` closes dialogs. Ignored
while an input/select/textarea is focused or a dialog is open.

## 7. States (every surface)

| Surface | Loading | Empty | Error / degraded |
| --- | --- | --- | --- |
| Viewer | skeleton bars/board while snapshot loads | `/games/[bad id]` → "Game not found" | amber banner (429 retry with countdown + Cancel); red banner "Paused at ply 22 — upstream 502 after 3 attempts" with Step / Resume; amber budget banner with new-cap input; SSE reconnect indicator in the chip row |
| Series detail | skeleton cards | — | "Stopped · budget cap" with Raise cap; "Stopped · error" with last error + Resume; aborted games listed but struck through and excluded |
| Series list | skeleton rows | "No series yet — start one (a Quick series costs about $0.10)" | ladder uncalibrated notice |
| Games | skeleton rows | "No games yet" with both New buttons | — |
| App | — | **No API key**: full-page explainer with the env var, mock-mode hint | red chip; all paid buttons disabled with tooltip; Stockfish missing → red chip, game/series disabled |

All error text states what happened, what is saved, and what the user can do.

## 8. Responsive and accessibility

- ≥1280: three columns. 860–1279: board + moves; decision card below, full width. <860: single column,
  `--board: min(94vw, 560px)`, header chips hidden, dialogs full-screen.
- Contrast ≥ 4.5:1 for text on panels; focus rings 2 px `--blue`; all icon buttons have `aria-label`
  and `title`; arrows/annotations are never colour-only (`?!`/`?`/`??` glyphs, ★ for best move).
- Live regions: spinner/banners use `aria-live="polite"`; the new move announces as
  "White plays Nf3" only when attached to live.
- Board squares are not tab stops (view-only); the move list is a roving-tabindex list.

## 9. Copy rules

- Say "Elo on the ChessDecide ladder", never plain "Elo", wherever a number is introduced.
- Say "not separable yet" instead of "tie" for overlapping intervals.
- Money: 4 decimals under $1 (`$0.0031`), 2 decimals at/above (`$1.20`). Percentages: 0 decimals in
  tables, 1 decimal for probabilities. Win loss in "pp".
- Never claim causation from small samples; secondary stats show `n`.

## 10. Build notes for the implementer

- Start from the mockups: port `app.css` to `web/src/app.css` unchanged, then componentise.
- `chessground.min.js` in the mockups is the stock 9.2.1 build patched to a global; the app imports
  `import { Chessground } from 'chessground'` normally.
- Develop against `CHESSDECIDE_MOCK=1` (mock provider + fast fake engine) so UI work never spends.
