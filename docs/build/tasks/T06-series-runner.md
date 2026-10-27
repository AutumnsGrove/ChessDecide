# T06 — Series runner, store, events, API

**Goal:** `POST /api/series` runs a whole series (25/50/completion games vs the ladder) and publishes live Elo updates.
Scheduling logic already exists and is tested (`nextAction`, `randomOpening`, `estimate`, `seriesStats`); you wire it to real games.

## Files

`packages/core/src/series-events.ts` (new types), `packages/api/src/hub.ts` (make generic), `packages/db/src/series-store.ts` (+ test),
`packages/runner/src/series.ts` (new `SeriesControlPlane`), `packages/runner/src/serve.ts`, `packages/api/src/api.ts` (routes + deps),
`packages/runner/test/series.test.ts`, `packages/api/test/series-api.test.ts`.

## 1. Types (`series-events.ts`) — follow `API.md` §3.3

```ts
export interface SeriesConfig { name?: string; model: string; arm: ArmName | Arm; size: SeriesSize;
  ladder: { mode: 'adaptive' } | { mode: 'fixed'; level: string }; seed?: number; budget_usd: number; concurrency?: 1 | 2; judge_depth?: number }
export type SeriesStatus = 'created'|'running'|'paused'|'finished'|'stopped_budget'|'stopped_error'|'aborted';
export interface Series { /* API.md §3.3: id,name,model,arm,status,status_reason,size,ladder_version,seed,budget_usd,cost_usd,
  games: SeriesGame[], blocks: Block[], elo: EloEstimate|null, elo_history: EloPoint[], secondary: SeriesStats, created_at } }
export type SeriesEvent =
  | { event: 'snapshot'; data: Series } | { event: 'block'; data: { index: number; level_id: string; level_elo: number } }
  | { event: 'game_started'; data: { game_id: string; index: number; block: number; level_id: string; model_color: Color } }
  | { event: 'game_finished'; data: SeriesGame } | { event: 'elo'; data: { estimate: EloEstimate; point: EloPoint } }
  | { event: 'spend'; data: { series_usd: number; cap_usd: number } } | { event: 'status'; data: { status: SeriesStatus; status_reason?: string } }
  | { event: 'error'; data: { code: string; message: string; game_id?: string } };
```
Make `EventHub<E extends { event: string; data: unknown }>` generic (`new EventHub<GameEvent>()`, `new EventHub<SeriesEvent>()`); update existing code and tests.

## 2. Store (`series-store.ts`)

`saveSeries(db, row)`, `loadSeriesRow(db, id)`, `listSeriesRows(db)`, `seriesGames(db, id): SeriesGameRec[]` (join `games`: index, block, level_id, level_elo, status mapped
`finished→finished`, `aborted→aborted`, everything else `running`, `model_score`), `setGameSeriesFields(db, gameId, {...})`. Build the API `Series` object with
`buildSeries(db, id)`: games summaries (acpl_model per game from judge rows), blocks (index, level, games, score, posterior before/after), `currentEstimate`,
`elo_history` (recompute posterior after each finished game in finish order; for ≤ 200 games this is cheap), `seriesStats` for `secondary`.
Tests: round trip; block summaries; elo_history length equals finished games; aborted excluded.

## 3. `SeriesControlPlane` (`runner/src/series.ts`)

```ts
class SeriesControlPlane {
  constructor(deps: { rt: Runtime; db: Db; hub: EventHub<SeriesEvent>; gameHub: EventHub<GameEvent>; mock: boolean;
                      ladder: () => LadderFile; makeOpponentFor?: …; judge?: JudgePort })   // injectable for tests
  create(cfg: SeriesConfig): Promise<Series>      // validates, picks seed (default Date.now()), stores, status 'created'
  start(id): Promise<void>                        // 'created'|'paused'|'stopped_budget' → 'running' (resume = same call)
  pause(id): Promise<void>                        // no new games; finish in-flight plies; in-flight games become 'paused'
  stop(id): Promise<void>                         // abort in-flight games; status 'aborted'; finished games kept
  idle(id): Promise<void>                         // for tests
}
```
Loop (`runLoop(id)`), repeated until a stop condition:
1. Load `SeriesGameRec[]`; `n = nextAction({size, levels, fixedLevelId, seed, games})`.
2. `stop` → set status: `target_reached|precision_reached|max_games` → `finished`; `too_many_aborts` → `stopped_error`. Write `finished_at`, final Elo columns
   (`elo_mean/lo/hi,w,d,l`), emit `status`. Finished series are **immutable**: `start/pause/stop` on them are no-ops returning the current row.
