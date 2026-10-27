# T10 — Publish results and deploy the read-only site

**Goal:** `pnpm cli publish` copies finished work from local D1 to a remote D1, and the SvelteKit site on Cloudflare Workers serves it read-only.
The key, raw request/response bodies and any control surface are never published.

## 1. SQL generator (`packages/runner/src/publish.ts`)
`pnpm cli publish [--out data/publish/<ts>.sql] [--series <id>...] [--all-games] [--dry-run] [--remote]`

- Select: series with status `finished`, `stopped_budget`, `stopped_error` (or the listed ids), all their games and plies, the `ladder_levels` rows for the ladder versions they used, and (with `--all-games`)
  other `finished` games not in a series. **Never** `attempts`, `oracle_moves`, `settings`, `models_snapshot`, `ladder_games`.
- Output one SQL file of `INSERT OR REPLACE INTO <table> (cols) VALUES (...);` in this order: `ladder_levels`, `series`, `games`, `plies`. Literals: strings quoted with `'` doubled, numbers
  as-is, `NULL`, booleans as 0/1. In `plies` set `attempt_id` to `NULL`. In `games` keep `config_json` but **strip** anything not needed (it contains no key; assert that).
  Chunk to files of ≤ 2 MB (`…-001.sql`, …); keep each statement under 100 KB (D1 limit) — if a single row exceeds it, fail with a clear error.
- `--dry-run` prints counts per table and total bytes and writes nothing. Without `--remote` only write the files.
- `--remote` runs, per file: `pnpm --filter @chessdecide/web exec wrangler d1 execute DB --remote --file <file>` (uses Autumn's `wrangler login`; no tokens in this repo) and prints the result;
  it refuses to run if `apps/web/wrangler.jsonc` still has `database_id: "local-dev"`.
- Idempotent: running it twice yields identical remote counts.

## 2. Tests (local D1 pair; no network)
Create two temp local D1s (as in `packages/db/test/store.test.ts`). Seed one with a finished series (3 games, plies, attempts rows with a fake key-looking string in `request_gz`).
Generate the SQL, execute it into the second via `DB.exec` per statement; assert: row counts match for series/games/plies/ladder_levels; **no** attempts table rows; no string containing `sk-or-`;
`plies.attempt_id` null; a game whose JSON contains an apostrophe round-trips; running twice leaves counts unchanged; `loadGame` on the target equals the source (ignoring `attempt_id`).
Dry-run writes no files.

## 3. Deploy runbook (`docs/DEPLOY.md`, you write it)
Exact commands for Autumn, in order, each with what to expect:
1. `pnpm --filter @chessdecide/web exec wrangler login`
2. `pnpm --filter @chessdecide/web exec wrangler d1 create chessdecide` → copy the printed `database_id` into `apps/web/wrangler.jsonc` (`d1_databases[0].database_id`). Keep the local dev value
   out of production by using a `env.production` block or a separate `wrangler.production.jsonc` (choose the latter; document `--config`).
3. `pnpm --filter @chessdecide/web exec wrangler d1 migrations apply DB --remote --config wrangler.production.jsonc`
4. Add `"vars": { "CHESSDECIDE_MODE": "public" }` in the production config.
5. `pnpm --filter @chessdecide/web build` then `pnpm --filter @chessdecide/web exec wrangler deploy --config wrangler.production.jsonc`
6. `pnpm cli publish --remote`
7. Open the workers.dev URL; check `/api/health` reports `mode: public, control: false`, `/series`, `/`, and a game replay.
Free-tier note (checked 2026-10-27): the site only reads D1 (500 MB, 50 queries per request): keep every API route to ≤ 10 queries (list endpoints use one query; the series builder uses ≤ 5 — add a test
that counts queries via a wrapper around `DB.prepare`).

## 4. STOP (credentials)
Do steps 1–2 of the runbook only with Autumn present: AskUserQuestion "Ready to deploy the public site? This needs `wrangler login` on your machine and creates a D1 database named chessdecide in your account."
Options: **Yes, walk me through** / **Not yet**. Do not run any `--remote` command without a yes.

## Acceptance
`pnpm verify` green; `pnpm build` green; with Autumn's yes: site deployed, `publish --remote` run twice with identical counts, public replay works on a phone. Commit: `Add publish command and deploy runbook`.
