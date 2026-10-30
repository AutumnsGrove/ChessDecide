# Deploy — publishing results to the read-only public site

Follow these in order. Each step says what you should see before you move on.
This needs Autumn present: steps 1–2 touch her Cloudflare account. Nothing below spends
model money; the totals are already in the local D1.

Two wrangler configs exist on purpose:

| File | Used for | `database_id` |
| --- | --- | --- |
| `apps/web/wrangler.jsonc` | `pnpm dev`, `wrangler dev`, local D1, e2e | `"local-dev"` |
| `apps/web/wrangler.production.jsonc` | `wrangler deploy`, `d1 migrations apply --remote`, `publish --remote` | the real UUID |

`pnpm cli publish --remote` refuses to run unless the config it is given holds a real
Cloudflare D1 id, so it can never write the production site's SQL into the local database.

## 1. Log in

```bash
pnpm --filter @chessdecide/web exec wrangler login
```

Expect a browser window ("Wrangler wants to access your Cloudflare account") and, after
authorising, `Successfully logged in`. Check with `wrangler whoami` if unsure.

## 2. Create the production D1 database

```bash
pnpm --filter @chessdecide/web exec wrangler d1 create chessdecide
```

Expect a block like:

```
✅ Successfully created DB 'chessdecide' in region WEUR
[[d1_databases]]
binding = "DB"
database_name = "chessdecide"
database_id = "3f2a…-…-…-…-…"
```

Copy the printed `database_id` (a UUID) into `apps/web/wrangler.production.jsonc`:
replace `REPLACE_WITH_D1_DATABASE_ID`. Leave `apps/web/wrangler.jsonc` alone.
If the database already exists, `wrangler d1 list` shows the id instead.

## 3. Create the production tables

```bash
pnpm --filter @chessdecide/web exec wrangler d1 migrations apply DB \
  --remote --config wrangler.production.jsonc
```

Expect the three migrations (`0000_modern_sentinels`, `0001_same_umar`,
`0002_harsh_tarantula`) listed, then `Migrations applied`. Answer `y` when wrangler asks to
confirm. Re-run after any future migration; it is safe to repeat.

## 4. Build and deploy the Worker

```bash
pnpm --filter @chessdecide/web build
pnpm --filter @chessdecide/web exec wrangler deploy --config wrangler.production.jsonc
```

Expect `vite build` to print the client/server chunks, then wrangler to upload the Worker and
print the URL, e.g. `https://chessdecide-web.<account>.workers.dev`. The production config sets
`CHESSDECIDE_MODE=public`, so the site is read-only: no New game / New series buttons, no
spend chip, no control routes.

## 5. Publish the finished results

```bash
pnpm cli publish --dry-run                     # counts per table, bytes; writes nothing
pnpm cli publish --remote --config wrangler.production.jsonc
```

(`--config` resolves against `apps/web/`. Without it, `--remote` uses `wrangler.jsonc`, sees
`"local-dev"` and refuses.)

Expect the dry run to print something like:

```
publish: dry run
  ladder_levels 12
  series        4
  games         100
  plies         5088
  bytes         5544102
```

Then `--remote` writes the files under `data/publish/` and runs, per file:

```
wrangler d1 execute DB --remote --config …/wrangler.production.jsonc --file …-001.sql
```

Each file reports `Executed N queries`. Run the same command a second time: the row counts
the Worker shows must not change (`INSERT OR REPLACE`).

Useful flags: `--series <id>...` publishes specific series, `--all-games` also publishes
finished games that belong to no series, `--out <file.sql>` changes the output base path.

## 6. Check the public site

Open the workers.dev URL and verify:

- `/api/health` → `"mode": "public"`, `"control": false` (and no spend figures).
- `/` → the leaderboard with four arms, the ladder axis and the "not separable yet" markers.
- `/series` → the four series; `/series/<id>` → the rating form and game list.
- `/games/<id>` → a replay works and the decision panel shows the published pick.
- The 400 px phone layout does not scroll horizontally.

If a page is empty, the likely cause is step 5 not having run (or running against the wrong
config). `wrangler d1 execute DB --remote --config wrangler.production.jsonc --command
"select count(*) from games"` should match the dry-run number.

## Free-tier notes

The public site only reads D1. The free plan allows 500 MB storage and 50 queries per request:

- every API route stays at or under 10 queries (`packages/api/test/query-budget.test.ts` counts
  them via a wrapper around `DB.prepare`); the leaderboard is a constant 4 queries, not one per arm;
- each SQL file stays under 2 MB and each statement under D1's 100 KB cap (the publish command
  fails loudly if a single row would exceed it);
- more arms or longer series mean more rows, not more queries per page load.

## What is never published

`attempts` (including the gzipped request/response bodies), `oracle_moves`, `settings`,
`models_snapshot` and `ladder_games` are never copied. The API key lives only in the local
`.env` for the daemon; the public Worker has no key and no provider client.