3. `wait` → await any in-flight game promise (Promise.race), loop.
4. `start`: if `series.cost_usd >= budget_usd` → status `stopped_budget`. Otherwise
   a. opening for `n.openingIndex`: `randomOpening(n.openingSeed, evalCp)` where `evalCp(fen)` = `judge.evalPosition(fen, judge_depth)` converted to White POV;
      cache by opening index in memory and as `games.opening_seed`; paired games (index 2k, 2k+1) reuse the same FEN.
   b. emit `block` once when `n.block` changes. Create the game row: config `{ white, black, opening:{type:'fen',fen}, pace_ms:0, budget_usd: series.budget_usd − series.cost_usd,
      judge_depth, max_plies:200, adjudicate:true, seed: subSeed(series.seed, n.index) }`, model side = `{type:'model', model, arm}`, other side = `{type:'ladder', level: n.level.id}`,
      model colour from `n.modelColor`; set `series_id, series_index, block_index, level_id, level_elo, model_color`; emit `game_started`.
   c. run it with `playToEnd` (ports from `buildPorts`, events to `gameHub`) as one of ≤ `concurrency` in-flight tasks (default and maximum 2).
5. When a game task ends:
   - `finished`: `model_score` = 1/0.5/0 from result and `model_color`; update `games`, `series.cost_usd += game.cost_usd`, `w/d/l`, recompute the estimate, append `elo_history`, emit `game_finished`, `elo`, `spend`.
   - `paused` with an `error:` reason (transport): retry from the last ply by calling `playToEnd` again, up to **3** times (D22); then mark the game `aborted`
     (`status_reason:'transport'`), emit `error` and `game_finished` (score undefined). It does not count toward the target; the loop starts a replacement game.
   - `stopped_budget`: series → `stopped_budget`, stop the loop (resumable).
6. Keep the DB the source of truth: after each state change write the series row (status, cost, elo, `elo_history_json`, `blocks_json`).
7. **Restart recovery** (`recoverSeries(db)` at daemon start): series `running → paused` (`server_restart`); their games `running → paused`. `start(id)` on a paused series first resumes every
   paused game of that series (continue `playToEnd` from its last ply) before asking `nextAction` for new ones; paused games count as in-flight (`status:'running'` in `SeriesGameRec`).

Series cap: `series.budget_usd` default 1.00. Estimate (`POST /api/estimate` accepts a `SeriesConfig` too, detected by `size` field): typical = `games × gameEstimate(typical)`,
worst = `games × worst`; for completion use `max_games` for worst and `min_games` for typical.

## 4. API (`packages/api`)

| Route | Behaviour |
| --- | --- |
| `POST /api/series` | validate (model known, size valid, budget 0.01..50, ladder level exists) → 201 `Series`; 402 if typical estimate > cap; 424 if no key (non-mock) |
| `GET /api/series` | summaries `{id,name,model,arm,status,games_done,elo?,cost_usd,created_at}` |
| `GET /api/series/:id` | full `Series` |
| `POST /api/series/:id/{start,pause,stop}` | delegate; return `{id,status,status_reason}` (`resume` is an alias of `start`) |
| `GET /api/series/:id/events` | SSE: `snapshot` then hub events |
| `GET /api/series/:id/games` | the `SeriesGame[]` |

Public mode exposes only the three `GET` series routes (no events). Each series game is an ordinary game: `GET /api/games/:id` and its SSE work unchanged.

## 5. Tests (no network, no Stockfish required)

Use an injected fake `judge` (oracle = all moves cp 0; evalPosition 0), a fake `makeOpponentFor` (random mover with a seeded rng) and `MockPlayer` for the model; judge depth irrelevant.
- Quick series completes with **exactly 25 finished games**; standard 50; custom 7; every block of 5 faces one level; the first block faces the level nearest 1200.
- Never more than 2 games in flight (track concurrency in the fake player).
- Colours alternate by index; paired openings (games 2k and 2k+1 share the FEN).
- Budget: with `budget_usd` just above the cost of ~3 games the series ends `stopped_budget`; raising the cap in the DB and calling `start` resumes without double counting.
- Aborts: a player that throws 5 times in a row → game aborted after 3 retries, excluded from `w/d/l`, replacement game started; 3 consecutive aborts → `stopped_error`.
- Pause then `start` continues; stop aborts in-flight games and keeps finished ones; a finished series ignores `start`.
- Restart recovery: create a running series in the DB, call `recoverSeries`, then `start` → completes with the right count.
- Determinism: same `seed` + same fake outcomes → identical level/colour/opening sequence.
- API tests with `app.request`: create, list, get, events (snapshot then `elo` after a game), 402/424/400 paths, public mode hides control.

## Acceptance

`pnpm verify` green. In mock mode a Quick series completes through the API in a few minutes (judge depth 6) and `GET /api/series/:id` shows an Elo with an interval.
Commit: `Add series runner, store and API`.
