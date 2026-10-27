# Contracts (what must stay true)

Source of truth for types is the code: `packages/core/src/types.ts` (domain), `ports.ts` (I/O ports),
`series.ts`, `oracle.ts`. `../API.md` §2 mirrors them for HTTP. **Changing a type = change the code, `API.md`,
and add a CHANGELOG line in the same commit. Breaking changes need a question to Autumn.**

## 1. One ply, in order (`stepGame`)

1. Terminal game → return unchanged.
2. One legal move and a model to move → play it, no call, `forced:true`. Otherwise (model only) ask the
   budget port; `ok:false` → status `stopped_budget`, no ply.
3. Emit `thinking`; call the player. A thrown error → emit `error`, status `paused` (reason `error: …`), no ply.
   An illegal move → same.
4. Apply the move, **save the ply** (judge/eval null), emit `ply`.
5. Judge: model plies get the full oracle (`judge` + `eval` from the oracle row); engine plies get one search
   (`eval` only, `judge = null`); terminal positions need no search.
6. **Save the ply again** (now judged), emit `judged`.
7. Decide result (rules, then adjudication, then `max_plies`), save the game, emit `spend` (if cost > 0) and
   `status` (if it changed).

Event names: `snapshot, thinking, ply, judged, spend, status, error`. SSE `data` is the JSON of the payload
in `ports.ts` (`GameEvent`).

## 2. Ports (all adapters implement these; the core imports none)

`Player.move(ctx) → {uci, decision?, probs?, engine_info?, cost_usd?}` · `JudgePort.oracle(fen, depth)` and
`evalPosition(fen, depth)` · `GameStore.saveGame/savePly` · `EventSink.emit` · `BudgetPort.check(game)` ·
`Engine.search(req)` (packages/engine) · `AttemptSink.record/findCached` (packages/providers).

## 3. Status machine

```
ready → running ⇄ paused → …
running → finished | aborted | stopped_budget (resumable) | paused (error, restart)
```
`step` leaves a game `paused`; `auto` sets `running`; `pause` finishes the in-flight ply; `stop` aborts (terminal).
On daemon start-up games left `running` become `paused` with reason `server_restart`.

## 4. Persistence mapping (packages/db/src/store.ts)

| Domain | Column |
| --- | --- |
| `Game.config` | `games.config_json` (+ `white_player`, `black_player` JSON) |
| `Ply.decision / engine_info / eval / judge` | `plies.decision_json / engine_json / eval_json / judge_json` |
| `Ply.forced` | `plies.forced` (0/1) |
| attempts | one row per HTTP call; cache hits too (`cache_hit=1`, cost 0); `retry_of` links retries |
| spend | `SUM(cost_usd) WHERE cache_hit=0` |

## 5. API surface (additive to what exists)

Exists: `GET /api/health`, `GET /api/games`, `GET /api/games/:id`, `GET /api/games/:id/events`,
`POST /api/games`, `POST /api/games/:id/{auto,pause,step,stop}`.
Added by tasks: `GET /api/models`, `POST /api/estimate`, `GET /api/spend`, `GET /api/ladder` (T01);
series routes (T06); `GET /api/leaderboard` (T09); exports (T11).
Public (read-only) mode exposes only `GET` routes that read D1.
