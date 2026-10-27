# M0 spike findings

> **Status of claims (v3 docs).** These are M0 *observations* — N=1–2 positions, 3–4 models.
> Treat §2.3–2.5 (determinism, order invariance, calibration across position types) as hypotheses
> that M1 re-tests (`PLAN.md` §9). §3's CPL/win-loss numbers were produced with a root-search
> reference and child-search move scores (e.g. `d1`: CPL 61 in §3 vs 75 in §4.1; `Re1` cp 23 > best
> cp 19) — the oracle in `METRICS.md` §3 replaces that method. §2.1/§4.2's mate-in-1 "saturation"
> is confounded by SAN `#` and "checkmate" in descriptions (`clean` arm removes both). Text-model
> material (§4–§5) is parked in `TEXT_ARM.md`.

Date: 2026-10-27 · OpenRouter Decisions API (alpha) · Stockfish 19 · small N, illustrative only.

Scripts: `spikes/m0_decisions.py`, `spikes/m0_engine.py`, `spikes/m0_compare.py`
Raw results: `spikes/out/m0_compare.json` (gitignored). No key is stored anywhere.

---

## 1. Verdict

The core loop works end to end:

- all-legal-moves `choice` questions are accepted with **20–63 options**;
- probabilities sum to ~1.0 and include a separate `confidence`;
- one request can return `choice` + `score` + `noul` answers at once;
- 63 options costs ~2.7–4.4k input tokens and **~0.5–0.9 s**;
- Stockfish 19 (depth 18, WDL) scores moves cleanly, and the Elo ladder works;
- text models work in free-text, forced-tool, and JSON-schema modes — but reasoning
  budget/termination is the main operational problem.

Proceed to build. The request format in `PLAN.md` §3 is confirmed, with the adjustments in §6
below (reasoning effort, retries, tool-choice fallback).

---

## 2. Decisions API

### 2.1 Start position, 20 options

| Model | Pick | P(pick) | Conf | Latency | In tok | Out tok | Cost |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `typesafe/jev-1.14` | e4 | 0.78 | 0.77 | 1519 ms | 1671 | 209 | $0.000070 |
| `liquid/d1-ultra` | e4 | 0.327 | 0.292 | 966 ms | 1180 | 0 | $0.000050 |
| `microsoft/microsoft-decision-1` | e4 | 0.709 | 0.693 | 813 ms | 925 | 3 | $0.000039 |
| `openai/gpt-6-luna-decisions` | e4 | 0.89 | 0.88 | 548 ms | 1256 | 0 | $0.000126 |

All four picked e4 (SF best). `confidence ≈ P(pick)` for every model. Output tokens are free;
cost is input-only.

### 2.2 Option-count sweep, same position (63 legal moves)

Prefix subsets (5/20/40/all). Picks differ by construction because the option set changes, so
this does not measure quality vs. option count — it only stresses the protocol.

| Model | 5 opts | 20 | 40 | 63 | Latency range | Input tokens (63) | P sum (63) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| jev-1.14 | Kxf6 .48 | Rxa6 .26 | Qxd2+ .38 | Qxd2+ .26 | 541–865 ms | 4367 | 0.990 |
| d1-ultra | Kxf6 .50 | Rxa6 .16 | Qxd2+ .19 | Ng4+ .09 | 547–680 ms | 3381 | 1.000 |
| ms-decision-1 | Kxg6 .27 | Ng4+ .31 | Ng4+ .21 | Qxd2+ .16 | 656–1630 ms | 2758 | 1.000 |

63 options is fine. Jev output tokens scale (~9/option) but are free. No 400s, no truncation.

### 2.3 Determinism (40 options, same request ×5)

| Model | Pick agreement | P(pick) range | Confidence range |
| --- | --- | --- | --- |
| jev-1.14 | 5/5 Qxd2+ | 0.35–0.37 | 0.35–0.37 |
| d1-ultra | 5/5 Qxd2+ | ~0.151–0.176 | same |
| ms-decision-1 | 5/5 Ng4+ | 0.178–0.184 | same |

Pick is stable; probabilities drift by up to ~0.02. **Repeat N=3 and report variance.**

### 2.4 Order and key sensitivity (40 options, jev)

