# T01 — Real model wiring, catalog, estimate, probe

**Goal:** the daemon can run games with real decision models safely and cheaply; nothing paid happens in tests.

## Files

| File | Change |
| --- | --- |
| `packages/providers/src/catalog.ts` | new |
| `packages/providers/test/catalog.test.ts` | new (uses `docs/build/fixtures/openrouter-models-decisions.json`; copy it to `packages/providers/test/fixtures/`) |
| `packages/providers/src/estimate.ts` | new |
| `packages/runner/src/runtime.ts` | edit `buildPorts` |
| `packages/runner/src/config.ts` | add key/env helpers |
| `packages/api/src/api.ts` | add routes + deps |
| `packages/api/test/api.test.ts` | add tests |
| `packages/runner/src/cli.ts` | add `probe` |
| `docs/CHANGELOG.md` | entry |

## 1. Catalog (`catalog.ts`)

```ts
export interface ModelInfo {
  slug: string;                 // `id` in the response, e.g. "typesafe/jev-1.14"
  canonical_slug: string | null;
  name: string | null;
  context_length: number;
  price_in_per_m: number;       // Number(pricing.prompt) * 1e6
  input_modalities: string[];   // architecture.input_modalities
  roster: boolean;              // slug in ROSTER = ['typesafe/jev-1.14', 'liquid/d1-ultra']
  disabled_reason: string | null;
}
export function parseCatalog(json: unknown): ModelInfo[];                    // pure
export function createCatalog(opts: { fetch?: typeof fetch; ttlMs?: number; now?: () => number }): { list(): Promise<ModelInfo[]> };
```
- URL `https://openrouter.ai/api/v1/models?output_modalities=decisions` (public, no key). Cache for `ttlMs` (default 3,600,000).
- `disabled_reason` (string, else null): context_length 0 or `< 8192` → `"Context window too small for a full move list"`;
  `input_modalities` lacking `"text"` → `"Does not accept text"`. Models are never hidden, only flagged.
- Sort: roster first (in `ROSTER` order), then by `price_in_per_m` ascending, then slug.
- Tests: fixture parses to 32 models; Jev 1.14 has `price_in_per_m ≈ 0.042` and `roster:true`; `respan/span-01-lite` (context 0)
  is disabled; sorting; cache hit makes no second fetch (fake fetch counter); a non-OK response throws.

## 2. Estimate (`estimate.ts`)

```ts
export interface GameEstimate { calls: number; est_input_tokens: number; est_cost_usd: number; worst_case_usd: number;
  cap_usd: number; over_cap: boolean; breakdown: Array<{ model: string; arm: string; calls: number; est_cost_usd: number }> }
export function estimateGame(config: GameConfig, catalog: ModelInfo[]): GameEstimate;
```
- Count the sides whose player is `type:'model'` (0, 1 or 2). Per model side: `typical_calls = min(40, ceil(max_plies/2))`,
  `worst_calls = ceil(max_plies/2)`, per-call tokens `400 + 45·30` (30 options typical) → `estimateCallUsd(30, price)`.
  `est_cost_usd` = sum over model sides of `typical_calls × per_call`; `worst_case_usd` with `worst_calls`.
- Image arm adds **600** input tokens per call (measured: Jev 1116 → 1741 for 23 options).
- Unknown model slug → throw `Error('unknown model')` (the API maps it to 400 `invalid_config`).
- `over_cap = est_cost_usd > budget_usd`.
- Tests: Jev clean 200 plies → calls 40, cost ≈ `40 × 1750/1e6 × 0.042`; no model sides → 0 and `over_cap:false`; image adds tokens;
  over-cap when `budget_usd: 0.0001`.

## 3. Runtime: real players (`runtime.ts`)

