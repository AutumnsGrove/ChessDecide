# T09 — Leaderboard

**Goal:** one screen that answers "which model/arm is stronger?" honestly. Pure maths in core, a route, and the home page.

## Files
`packages/core/src/leaderboard.ts` (+ tests), `packages/db/src/series-store.ts` (query), `packages/api/src/api.ts` (routes), `apps/web/src/routes/+page.svelte|+page.ts` (home = leaderboard; `/` no longer redirects),
`apps/web/src/lib/{LeaderboardTable,CompareBox}.svelte`, `apps/web/e2e/leaderboard.spec.ts`.

## Core (`leaderboard.ts`)
```ts
export interface ArmSeries { arm_id: string; model: string; arm: string; series_id: string; status: SeriesStatus; ladder_version: number;
  games: RatedGame[]; w: number; d: number; l: number; cost_usd: number; stats: SeriesStats }
export interface LeaderRow { arm_id; model; arm; series_id; status; games: number; elo: { mean; lo; hi; half_width }; w; d; l; score_pct;
  acpl: number|null; acceptable_rate: number|null; blunder_rate: number|null; cost_usd: number; cost_per_game: number|null; separated_from: string[] }
export function buildLeaderboard(input: ArmSeries[], ladderVersion: number): { rows: LeaderRow[]; reference: Array<{ id: string; label: string; elo: number }> }
export function compareArms(a: RatedGame[], b: RatedGame[]): { p_a_gt_b: number; diff_mean: number; diff_lo: number; diff_hi: number }
```
Rules (`METRICS.md` B6):
- One row per `arm_id`: its latest **finished** series; if none finished, its series with the most games. Only series with the requested `ladder_version`.
- `elo` from `estimate(games)`. `separated_from` = arm ids whose 95 % interval does not overlap this one (`lo/hi` strict). Rows are sorted by `elo.mean` descending **for display only**;
  the UI never draws a rank order between rows that overlap.
- `reference` = the ladder levels (random mover, ε levels, Stockfish levels) with their Elo.
- `compareArms`: `p_a_gt_b = probABeatsB(posterior(a), posterior(b))`; the difference distribution by grid convolution (difference of two independent posteriors) giving mean and 2.5/97.5 %.
Tests: two disjoint arms are `separated_from` each other; overlapping are not; latest-finished selection; ladder_version filter; `compareArms` of identical data → p ≈ 0.5, diff_mean ≈ 0; clearly different → p > 0.99.

## API
`GET /api/leaderboard?ladder_version=N` (default: the loaded ladder's version) → `{ ladder: {version, calibrated}, rows, reference }`;
`GET /api/leaderboard/compare?a=<arm_id>&b=<arm_id>` → compare object. Both are read-only and exist in public mode.

## UI (`/`)
- Notice when uncalibrated. `LadderAxis` (from T07) with every row's bar and the reference ticks.
- Table: model · arm chip · Elo `980 ±120` · W-D-L · score % · ACPL · acceptable % · blunder % · cost · games. Rows that overlap show "≈" and a hover/tap list of who they overlap with.
- "Not separable yet" caption wherever intervals overlap. A "Compare" box (two selects) showing `P(A stronger) = 83 %` and the Elo difference interval.
- Empty state: "No finished series yet" with a link to New series (local mode).

## Acceptance
`pnpm verify` + `pnpm e2e` green. Commit: `Add leaderboard`.