| Keys | Order | Pick | P(pick) | P(first) | P(last) | Response key order |
| --- | --- | --- | --- | --- | --- | --- |
| SAN | forward | Qxd2+ | 0.41 | 0.000 | 0.000 | preserved |
| SAN | reverse | Qxd2+ | 0.32 | 0.000 | 0.010 | preserved |
| SAN | shuffle | Qxd2+ | 0.40 | 0.010 | 0.010 | preserved |
| opaque `mNN` | forward | Qxd2+ (m37) | 0.37 | 0.000 | 0.000 | preserved |
| opaque `mNN` | reverse | Qxd2+ (m04) | 0.30 | 0.010 | 0.010 | preserved |
| opaque `mNN` | shuffle | Qxd2+ (m27) | 0.45 | 0.010 | 0.000 | preserved |

**Findings:**

- Criteria order is preserved in the response; probabilities come back in input order.
- The **pick is order-invariant** (even with opaque keys, after mapping).
- The **probability mass is not**: P(pick) moves ±0.05–0.08 with order.
- No first/last-option bias (P(first/last) ≈ 0).

**Protocol:** keep a fixed, logged order (or seeded shuffle) and report P(best) with order
sensitivity. Do not shuffle between repeats of the same cell.

### 2.5 Multiple primitives in one request

`choice` + `score` + `noul` all came back from all four decision models in one round trip.
No extra latency observed. Use it for the eval/tactic tasks.

### 2.6 Errors

- `liquid/d1-ultra` returned **HTTP 429** on a second back-to-back request in the mate-in-1
  block. Needs retry + backoff and modest concurrency per provider.

---

## 3. Stockfish 19 (UCI, depth 18, 1 thread, WDL on)

**Start position:** best `e4` (cp 34, WDL 67/929/4).

| Move | cp (mover POV) | CPL | Win% loss |
| --- | --- | --- | --- |
| e4 | 28 | 6 | 0.8 |
| d4 | 18 | 16 | 1.8 |
| Nf3 | 20 | 14 | 1.6 |
| f3 | -80 | 114 | 19.1 |
| a3 | 1 | 33 | 3.1 |

**Quiet Italian** (`r1bq1rk1/ppp2ppp/2np1n2/2b1p3/2B1P3/2PP1N2/PP3PPP/RNBQ1RK1 w - - 1 7`):
best `b4` (cp 19, WDL 37/955/8 — a drawish, unintuitive "best").

| Move | cp | CPL | Win% loss |
| --- | --- | --- | --- |
| Bxf7+ | -647 | 666 | 51.5 |
| Nxe5 | -580 | 599 | 51.5 |
| d4 | -42 | 61 | 5.8 |
| Ng5 | -14 | 33 | 2.5 |
| Re1 | 23 | 0 | -0.4 |
| h3 | 20 | 0 | -0.1 |
| a3 | 10 | 9 | 0.8 |

**Mate in 1** (`r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4`):
best `Qxf7#`. All engines/models below found it.

WDL via `score.wdl()` works; `UCI_LimitStrength` + `UCI_Elo` works at 1320/1800/2400/3190.
CPL must be computed from the eval of the resulting position with the **mover's** POV.

---

## 4. Decision vs text on two positions

Text models: the six standard models, `reasoning.effort=low`, `max_tokens=4096` (the first
pass — too low for some). Decision models: `choice` over all legal moves, plus `score`/`noul`.

### 4.1 Quiet Italian (36 options, best b4 cp 19)

| Model | Mode | Move | CPL | Win% loss | P(best) | P(pick) | Conf | Latency | Out tok | Cost |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| jev-1.14 | decisions | Bxf7+ | 666 | 51.5 | 0.000 | 0.48 | 0.47 | 758 ms | 347 | $0.000115 |
| d1-ultra | decisions | Nxe5 | 597 | 51.5 | 0.059 | 0.20 | 0.18 | 694 ms | 0 | $0.000087 |
| ms-decision-1 | decisions | Bxf7+ | 666 | 51.5 | 0.006 | 0.26 | 0.24 | 1341 ms | 3 | $0.000069 |
| gpt-6-luna-decisions | decisions | d4 | 75 | 8.9 | 0.000 | 0.65 | 0.64 | 921 ms | 0 | $0.000198 |
| deepseek-v4.1-flash | tool | — | — | — | — | — | — | 15.7 s | 4096 | $0.003520 |
| deepseek-v4.1-flash | text | — | — | — | — | — | — | 20.6 s | 4096 | $0.003307 |
| claude-haiku-5.5 | tool | Bxf7+ | 666 | 51.5 | — | — | — | 1.9 s | 37 | $0.000112 |
| claude-haiku-5.5 | text | Bb3 | 16 | 1.3 | — | — | — | 7.4 s | 747 | $0.000399 |
| gpt-6-luna | tool | d4 | 75 | 8.9 | — | — | — | 4.2 s | 19 | $0.000051 |
| gpt-6-luna | text | d4 | 75 | 8.9 | — | — | — | 4.4 s | 203 | $0.000122 |
| mimo-v2.6-flash | tool | d4 | 75 | 8.9 | — | — | — | 2.4 s | 447 | $0.000180 |
| mimo-v2.6-flash | text | — | — | — | — | — | — | 14.0 s | 4096 | $0.001163 |
| glm-5.3-flash | tool | Nxe5 | 597 | 51.5 | — | — | — | 6.5 s | 474 | $0.000104 |
| glm-5.3-flash | text | Ng5 | 33 | 2.5 | — | — | — | 2.3 s | 160 | $0.000037 |
| muse-spark-1.3 | tool | — (400) | — | — | — | — | — | 0.4 s | — | — |
| muse-spark-1.3 | text | d4 | 75 | 8.9 | — | — | — | 27.5 s | 2677 | $0.000553 |

