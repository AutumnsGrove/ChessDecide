# ChessDecide — research notes & protocol facts

Verified 2026-10-27 against live docs and the public OpenRouter catalog. Re-verify before
building — the Decisions API is alpha and model slugs churn.

Locked: v1 uses **all legal moves** as choice options, all four text protocols, and Play +
Compare as the first GUI. Batch benchmark comes after.

---

## 1. Decisions API

### Endpoint

```
POST https://openrouter.ai/api/alpha/decisions
Authorization: Bearer $OPENROUTER_API_KEY
Content-Type: application/json
```

Not under `/api/v1`. Raw `fetch`/`http.Client` is the safest integration; the official SDKs
expose it as `alpha.decisions.create` / `alpha.Decisions.Create`.

### Request

```json
{
  "model": "typesafe/jev-1.14",
  "state": { "fen": "...", "side_to_move": "white", "...": "..." },
  "questions": {
    "move": {
      "type": "choice",
      "instructions": "Choose the strongest legal chess move for White.",
      "criteria": {
        "O-O": "castle kingside (e1g1): king to g1, rook to f1",
        "Nxe5": "knight f3 captures pawn on e5 (f3e5)"
      }
    },
    "eval": {
      "type": "score",
      "instructions": "How good is this position for White?",
      "criteria": ["losing", "worse", "equal", "better", "winning"]
    },
    "mate": {
      "type": "noul",
      "instructions": "Does White have a forced mate in two or fewer moves?",
      "criteria": { "true": "A forced mate exists.", "false": "No forced mate." }
    }
  },
  "session_id": "game-abc",
  "user": "local"
}
```

Optional top-level: `session_id`, `trace`, `user`, `provider`. `instructions` and criteria
values may be strings or JSON structures.

- `choice.criteria`: map of option → description.
- `noul.criteria`: optional, exactly `true`/`false`.
- `score.criteria`: ordered array, lowest first.
- `box`: Jev 1.14 only; no criteria.

### Response

```json
{
  "id": "gen-dec-1790265859-EaXKST7hul1Wcqots1ZK",
  "model": "typesafe/jev-1.14-20261001",
  "provider": "TypeSafe",
  "answers": {
    "move": {
      "type": "choice",
      "choice": "Nxe5",
      "probabilities": { "O-O": 0.01, "Nxe5": 0.78, "...": 0 },
      "confidence": 0.67
    },
    "eval": { "type": "score", "score": 2.1, "probabilities": { "0": 0, "1": 0.1, "...": 0 }, "legend": { "0": "losing", "...": "winning" }, "confidence": 0.8 },
    "mate": { "type": "noul", "noul": 0.04 }
  },
  "usage": { "input_tokens": 476, "output_tokens": 70, "cost": 0.000019992 }
}
```

- `usage.cost` USD; output tokens present but output is free.
- `probabilities` / `confidence` / `legend` are optional in the schema — presence-check.
- Treat missing answer keys or unexpected `type` as errors, never defaults.
- Record the returned `model` (exact build) and `id`.

### Known limits / gotchas

- `typesafe/jev-1.14`: 262,144 ctx. **> ~32,000 bytes of text, or any image, triggers
  TypeSafe long-context mode** (slower, less accurate). A 40-option chess request is ~2–4 KB,
  so we are far under — good.
- `jaredpalmer/kev-4b`: 8,192 ctx — filter out if state+criteria is too big.
- Model must have `architecture.output_modalities` containing `decisions`; use
  `GET /api/v1/models?output_modalities=decisions`.
- Provider-level context/max-prompt limits can be lower than the model headline.
- Pin `canonical_slug`; never ship `~latest` aliases in a benchmark.
- No documented max number of criteria. **This is the #1 spike.**
- No documented temperature/seed. **Determinism is the #2 spike.**
- No documented order guarantee for criteria keys. **Order bias is the #3 spike.**

### Cost math (order of magnitude: ~1k input tokens)

Measured on real chess requests: a 36-option position is **1.6–2.7k input tokens** and costs
roughly **$0.00007–$0.00020 per decision**; 63 options is **2.8–4.4k tokens**. Prices below
are per 1k decisions at ~1k tokens, so double them for a realistic 40-option request.

