# Handoff — where we left off (2026-10-29, session 4)

Autumn uses **she/her** pronouns. She often works by voice: keep replies short and conversational.

## 1. State

T08 is **finished** (first real series) and T08b added three more series so four arms share one ruler.
**T09 leaderboard is built; `pnpm verify` is green, `pnpm e2e` has not passed yet (see §2).**

| Task | State |
| --- | --- |
| T00–T07 | done |
| T08 first real series | done (Jev·clean 532 ± 160, $0.0299) |
| T08b three more series | done (see `docs/build/reports/T08b-arms-and-models.md`) |
| **T09 leaderboard** | **code complete; e2e needs a fix run** |
| T10–T12 | not started |

## 2. First thing next session: finish T09's e2e

`pnpm verify` is green (typecheck + svelte-check + all unit tests, including the new leaderboard
core/db/api/web suites). `pnpm e2e` was last run mid-edit; the failures were all in
`apps/web/e2e/leaderboard.spec.ts` and the fixes below are already applied but unverified:

- Locator destructuring is not iterable → use `.nth(0)` / `.nth(1)` (done).
- The uncalibrated text matched 3 elements → assert on `.notice` (done).
- Data from earlier specs leaks into later projects (same temp D1), so assertions are now
  `hasText`-scoped instead of assuming row order/count (done).
- `buildLeaderboard` now drops arms with 0 rated games (a just-created series used to show
  `1345 ± 9633`), so a leftover series no longer appears as a rated row.

Run `pnpm e2e` (kill anything on 8731/5273 first — the config uses `reuseExistingServer: false`).
Then commit `Add leaderboard` if it was not already part of the T08b/T09 commit, and move to T10.

## 3. Catches worth remembering

- `ApiError(code, message, **status**)` — the third argument is the HTTP status, not `retryable`.
  `new ApiError('not_found', …)` silently yields 400; pass 404 explicitly.
- A leaderboard arm is **model + arm** (`liquid/d1-ultra#hinted`): `series.arm_id` alone is only the
  preset, so two models with `clean` would otherwise collapse into one row.
- Elo is only comparable within one `ladder_version`; the API filters on it and the UI falls back to
  the nominal ladder when `/api/ladder` is absent (public mode).
- Do not run `pnpm verify` while a series or calibration is running: core perft/completion tests
  time out under 4 Stockfish workers.
- Mock mode (`CHESSDECIDE_MOCK=1`) is what the e2e suite uses; series there finish in seconds with no
  spend.

## 4. Real-run numbers (all on ladder v2, Quick 25, cap $0.50)

| Model · arm | Elo (95 %) | W-D-L | ACPL | Cost | Series |
| --- | ---: | --- | ---: | ---: | --- |
| D1 Ultra · hinted | **895 ± 162** | 11-2-12 | 140.8 | $0.0091 | `01M64EK96XRMJWEAQXA97CFXYY` |
| Jev · hinted | **775 ± 159** | 11-1-13 | 154.3 | $0.0210 | `01M64BJR3QV9KBBT2NQY2ETB0M` |
| D1 Ultra · clean | **733 ± 158** | 8-2-15 | 177.6 | $0.0099 | `01M64D1GEA348WMA5H8WGPBRFX` |
| Jev · clean | **532 ± 160** | 8-2-15 | 231.5 | $0.0299 | `01M625J2GZ003DBZWK012ERQQ8` |

Only two of six pairs are separated at 25 games (Jev clean < Jev hinted; Jev clean < D1U hinted).
Session 3's $0.0299 estimate of "$0.10–0.15 for a Quick series" is ~4× high; real cost is $0.01–0.03.

## 5. Next steps

1. Green `pnpm e2e` for T09, then T10 publish/read-only deploy, T11 exports, T12 image arm.
2. Phase 2 (live Cloudflare) is out of this curriculum.