Decision arm cost: **$0.00047** total. Text arm cost: **$0.00955** (≈20×), dominated by
reasoning tokens and failed-to-answer calls.

### 4.2 Mate in 1 (43 options)

All decision models that answered picked `Qxf7#` with P ≈ 0.98–0.99. All six text models, in
both tool and text modes, picked `Qxf7#` (the only exception was muse tool, which 400s because
its provider rejects forced `tool_choice`). So mate-in-1 is saturated — useful as a sanity
check, not as a benchmark.

### 4.3 What this suggests (hypotheses to test at scale, not conclusions)

1. Decision models are **strong on forcing tactics** (mate-in-1, P≈0.98) and **weak on quiet
   positional choices** (3/4 picked a −6.5 blunder on the Italian). N=1.
2. Their confidence is **not calibrated across position types**: ~0.48–0.65 on a blunder,
   ~0.98 on a mate. Calibration is a first-class metric, not a nice-to-have.
3. **Mode changes the answer.** Haiku tool → Bxf7+ (CPL 666) vs text → Bb3 (CPL 16).
   GLM tool → Nxe5 (597) vs text → Ng5 (33). Forced tool enums can hurt, even though they
   guarantee legality. Mode must be a leaderboard dimension.
4. Text models are **10–40× more expensive** and **3–50× slower** once reasoning is on.
5. Reasoning effort is the dominant text knob: DeepSeek `none` → `Bxf7+` in 1.2 s for
   $0.000024; `low` + 16k cap → `Re1` (CPL 0) in 24.5 s for $0.0033.

---

## 5. Text-model protocol failures (and fixes)

| Problem | Observed | Fix for the harness |
| --- | --- | --- |
| Reasoning eats the whole budget | DeepSeek + Mimo returned empty content at 4096; Mimo still empty at 16384 | `max_tokens=16384` for reasoning on; on `finish_reason=length`/empty, one nudge call: "Output only your move (SAN)", reasoning off |
| `effort` not honored by every model | Mimo has no `supported_efforts`; DeepSeek ignored `low` at 4096 | Read the catalog `reasoning` object; use the lowest supported effort; record it |
| Forced `tool_choice` unsupported | Muse 400: "only `auto` is supported" | Try forced; on that 400 retry with `tool_choice:"auto"`; if no tool call, fall back to JSON schema |
| Provider lacks tool support | mitigated with `provider.require_parameters=true` (Muse still 400) | Keep `require_parameters` on structured modes; record provider errors |
| Rate limits | d1-ultra 429 | Retry with backoff (3×), cap concurrency per provider |
| Reasoning is expensive | $0.0035–0.0066 for one failed chess move | Report $/1k decisions and reasoning-token share; offer `reasoning=none` |

**Recommended text-arm default:** run the primary comparison at the **lowest supported
reasoning effort** (`none` for DeepSeek/Claude/GPT/Mimo, `low`/`minimal` for GLM/Muse), with a
secondary "reasoning on (default effort)" arm. Record the effort per result. This makes the
primary decision-vs-text comparison about the interface rather than about test-time compute.

---

## 6. Locked protocol changes

1. **Text models (standard set):**
   `deepseek/deepseek-v4.1-flash-1017`, `anthropic/claude-haiku-5.5`, `openai/gpt-6-luna`,
   `xiaomi/mimo-v2.6-flash`, `z-ai/glm-5.3-flash`, `meta/muse-spark-1.3-contributor`.
