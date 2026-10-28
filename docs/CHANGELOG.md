# Changelog

## T00 — Install foundation

- Copied `docs/build/reference/` to the repo root; merged `.gitignore` (kept root lines, added node/svelte/wrangler/log).
- `pnpm install --frozen-lockfile`, `pnpm db:migrate` and `pnpm verify` are green on Node 26.7.0, pnpm 10.28.0, Stockfish 19.
- Tests: core 53 (1 skipped), providers 11, db 2, engine 6, api 4, runner 3, web 5.
- Mock smoke game: 20 plies, 1/2-1/2 max_plies, reloaded from D1.