Replace the `throw new Error('real model players are added in task T14')` branch with:
```ts
const catalog = await getCatalog();           // module-level createCatalog(), shared
const info = (await catalog.list()).find((m) => m.slug === desc.model);
if (!info) throw new ApiError('invalid_config', `unknown model ${desc.model}`);
const key = process.env.OPENROUTER_API_KEY;
if (!key) throw new ApiError('no_api_key', 'OPENROUTER_API_KEY is not set');
const client = clientFor(key);                // ONE DecisionsClient per process so per-model limits are shared
return new ModelPlayer({ client, sink: d1AttemptSink(db), model: desc.model, arm: desc.arm, seed: game.config.seed + (side === 'white' ? 1 : 2) });
```
- `ApiError` (new, in `packages/api/src/errors.ts`, exported): `class ApiError extends Error { constructor(public code: string, message: string, public status = 400) }`.
  `createApi`'s `onError` maps `ApiError` to its status and the error envelope (codes `invalid_config`→400, `no_api_key`→424, `budget_exceeded`→402).
- Budget port: `gameBudget({ capUsd: game.config.budget_usd, pricePerMInput: info.price_in_per_m, rollingMeanTokens })`
  where `rollingMeanTokens` returns the mean `input_tokens` of the last 100 non-cached `ok` attempts for this model+arm **only if ≥ 20 exist**, else `undefined`
  (add `meanInputTokens(db, model, armId): Promise<number|undefined>` to `packages/db/src/store.ts` with a test).
- If **both** sides are models use each side's own catalog price; the single `budget.check(game)` uses the sum of the two estimates.
- Mock mode (`CHESSDECIDE_MOCK=1`) keeps using `MockPlayer` for every model side.
- `ImageArm`: if `desc.arm === 'image'` or `arm.interface === 'image'` throw `ApiError('invalid_config', 'image arm arrives in T12')` for now.

## 4. API additions (`packages/api`)

Add optional deps: `catalog?: { list(): Promise<ModelInfo[]> }`, `ladder?: () => LadderFile`, `spend?: (since?: string) => Promise<{usd:number;calls:number;cache_hits:number}>`, `hasKey?: () => boolean`.
In `public` mode these are absent and the routes return 404 `not_available`.

| Route | Behaviour |
| --- | --- |
| `GET /api/models` | `ModelInfo[]` |
| `POST /api/estimate` | body `GameConfig` → `GameEstimate`; unknown model → 400 `invalid_config` |
| `GET /api/spend?since=session\|today\|all` | session = since daemon start; today = since 00:00 UTC; all |
| `GET /api/ladder` | the loaded `LadderFile` (`DEFAULT_LADDER` until a calibrated file exists; see T05) |
| `POST /api/games` | validate: both players present; `max_plies` 10..400; `budget_usd` 0.001..50; `judge_depth` 6..20; unknown model → 400; model side and no key (non-mock) → 424 `no_api_key`; `estimate.over_cap` → 402 `budget_exceeded` with `detail.est_cost_usd`; else create (201) |
| `GET /api/health` | add `mock:boolean`, `engine:{ok,version}`, `openrouter:{key_present}`, `ladder:{version,calibrated}`, `budget:{session_usd,today_usd,total_usd}` |

Tests (in-process `app.request`, fake deps): each route above, each validation failure, 402 payload, 424 without key, health shape.

## 5. CLI `probe` (`cli.ts`)

`pnpm cli probe --model typesafe/jev-1.14 --arm clean [--fen "<fen>"]` (default start position). One real call through
`ModelPlayer` with a temporary in-memory sink, prints: pick (SAN and UCI), `p_pick`, latency ms, input/output tokens, **cost USD**,
and request bytes. Requires the key; without it exit 2 with a clear message. Cost ≈ $0.00005.
Add a `LIVE=1` test file `packages/runner/test/probe.live.test.ts` that is skipped unless `LIVE=1`.

## Acceptance

- `pnpm verify` green; no test touches the network.
- With the network blocked, `GET /api/models` returns 502 `upstream_error` (add that mapping for catalog fetch failures) and the rest of the app keeps working in mock mode.
- Manual (Autumn runs this later): `OPENROUTER_API_KEY=… pnpm cli probe --model typesafe/jev-1.14 --arm clean`.

Commit: `Add real model players, catalog, estimate and probe`.
