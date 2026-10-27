# ChessDecide — research notes & protocol facts

Verified 2026-10-27 against live docs and the public OpenRouter catalog. Re-verify before
building — the Decisions API is alpha and model slugs churn.

Locked (v3): v1 uses **all legal moves** as choice options, decision models only, and rates
each model by Elo from a series of games against a Stockfish ladder. Text models are parked in
`TEXT_ARM.md`; the same-position Compare tool is dropped from v1.

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

## 2. Chat Completions comparison modes — parked

Text-model protocol notes (forced tool call, JSON schema, free text, reasoning budgets, the six
standard models and their catalog reasoning settings) moved to [`TEXT_ARM.md`](TEXT_ARM.md). Nothing
in v1 calls `/api/v1/chat/completions`.

---

## 3. Toolchain facts

- Stockfish: **installed** (Homebrew, Stockfish 19) and verified. UCI over stdin/stdout.
  Options for the opponent: `UCI_LimitStrength=true` + `UCI_Elo` (1320–3190; **1320 is the
  floor**, weaker levels come from our ε-random ladder levels). Nominal `UCI_Elo` is calibrated for
  different time controls than ours, so the ladder is re-measured (`METRICS.md` B2). For judging: full strength, `Threads=1`, `Hash=64`.
  `UCI_ShowWDL=true` gives win/draw/loss probabilities (better than raw cp).
- python-chess 1.11 (via `uv run --with chess`) used for the M0 spikes; the real backend will
  use the chess library below.
- (Superseded by the TypeScript stack, see `ARCHITECTURE.md`; the Go-library checks below are kept as history.) Go 1.26 installed; `github.com/corentings/chess/v2` v2.6.1 verified:
  `chess.FEN(fen)`, `game.ValidMoves() []Move`, `chess.AlgebraicNotation{}.Encode(pos, m)`,
  `UCINotation{}.Encode`, `pos.Turn()`, `pos.Board()`, `game.PushMove(san, nil)`.
  Move tags: `Capture`, `EnPassant`, `Check`, `KingSideCastle`, `QueenSideCastle`.
  No explicit mate tag → use `game.Outcome()` / `pos.Status()` to add `#`.
- Node 26 / Bun installed. SvelteKit + Vite (now also hosting the API routes).
- Board: `chessground@9.2.1` (framework-agnostic lichess board) + `chessground.base.css` and a
  theme. Frontend does not need chess rules (the server/core owns the game), only FEN/highlights/shapes.

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