| Model | Input $/M | ≈ $/1k decisions | Context | Inputs |
| --- | --- | --- | --- | --- |
| `perplexity/pplx-decider-flash-v1.2` | 0.010 | 0.009 | 262k | text+image |
| `perplexity/pplx-decider-v1.2` | 0.020 | 0.018 | 262k | text+image |
| `respan/span-02` | 0.010 | 0.009 | 131k | text |
| `inception/mercury-decide` | 0.020 | 0.018 | 65k | text+image |
| `liquid/d1` | 0.020 | 0.018 | 65k | text+image |
| `cloudflare/clef-flash` | 0.019 | 0.017 | 24k | text+image |
| `typesafe/jev-1.13` / `1.14` | 0.042 | 0.038 | 262k | text+image |
| `microsoft/microsoft-decision-1` | 0.042 | 0.038 | 32k | text |
| `liquid/d1-ultra` | 0.042 | 0.038 | 32k | text+image |
| `cloudflare/clef` | 0.042 | 0.038 | 65k | text+image |
| `cloudflare/clef-omni` | 0.150 | 0.135 | 65k | text+image+audio+video |
| `openai/gpt-6-luna-decisions` | 0.100 | 0.090 | 1.05M | text+image |
| `nace-ai/drex-*` | 0.040–0.060 | 0.036–0.054 | 131k–262k | text |
| `upstage/solar-decide*` | 0.050 | 0.045 | 524k | text |
| `scaledown/classify-1` | 0.040 | 0.036 | 1M | text |
| `baseten/*`, `respan/*-lite` | free | 0 | 16k / n.a. | text |

Full live list: `curl "https://openrouter.ai/api/v1/models?output_modalities=decisions"`.
The catalog is public — no key needed for the dropdown.

---

## 2. Chat Completions comparison modes

`POST https://openrouter.ai/api/v1/chat/completions` (OpenAI-compatible).

- **chat_text**: messages `[{role:"system",...},{role:"user",...}]`, temperature 0, parse SAN
  from the reply, retry on invalid/illegal.
- **chat_tool**: forced function call:

```json
{
  "tools": [{
    "type": "function",
    "function": {
      "name": "make_move",
      "parameters": {
        "type": "object",
        "properties": { "move": { "type": "string", "enum": ["e4", "d4", "..."] } },
        "required": ["move"]
      }
    }
  }],
  "tool_choice": { "type": "function", "function": { "name": "make_move" } },
  "temperature": 0
}
```

Parse `choices[0].message.tool_calls[0].function.arguments`. This is the closest analog to the
Decisions API `choice` primitive and the fairest text-vs-decision comparison.

- **Provider fallback:** not every provider supports a forced named `tool_choice`. Meta's
  `muse-spark-1.3-contributor` returns 400 ("only `auto` is supported"). Try forced, then
  `tool_choice:"auto"`, then JSON schema. Keep `provider.require_parameters=true` for
  tool/JSON modes.

- **chat_json**: `response_format: {type:"json_schema", json_schema:{...}}`; same idea, no tool
  call. Useful for models that support structured outputs but not tools.

- **Image mode**: `state`/message content part
  `{"type":"image_url","image_url":{"url":"data:image/png;base64,..."}}`. `corentings/chess/v2`
  has an `image` subpackage that can render boards to PNG server-side.

### Standard text models (locked)

All six support tools + structured outputs and are reasoning-capable. Settings must be read
from the live catalog (`model.reasoning`), not assumed.

| Model | In $/M | Out $/M | Context | Supported reasoning | Default | Mandatory |
| --- | --- | --- | --- | --- | --- | --- |
| `deepseek/deepseek-v4.1-flash-1017` | 0.15 | 0.60 | 1.05M | max, high, low, none | high | no |
| `anthropic/claude-haiku-5.5` | 0.10 | 0.50 | 1M | max, xhigh, high, medium, low, none | medium | no |
| `openai/gpt-6-luna` | 0.10 | 0.50 | 1.05M | max, xhigh, high, medium, low, none | medium | no |
| `xiaomi/mimo-v2.6-flash` | 0.14 | 0.28 | 1.05M | (not exposed) | on | no |
| `z-ai/glm-5.3-flash` | 0.15 | 0.50 | 1.05M | max, high, low | max | yes |
| `meta/muse-spark-1.3-contributor` | 0.10 | 0.20 | 1.05M | max, xhigh, high, medium, low, minimal | medium | yes |

