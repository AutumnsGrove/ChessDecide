# Handoff — where we left off (2026-10-30, session 5)

Autumn uses **she/her** pronouns. She often works by voice: keep replies short and conversational.

## 1. State

T09's e2e is now **green** (42/42) and **T10's code is finished**. `pnpm verify`, `pnpm build` and
`pnpm e2e` all pass. The only thing left in T10 is the **credential step**, which must be done with
Autumn present (see §2).

| Task | State |
| --- | --- |
| T00–T09 | done |
| **T10 publish + runbook** | **code complete; deploy blocked on Autumn's `wrangler login`** |
| T11 exports | not started |
| T12 image arm | not started |

## 2. First thing next session: the T10 STOP

Ask Autumn: *"Ready to deploy the public site? This needs `wrangler login` on your machine and
creates a D1 database named `chessdecide` in your account."*

If yes, follow `docs/DEPLOY.md` in order (it is written to be followed literally):
login → `wrangler d1 create chessdecide` → paste the UUID into
`apps/web/wrangler.production.jsonc` → `d1 migrations apply --remote --config wrangler.production.jsonc`
→ `pnpm build` + `wrangler deploy --config wrangler.production.jsonc` →
`pnpm cli publish --remote --config wrangler.production.jsonc` twice (counts must not change) →
check `/api/health` (`mode: public, control: false`), `/`, `/series`, a replay, and 400 px.

If not yet: commit T10 as it is (the deploy is the only missing acceptance item) and start T11.

`pnpm cli publish --remote` without `--config` deliberately refuses: `apps/web/wrangler.jsonc` still
has `database_id: "local-dev"`. The guard also rejects non-UUID placeholders, so the production
config cannot be pointed at the local DB or left unfilled by accident.

## 3. Catches worth remembering

- **`pnpm build` needed a new dependency.** SvelteKit 3 externalises `cookie` in the server build;
  the emitted chunk imported it bare and resolved to a stray CJS `~/node_modules/cookie`. `apps/web`
  now depends on `cookie@2.0.1`, so the build is reproducible. This was broken before T10 — run
  `pnpm build` when touching the web app, `pnpm verify` alone will not catch it.
- `ApiError(code, message, **status**)` — the third argument is the HTTP status, not `retryable`.
- A leaderboard arm is **model + arm** (`liquid/d1-ultra#hinted`), never `arm_id` alone.
- `/api/leaderboard/compare` always uses `DEFAULT_LADDER.version` (0 unless `/api/ladder` exists), so
  in public mode it compares arms on ladder v0. The series rows must carry that `ladder_version`.
- `buildSeries` is now `assembleSeries` (pure) + batched reads in `leaderboardInput`: the leaderboard
  is a fixed 4 D1 queries regardless of arm count (`packages/api/test/query-budget.test.ts`).
- Real publish sizes: 4 series → 100 games, 5088 plies, 5.5 MB in three files (just under the 2 MB
  chunk limit). `--dry-run` is the quick way to check.
- Do not run `pnpm verify` while a series or calibration is running (core perft timeouts under
  Stockfish workers). Mock mode (`CHESSDECIDE_MOCK=1`) is what e2e uses; it spends nothing.

## 4. Real-run numbers (all on ladder v2, Quick 25, cap $0.50)

| Model · arm | Elo (95 %) | W-D-L | ACPL | Cost | Series |
| --- | ---: | --- | ---: | ---: | --- |
| D1 Ultra · hinted | **895 ± 162** | 11-2-12 | 140.8 | $0.0091 | `01M64EK96XRMJWEAQXA97CFXYY` |
| Jev · hinted | **775 ± 159** | 11-1-13 | 154.3 | $0.0210 | `01M64BJR3QV9KBBT2NQY2ETB0M` |
| D1 Ultra · clean | **733 ± 158** | 8-2-15 | 177.6 | $0.0099 | `01M64D1GEA348WMA5H8WGPBRFX` |
| Jev · clean | **532 ± 160** | 8-2-15 | 231.5 | $0.0299 | `01M625J2GZ003DBZWK012ERQQ8` |

Only two of six pairs are separated at 25 games (Jev clean < Jev hinted; Jev clean < D1U hinted).

## 5. Next steps

1. T10 credential step with Autumn (§2), then T11 exports, T12 image arm.
2. Phase 2 (live Cloudflare) is out of this curriculum.