2. **Reasoning is a recorded dimension.** Primary text arm: lowest supported effort. Secondary:
   default effort. Per-model settings read from the live catalog.
3. **Retries:** 429/5xx with backoff; empty text response → one nudge; tool-choice 400 → auto;
   tool auto without a call → JSON schema.
4. **Option order:** fixed per run (seeded), logged. Report order sensitivity, don't randomize
   within repeats.
5. **Repeat N=3** per (position, model, mode).
6. **Metrics:** CPL + win% loss (WDL), P(best), P(pick), confidence, top-1/top-3, blunder rate,
   parse/no-answer rate, latency p50/p95, cost, reasoning-token share, and calibration.
7. **Position suite must be stratified** — mate-in-1 is saturated; quiet positions with a clear
   best move are where the signal is. Track decisiveness (best vs second-best gap).

---

## 7. Caveats

- One quiet position + one mate-in-1. Nothing here is statistically meaningful.
- The "63 legal moves" position came from random play and is absurd; use curated positions.
- CPL at depth 18 is a proxy; use WDL loss as the primary quality number and report both.
- The quiet Italian's best move (`b4`) is unintuitive and only +19 cp; several moves are
  effectively equal (Re1/h3 CPL 0). Judge on win% loss and decisiveness strata.
- Provider routing/rate limits will change results; record `provider` and retry.
- The temp API key used for these spikes must not be committed.

---

## 8. Session 2 spikes (2026-10-27)

### S1 — local D1 + Drizzle from a Node script: **PASS**

`spikes/s1-d1/`. Installed with pnpm (`wrangler 4.154`, `drizzle-orm`, `drizzle-kit`, `tsx`);
`drizzle-kit generate` produced the migration; a Node script opened local D1 through wrangler's
`getPlatformProxy({ persist: { path } })`, applied the SQL and used `drizzle-orm/d1`.

- 10,000 ply rows in 1,000 batched statements: **6.5 s**; read of the count: 21 ms.
- 50 single-row inserts: **0.9 s** (≈ 18 ms each). A 60-ply game writes in about a second.
- A second Node process opened the same persisted state and read all 10,000 rows (61 ms), so a
  runner and a local web app can share one D1 by pointing at the same `persist` path.
- D1 limits bind: ≤ 100 bound parameters per statement (so ~10 rows of 6 columns per `INSERT`);
  use `db.batch([...])` for groups. Single inserts are fine for plies.
- **pnpm 10 gotcha:** dependency build scripts are blocked by default (the install printed
  "Ignored build scripts: esbuild, workerd"). Wrangler still ran, but declare
  `"pnpm": { "onlyBuiltDependencies": ["esbuild", "workerd", "@resvg/resvg-js"] }` (or
  `pnpm approve-builds`) in the root `package.json` so installs are reproducible.
- Decision: **use the local D1 path** (`getPlatformProxy`); keep `better-sqlite3` out unless a
  later task shows a real problem. Wrangler prints a proxy warning in this sandbox; harmless.

### S2 — image input (partly done)

`spikes/s2-image/`. Findings from OpenRouter's *Multimodal Decisions* page (not yet live-tested):

- Image part goes **inside the `state` array**:
  `{ "type": "image_url", "image_url": { "url": "data:image/png;base64,…" } }`; `state` may mix
  strings/objects and image parts.
- **Jev**: each image 256–1,568 px per side, 78,400–2,458,624 pixels total, PNG/JPEG ≤ 16 MiB;
  images count as normal input tokens. Below minimum → `400`; above limits → `413`.
- **Clef / Clef Flash** (Workers AI): estimate ≈ 4 base64 chars per token, `413` past a 65,536
  token window, so keep each image **< 300 KB**. **Clef reads only roughly the first 2,000 tokens
  of text in `state` and silently drops the rest** (relevant to the text arm's history/FEN).
- **Mercury Decide**: a 7 MB JPEG is accepted and billed as ~1,000 input tokens.
- Image-capable decision models in the catalog today (input `image`): jev-1.13/1.14, liquid d1,
  d1.1, d1-ultra, cloudflare clef, clef-flash, clef-omni, inception mercury-decide, perplexity
  pplx-decider(-flash) v1.2, respan span-02, nace drex-max, scaledown classify-1,
  openai gpt-6-luna-decisions.
- Renderer built and checked by eye: 512×512 PNG ≈ 38 KB (resvg, cburnett pieces).
- Live results: see §9 once run.
