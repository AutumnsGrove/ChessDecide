# ChessDecide — Architecture (v4, TypeScript, Cloudflare-ready)

Supersedes the Go architecture in earlier drafts. Decided 2026-10-27 with Autumn:

- **TypeScript everywhere**, SvelteKit frontend, raw CSS (**no Tailwind**), **pnpm for everything**
  (no npm, no yarn, no Bun).
- **SQLite via Drizzle**, so the same schema runs locally and on **Cloudflare D1**.
- **Run locally first, publish results**, then run live on Cloudflare, then scale out. Moving
  between phases means swapping adapters, not rewriting the core.
- **Engines are adapters.** Stockfish is the default; any UCI engine can be plugged in.

## 1. Principles

1. **The core is pure.** Chess rules, prompt builders, response parsers, Elo math, ladder
   recipes and the game step function use no Node-only APIs and no I/O. They run unchanged in
   Node, Workers and the browser.
2. **I/O sits behind ports** (TypeScript interfaces). Each runtime supplies adapters.
3. **A game advances one step at a time.** `stepGame(state, ports) → state'` plays exactly one
   ply. A local loop calls it repeatedly; a Durable Object calls it once per alarm. This is
   what makes phase 2 cheap.
4. **Everything that costs money goes through one budgeted client**, with a ledger and a cap.

## 2. Ports and adapters

| Port | Responsibility | Phase 1 (local) | Phase 2 (live on Cloudflare) | Phase 3 (scale) |
| --- | --- | --- | --- | --- |
| `Engine` | UCI search: best move, eval, WDL, multi-PV | `NativeUciEngine` (spawn `stockfish`) | `HttpEngine` → Stockfish in a Cloudflare Container (or any server) | pool of containers / several hosts |
| `MoveProvider` | pick a move for a position | `DecisionsProvider` (OpenRouter), `MockProvider` | same | same + per-model rate limiters |
| `Store` | persist games, plies, attempts, series | Drizzle + local D1/SQLite | Drizzle + D1 binding | D1 (+ R2 for raw logs) |
| `Scheduler` | run the next step | in-process loop | Durable Object alarm | Queues / Workflows fan out games to Durable Objects |
| `EventSink` | push live updates to viewers | in-memory SSE hub | Durable Object WebSocket/SSE | same |
| `Secrets` | OpenRouter key | `.env` | Worker secret | Worker secret |

```ts
interface Engine {
  search(req: {
    fen: string; depth?: number; movetimeMs?: number; multipv?: number;
    options?: Record<string, string | number | boolean>;   // e.g. UCI_LimitStrength, UCI_Elo
  }): Promise<SearchResult>;    // { bestUci, lines: [{ multipv, depth, cp?, mate?, wdl?, pv }] }
  close(): Promise<void>;
}
```

Opponent levels (§ ladder in `METRICS.md`) and the judge are built **on top of** `Engine`, so
neither knows which engine it uses. `NativeUciEngine` takes a binary path and an options map, so
any UCI engine (Lc0, Komodo, Maia, …) can be added as a config entry. Opponent engines are
named `{ engineId, level }` in game rows so results stay comparable per engine.

## 3. Repository layout

```
package.json  pnpm-workspace.yaml   pnpm workspaces (pnpm only)
packages/core/                pure TS: chess (chess.js wrapper), descriptors, prompts, parsers,
                              elo, ladder recipes, oracle math, stepGame, mock heuristics
packages/engine/              Engine port; adapters: native-uci, http (wasm: optional spike)
packages/providers/           DecisionsProvider (OpenRouter client, retry, limiter, cache), MockProvider
packages/db/                  Drizzle schema + migrations (SQLite dialect), Store implementation
packages/runner/              Node CLI: game, series, ladder calibrate, probe, publish
packages/api/                 Hono app `createApi({db, mode, control?, hub?})`: one API, two hosts
apps/web/                     SvelteKit (adapter-cloudflare); raw CSS; chessground; Viewer
apps/live/                    (phase 2) Worker + Durable Objects that host runs
docs/  data/  tools/          docs, local data (gitignored), python golden-fixture helpers
```

## 4. Phases

### Phase 1 — Local runs, published results (**v1**)

```
 you ──► web UI (vite dev, proxies /api) ──► runner daemon (Node, Hono API + SSE) ──► core stepGame
 you ──► runner CLI (game, series, ladder, publish) ──────────────────────────────────┘
                                   │                 ├─ Engine: native Stockfish (opponent + judge)
                                   │                 └─ MoveProvider: OpenRouter Decisions
                                   ▼
                        local D1/SQLite  ── publish ──►  remote D1 ──► public SvelteKit site (read-only)
```

- Everything that spends money or runs Stockfish happens on your machine.
- `publish` copies finished series, games, plies and the ladder file into remote D1. It never
  sends the API key, raw request/response logs or anything not needed to replay a game.
- The deployed site is **read-only**: leaderboard, series pages, game viewer. It runs on the
  free tier (reads only, no engine, no model calls).
- **Why a daemon:** SvelteKit/Wrangler run inside `workerd`, which cannot spawn Stockfish. So
  games run in a **Node runner daemon** (`chessdecide serve`, `127.0.0.1:8731`) that owns the
  engine processes and the game loops, and serves the API with **Hono**. `vite dev` proxies
  `/api` to it. The same `createApi()` (`packages/api`) is mounted by the deployed SvelteKit app
  as a **read-only** route (`src/routes/api/[...path]/+server.ts`, no `ControlPlane`), so the UI
  code talks to one API shape in every mode. Live events: SSE from the daemon's in-memory hub;
  a reconnecting client just gets a fresh `snapshot`.
