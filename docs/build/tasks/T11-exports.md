# T11 — Exports (PGN, JSON, CSV)

## Endpoints (read-only; exist in public mode)
| Route | Content-Type | Body |
| --- | --- | --- |
| `GET /api/games/:id/pgn` | `text/plain; charset=utf-8` | PGN |
| `GET /api/series/:id/export.json` | `application/json` | the full `Series` object |
| `GET /api/series/:id/export.csv` | `text/csv` | one row per game |
| `GET /api/leaderboard/export.csv` | `text/csv` | one row per arm |

## PGN (`packages/core/src/pgn.ts`, pure)
Tags in order: `Event "ChessDecide"`, `Site "local"` (`"chessdecide"` when public), `Date "YYYY.MM.DD"` (from `created_at`), `Round "-"`, `White`, `Black` (player labels), `Result`,
`Termination` (our termination string), `SetUp "1"` + `FEN` when `start_fen` is not the standard start, `Model`, `Arm`, `Level` (ladder level id and Elo when relevant), `CostUSD`.
Movetext: SAN with move numbers; after each ply a comment `{[%eval 0.23] p=0.31}`: eval in pawns from White POV (`white_eval_cp/100`, two decimals; ±10.00 for clamped), `p=` the model's `p_pick` (omit for engine/forced plies).
Annotation glyph after the SAN for judged model plies: `?!` inaccuracy, `?` mistake, `??` blunder. Line-wrap at 80 columns. Ends with the result token.
Tests: replaying the PGN with `chess.js` `loadPgn` reaches the game's final FEN and the same number of plies; tags present; comments parse; a forced move has no `p=`; a game from a custom FEN includes `SetUp`/`FEN`.

## CSV
Series CSV header exactly: `index,block,level_id,level_elo,model_color,result,model_score,termination,adjudicated,plies,acpl,cost_usd,game_id`. Leaderboard CSV header:
`arm_id,model,arm,series_id,status,games,elo_mean,elo_lo,elo_hi,w,d,l,score_pct,acpl,acceptable_rate,blunder_rate,cost_usd`. RFC 4180 quoting; `\n` newlines; empty field for null.
Test: parse the series CSV, rebuild `RatedGame[]` from `level_elo` and `model_score`, run `estimate` and assert it equals the `Series.elo` within ±0.5.

## UI
Viewer: "Download PGN" link. Series detail: "Download JSON / CSV". Leaderboard: "Download CSV". Plain `<a href download>`-style links (note: in this repo they are normal links to the API; no scripting).

## Acceptance
`pnpm verify` green. Commit: `Add PGN, JSON and CSV exports`.
