# Handoff — where we left off (2026-10-30, session 5)

Autumn uses **she/her** pronouns. She often works by voice: keep replies short and conversational.

## 1. State

**T10 is done and deployed.** `pnpm verify`, `pnpm build` and `pnpm e2e` all pass, the public read-only
site is live at **https://chessdecide-web.m7jv4v7npb.workers.dev** (D1 `chessdecide`
`394e0101-b338-4bee-9375-bc9f96b5480c`, ENAM) with the four real series published twice at identical
counts. Next task is **T11 exports**.

| Task | State |
| --- | --- |
| T00–T10 | done (T10 deployed 2026-10-30) |
| **T11 exports** | **not started — next** |
| T12 image arm | not started |

## 2. Where the deploy lives

- D1: `chessdecide` / `394e0101-b338-4bee-9375-bc9f96b5480c`; production config
  `apps/web/wrangler.production.jsonc`; local dev stays `wrangler.jsonc` (`local-dev`).
- Worker: `chessdecide-web`, `https://chessdecide-web.m7jv4v7npb.workers.dev`,
  `CHESSDECIDE_MODE=public` (no control routes, no key, no spend).
- Remote data: 4 series, 100 games, 5088 plies, 12 ladder levels. Deployed leaderboard: D1U hinted
  895 ± 162, Jev hinted 775 ± 159, D1U clean 733 ± 158, Jev clean 532 ± 160, all on ladder v2.
- Refresh after new series: `pnpm cli publish --remote --config wrangler.production.jsonc` (build and
  deploy only if code changed). `docs/DEPLOY.md` is the full runbook.

## 3. First thing next session: T11 exports

Read `docs/build/tasks/T11-exports.md`. Two things to keep in mind from T10:

- series detail pages exist locally and in public mode, so exports must work read-only too;
- any new read route goes through `packages/api/test/query-budget.test.ts` (≤ 10 queries).

## 4. Catches worth remembering

- **Public mode derives the ladder from the published rows.** With no ladder file, the API would
  default to nominal v0 and show an empty leaderboard (it did, on the first deploy).
  `publishedLadderVersion`/`loadPublishedLadder` fix that; `GET /api/ladder` now serves the published
  ladder in public mode. If series ever move to a newer ladder, republish and the default follows.
- **`pnpm build` needed a new dependency.** SvelteKit 3 externalises `cookie`; the emitted chunk
  imported it bare and resolved to a stray CJS `~/node_modules/cookie`. `apps/web` now depends on
  `cookie@2.0.1`. `pnpm verify` alone does not catch a broken build — run `pnpm build` after web changes.
- `ApiError(code, message, **status**)` — the third argument is the HTTP status, not `retryable`.
- A leaderboard arm is **model + arm** (`liquid/d1-ultra#hinted`), never `arm_id` alone.
- `/api/leaderboard/compare` ignores `ladder_version`; it compares on `currentLadder().version`.
- `buildSeries` is now `assembleSeries` (pure) + batched reads in `leaderboardInput`: the leaderboard
  is a fixed 6 D1 queries regardless of arm count.
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
