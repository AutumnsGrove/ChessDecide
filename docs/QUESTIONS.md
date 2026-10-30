# Questions and decisions

- T00: moved the daemon from 8787 to 8731 and pinned Vite to 5273 (`strictPort`); Autumn's machine has the defaults busy. Reference copy in `docs/build/reference/` left pristine.
- T01: `@chessdecide/api` depends on `@chessdecide/providers` so `/api/estimate` and `/api/games` can price models from the catalog; no other package boundary moved. Mock mode still validates the model slug against the catalog (so the UI cannot start a typo) but skips the key check.
- T02: the New game "Mock model" checkbox is informational and disabled: mock mode is a daemon-wide flag (`CHESSDECIDE_MOCK=1`), so the browser cannot switch it per game. `GET /api/games` gained a `plies` count for the list rows.
- T06: added `series.concurrency` and `series.judge_depth` (migration 0002) because the series config needs them per row; Playwright now points `CHESSDECIDE_DATA` at a temp dir so the calibrated ladder does not change the header assertion.
- T10: `publish --remote` takes `--config` (resolved against `apps/web/`) because the task asks both for a bare wrangler command and for a separate `wrangler.production.jsonc`; the default stays `wrangler.jsonc` and is refused while its `database_id` is `local-dev` (the check also rejects non-UUID placeholders).
- T10: the leaderboard now batches its reads (`assembleSeries` + one games/plies query for all chosen arms) so the ≤ 10-query budget holds as arms are added; behaviour and tests are unchanged, the count is asserted in `packages/api/test/query-budget.test.ts`.
