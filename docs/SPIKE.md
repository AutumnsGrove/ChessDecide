# M0 spike findings

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
