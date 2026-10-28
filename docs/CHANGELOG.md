# Changelog

## T01 — Real model wiring, catalog, estimate, probe

- `packages/providers/src/catalog.ts`: cached OpenRouter Decisions catalog (public, no key); roster-first sort,
  per-million input price, `disabled_reason` for tiny contexts / no text input. Fixture copied to
  `packages/providers/test/fixtures/` (32 models).
- `packages/providers/src/estimate.ts`: typical (≤ 40 calls) and worst-case game cost, image arm +600 input
  tokens per call, both-model sides priced separately. Unknown slug throws `unknown model`.
- `packages/runner/src/runtime.ts`: real `ModelPlayer`s (one shared `DecisionsClient` and catalog per process),
  per-model rolling-mean input tokens, combined budget port for two model sides, `ApiError` for unknown model /
  missing key / image arm. Mock mode still uses `MockPlayer`.
- `packages/runner/src/config.ts`: dependency-free `.env` loader (`loadEnv`), `openRouterKey`, `isMock`.
- `packages/api`: `ApiError` + error mapping, `GET /api/models`, `POST /api/estimate`, `GET /api/spend`,
  `GET /api/ladder`, extended `GET /api/health`, and `POST /api/games` validation (ranges, unknown model,
  424 no key, 402 over cap with `detail.est_cost_usd`). Catalog failures map to 502 `upstream_error`.
  `@chessdecide/providers` added as a workspace dependency.
- `packages/db`: `meanInputTokens(db, model, arm)` — last 100 real ok attempts, `undefined` below 20.
- `packages/runner/src/cli.ts`: `probe` command (one real call, prints pick, p_pick, latency, tokens, cost,
  request bytes; exit 2 without a key) and `LIVE=1` test `probe.live.test.ts` (skipped in `pnpm verify`).
- Tests: providers 25, db 3, api 13, runner 3 (+1 live skipped); `pnpm verify` green. No test touches the network.
- Manual: live catalog returned 32 models; daemon `GET /api/models` 200, `POST /api/estimate` and
  `POST /api/games` 201; mock game via the daemon finished in 9 plies (checkmate). Probe without a key exits 2.
- Deviation: `POST /api/games` now validates the config, so the existing control/SSE test sends a valid config.

## T00 — Install foundation

- Copied `docs/build/reference/` to the repo root; merged `.gitignore` (kept root lines, added node/svelte/wrangler/log).
- `pnpm install --frozen-lockfile`, `pnpm db:migrate` and `pnpm verify` are green on Node 26.7.0, pnpm 10.28.0, Stockfish 19.
- Tests: core 53 (1 skipped), providers 11, db 2, engine 6, api 4, runner 3, web 5.
- Mock smoke game: 20 plies, 1/2-1/2 max_plies, reloaded from D1.