- Verified in `docs/build/reference/`: runner → local D1 (`data/d1/v3`) ← web dev server, and the
  public route serving the same rows.

### Phase 2 — Live runs on Cloudflare

- A `RunDO` (SQLite-backed Durable Object) owns one series or game. It calls `stepGame`,
  stores state in its own SQLite, then schedules the next step with `ctx.storage.setAlarm`.
  Each alarm is a fresh invocation, which stays within the 50-subrequest and CPU limits.
- `Engine` becomes `HttpEngine` pointing at Stockfish in a Cloudflare Container (Workers Paid)
  or any server you run. Cloudflare Containers are **not** available on the free plan.
- The OpenRouter key is a Worker secret. Control endpoints sit behind Cloudflare Access (owner
  only) and every run keeps its hard budget cap.
- Viewers attach to the DO over SSE/WebSocket; finished runs are written to D1 for the public
  site, same schema as phase 1.

### Phase 3 — Many models, hundreds of games

- A `SchedulerDO` (or Workflows/Queues) fans games out to `RunDO`s with per-model concurrency
  caps (OpenRouter rate limits; D1 Ultra returned 429 in M0).
- Stockfish capacity scales by container count behind `HttpEngine`.
- Alternative for batch runs: the same `runner` in a Docker image on any remote box, writing to
  D1 over its HTTP API. No code changes, only adapters.

## 5. Cloudflare facts we rely on

Read from developers.cloudflare.com on 2026-10-27; **re-check before phase 2**.

| Limit | Workers Free | Workers Paid |
| --- | --- | --- |
| CPU time per invocation | 10 ms | 30 s default, up to 5 min |
| Waiting on `fetch`/DB | not counted as CPU | not counted |
| Subrequests per invocation | 50 | 10,000 |
| Memory | 128 MB | 128 MB |
| Requests | 100,000 / day | unlimited |
| Durable Objects | SQLite-backed only; 100,000 requests/day | included allowance, then metered |
| DO SQLite rows written | 100,000 / day | 50 M / month included |
| D1 size | 500 MB per DB, 5 GB per account | 10 GB per DB |
| D1 queries per invocation | 50 | 1,000 |
| Containers | not available | available (billed per active 10 ms) |

Consequences:

- Free tier is fine for the read-only site and even for DO-hosted runs, **except** Stockfish:
  10 ms CPU rules out in-Worker analysis, and Containers need the paid plan. Free-tier live
  runs would need Stockfish on a server elsewhere.
- WebAssembly threads are not available in Workers; a single-thread WASM Stockfish may run on the
  paid plan (5-minute CPU) but is **unverified**. It stays an optional adapter spike.
- One game is ~30 model calls plus engine and DB calls, which exceeds 50 subrequests in a single
  invocation, hence one step per alarm in phase 2.

## 6. Data and storage

- Schema in `API.md` §4 is the canonical SQL; `packages/db` expresses it in Drizzle
  (`sqlite-core`). Migrations are generated by `drizzle-kit` and applied to local and remote D1
  by the same files.
- **Preferred local setup:** the runner and `wrangler dev` both use a local D1 via wrangler's
  `getPlatformProxy()`, so there is one data path. **Fallback:** `better-sqlite3` behind the same
  Drizzle schema. Spike S1 passed, so the D1 path is the choice.
- Raw request/response bodies (`request_gz`/`response_gz` in earlier drafts) are stored **locally
  only** and are not published. In phase 2+ they go to R2.
- D1 rows are limited to 2 MB and 100 columns; per-ply decision JSON stays well below that.

## 7. Frontend

SvelteKit (Svelte 5 runes, TypeScript strict), `adapter-cloudflare`, `chessground@9.2.1`,
**plain CSS custom properties** (tokens in `UI.md`), hand-written SVG charts. No Tailwind, no UI
kit, no chart library. The UI is a client-rendered SPA (`ssr = false`) over `/api`. In the deployed
read-only build `/api` is the Hono app mounted in a SvelteKit route reading D1; in local dev it is
the runner daemon. SvelteKit 3 notes: no `svelte.config.js` (pass options to `sveltekit()` in
`vite.config.ts`), `$lib` is replaced by `#lib/*` (`package.json` `imports`), bindings come from
`import { env } from 'cloudflare:workers'`, and TypeScript must be **6.0.3** (7.x breaks Kit).

## 8. Image arm (optional)

The board is rendered server-side from the position to **SVG**, rasterised to **PNG** with
`@resvg/resvg-js` locally (`@resvg/resvg-wasm` in Workers), using the same cburnett piece set as
the viewer. It is sent as an image part of the Decisions request with the **same bare text
options** as `clean`, and **no FEN**, so the picture is the only description of the position
(`PROMPTS.md` §12). Spike S2 confirms how the Decisions API accepts images.

## 9. Open spikes (cheap, before building the dependent part)

| # | Question | Cost |
| --- | --- | --- |
| S1 | **Done, pass** (`SPIKE.md` §8): local D1 via `getPlatformProxy()` + Drizzle works from Node; 10k rows in 6.5 s batched; shared across processes by the `persist` path. | $0 |
| S2 | How does `/api/alpha/decisions` accept an image (content-part shape, size limits, PNG vs JPEG)? Do Jev/D1 Ultra pick sensibly from a board image? | ≈ $0.01 |
| S3 | (optional) Does a single-thread WASM Stockfish fit and run in a Worker on the paid plan? | $0 |