Reasoning is billed as output. `effort` is only honored by some providers; `max_tokens` caps
are supported by others. Observations:

- DeepSeek `effort:none` → `Bxf7+` in 1.2 s for $0.000024; `effort:low`, 16k cap → `Re1` in
  24.5 s for $0.0033.
- Mimo ignores effort; with default reasoning it burned 16,384 tokens and returned no move.
  Disabling reasoning (`enabled:false`) → `d4` in 1.4 s for $0.000002.
- If reasoning consumes the whole budget, `finish_reason=length` and content is empty. One
  nudge call ("Output only your move in SAN", reasoning off) usually recovers it.

**Protocol:** primary arm = lowest supported effort; secondary = default effort. Set
`max_tokens=16384` with reasoning on, `1024` with it off. Record effort, max_tokens,
reasoning_tokens, and provider.

---

## 3. Toolchain facts

- Stockfish: **installed** (Homebrew, Stockfish 19) and verified. UCI over stdin/stdout.
  Options for the opponent: `UCI_LimitStrength=true` + `UCI_Elo` (1320–3190), or
  `Skill Level 0–20`. For judging: full strength, `Threads=1`, `Hash=64`.
  `UCI_ShowWDL=true` gives win/draw/loss probabilities (better than raw cp).
- python-chess 1.11 (via `uv run --with chess`) used for the M0 spikes; the real backend will
  use the Go library below.
- Go 1.26 installed; `github.com/corentings/chess/v2` v2.6.1 verified:
  `chess.FEN(fen)`, `game.ValidMoves() []Move`, `chess.AlgebraicNotation{}.Encode(pos, m)`,
  `UCINotation{}.Encode`, `pos.Turn()`, `pos.Board()`, `game.PushMove(san, nil)`.
  Move tags: `Capture`, `EnPassant`, `Check`, `KingSideCastle`, `QueenSideCastle`.
  No explicit mate tag → use `game.Outcome()` / `pos.Status()` to add `#`.
- Node 26 / Bun installed. SvelteKit + Vite with `/api` proxy to Go.
- Board: `chessground@9.2.1` (framework-agnostic lichess board) + `chessground.base.css` and a
  theme. Frontend does not need chess rules (Go owns the game), only FEN/highlights/shapes.

---

## 4. Prior art worth stealing from

- **ChessArena (ACL 2026)**: move selection as the clean eval; reports Top Mv%, Illegal Mv%,
  format rate; uses SF top-3 for data quality. We adopt top-1/top-3 and illegal/parse rates.
- **CPL papers (2026)**: Average Centipawn Loss + illegal-move rate across in-distribution /
  near / out-of-distribution positions; shows ACPL varies ~5× by familiarity. We should
  stratify positions by how common they are (opening book vs. random).
- **Stanford chess LLM report**: top-3 accuracy, ACPL at depth 15; precedent for our metrics.
- **DeepMind ChessBench / searchless_chess**: name collision avoided by renaming this project
  to **ChessDecide**. Their benchmark is 10M games with SF annotations for supervised learning,
  not an LLM eval harness.

---

## 5. Spike checklist (M0) — done 2026-10-27

See [`SPIKE.md`](SPIKE.md) for results. Scripts in `spikes/`; no key stored.

1. **One position, four models** — done (startpos, all picked e4).
2. **Option-count sweep** — 63 options accepted, flat latency, P sums ~1.
3. **Determinism** — pick stable 5/5, probabilities drift up to ~0.02.
4. **Order/key sensitivity** — order preserved, pick invariant, P(pick) shifts ±0.08.
5. **State shape** — not tested yet (object only).
6. **Parallel questions** — `choice` + `score` + `noul` all returned.
7. **Text equivalents** — all three modes work; reasoning budget is the failure mode.
8. **Stockfish** — best move, eval, WDL, CPL, Elo ladder verified.
9. **Game loop dry-run** — pending (first task of M1).

Remaining before the GUI: game-loop dry run, session reuse probe, image probe.
