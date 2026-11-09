# T14 — Compare many arms (as built)

**Status: implemented.** This is a record of what was built, not a brief to rebuild it. It sits after
T13 because Autumn asked for it directly; the curriculum's "add no features that are not in a task"
rule was hers to waive.

**Goal:** the leaderboard could compare exactly two arms (`/compare?a=…&b=…`, one `P(A stronger)` and
one Elo gap). Answering "how do these four stack up?" meant six visits by hand. Now `/compare` takes
two to six arms and shows **every pair** at once, from one request.

## 1. The contract (source of truth: `docs/API.md` §3.5)

`GET /api/leaderboard/compare-many?arms=<id>,<id>[,…]` → `{ arms, pairs }`, edge-cached in `public`
mode. 2–6 distinct ids, duplicates collapse, selection order preserved; `pairs` is every `i < j` in
selection order. `< 2` ids → 400, unknown id → 404 naming it.

URLs live in `arms=`, comma separated, each id percent-encoded (`x/alpha#hinted` →
`x%2Falpha%23hinted`). The old `?a=&b=` links still work: `armIdsFrom` reads either shape.

## 2. Decisions

| # | Decision | Why |
| --- | --- | --- |
| D1 | **`comparePairs` is a thin loop over `compareArms`**, not a second estimator. | Two code paths drifting one decimal apart is the failure mode this endpoint exists to avoid. A test pins `compare-many` == `/compare` per pair. |
| D2 | **Pairs are returned as arm ids.** The client joins them to board rows via `pairAsCompare`. | The endpoint stays stateless and cacheable; the human labels (`d1-ultra · hinted`) are the UI's business. |
| D3 | **Cap is 6 arms (15 pairs).** | ≈ 12 ms of CPU per pair, so 15 pairs is still ~0.2 s; 10 arms would be 45 pairs for no readable table. |
| D4 | **At the cap the table disables the remaining boxes** instead of dropping an earlier pick. | The old two-arm table silently evicted the first selection on a third tick; a pick that vanishes is a bug, not a policy. |
| D5 | **One request per arm list, edge-cached.** | Identical for every visitor and changes only on a publish — the same rule as `/api/leaderboard`. |
| D6 | **`< 1 %` / `> 99 %` take no `=`** in `comparisonSentence`. | `P(… stronger) = < 1 %` read as a typo. |

## 3. Files

| File | What |
| --- | --- |
| `packages/core/src/leaderboard.ts` | `PairCompare`, `comparePairs` |
| `packages/api/src/api.ts` | `GET /leaderboard/compare-many` (validation, 400/404, payload) |
| `apps/web/src/routes/api/[...path]/+server.ts` | `EDGE_CACHED` is now a set of two paths |
| `apps/web/src/lib/api.ts` | `PairResult`, `CompareMany` types |
| `apps/web/src/lib/leaderboard-model.ts` | `MAX_COMPARE`, `compareHref`, `armIdsFrom`, `pairAsCompare`; `comparisonSentence` fix |
| `apps/web/src/lib/BoardTable.svelte` | multi-select to 6, disabled boxes at the cap, honest selection copy |
| `apps/web/src/routes/compare/+page.ts` | one `compare-many` fetch; `ids` replaces `a`/`b` |
| `apps/web/src/routes/compare/+page.svelte` | chips you can remove, N-way head-to-head, axis and cards for every picked arm |
| `apps/web/src/routes/+page.svelte` | "Tick up to six rows" |

## 4. Tests

- core: pair list and order, one pair for two arms, none for one, agreement with `compareArms`, a
  clear ladder ordering.
- api: all pairs in order, same query cost for 2 and 4 arms, agreement with `/compare`, rejects too
  few / too many / one-distinct / unknown arms; the path is in the query-budget list.
- web unit: link round-trip with `#` and `/`, old `?a=&b=` links, blanks and duplicates, the cap,
  `pairAsCompare` labelling and its `null` for an unknown id.
- e2e: three arms ticked and all three stay ticked, 3 then 4 then 3 cards as arms are added and
  removed, the table stopping at six with the seventh disabled, an older two-arm link still working,
  and the swap-by-removing sentence check.

## 5. Verified

`pnpm typecheck`, `pnpm check` (0 errors, 0 warnings) and the core (99) / api (56) / web (46) suites
green. Against the real local D1: three arms → three pairs, correct order, 400 and 404 paths as
documented. In Chromium, `/compare?arms=…` with three arms renders three chips, three cards and three
head-to-heads (`P(d1-ultra · hinted stronger) = 85 %`, `+120 Elo (-106 to 345, 95 %)`), removing a
chip rewrites the URL, no console errors.

**Not verified:** the Playwright suite itself — its `webServer` did not come up inside 120 s on this
machine (cold `wrangler`/`workerd` start), so the new e2e cases have never run in CI or locally. The
manual browser pass above covers the same assertions.

## 6. Non-goals

- No same-position multi-model tool (that stays dropped from v1, `docs/PLAN.md`).
- No merged/joint rating across the selected arms: each pair is an independent two-arm comparison, so
  `P(A > B)` and `P(B > C)` do not compose into `P(A > C)` — and this endpoint does not pretend they do.
- No change to `/compare`'s arithmetic, `compareArms`, or the Elo model.
