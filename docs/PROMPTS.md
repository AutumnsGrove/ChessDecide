# ChessDecide — Request builders (verbatim spec)

This is the experiment. Builders must be pure functions, covered by **golden tests** (a
fixture position → exact JSON bytes). Any change bumps `PROMPT_VERSION`, which is stored on
every attempt. `PROMPT_VERSION = 3` (v3: `clean` is fully bare; `image` arm added; TypeScript).

## 1. Inputs

- `fen` — position FEN
- `history_san` — full SAN history from the game's start (may be empty for suite positions)
- `legal` — all legal moves, each with canonical `uci`, `san`, and board context
- `arm` — `{interface: text|image, key_format: uci|san, descriptor: plain|annotated, state_variant: slim|full, template}`
- `order` — `sorted` (default) | `reverse` | `shuffle(seed)`

**Canonical move id = UCI.** Castling is the king move (`e1g1`), promotions carry a lowercase
piece letter (`e7e8q`). SAN is derived with standard disambiguation and `+`/`#` suffixes.

## 2. Option order

1. Sort `legal` by UCI string ascending (this is `sorted`).
2. `reverse` reverses it; `shuffle(seed)` applies a Fisher–Yates shuffle driven by `mulberry32(seed)` (the reference implementation is in `packages/core/rng.ts`; tests pin its output).
3. JSON object keys are emitted **in this order** (JavaScript object insertion order; none of the keys are integer-like, so order is preserved; build the body with an ordered array of entries and `Object.fromEntries`). Order is stored as `order_json` (array of UCI).

## 3. Option key

| `key_format` | key |
| --- | --- |
| `uci` | `e2e4`, `e1g1`, `e7e8q` |
| `san` | `e4`, `O-O`, `Qxf7#`, `exd6`, `e8=Q+` |

The builder keeps a `key → uci` map; the response `choice` and `probabilities` keys are mapped
back to UCI through it. An unknown key is an error `invalid_choice` (retry once, then fail).

## 4. Option description

Piece names are lowercase in running text; the first word of a description is capitalised.
Squares are lowercase algebraic.

**`plain`** (the `clean` arm: **fully bare**, no capture, check or mate information):

| Case | Pattern | Example |
| --- | --- | --- |
| Any non-promotion move | `{Piece} {from} to {to}` | `Knight g1 to f3`, `Queen h5 to f7`, `Pawn e5 to d6` |
| Castling | `King {from} to {to}` | `King e1 to g1` |
| Promotion | append `, promotes to {piece}` (needed to tell `e7e8q` from `e7e8n`) | `Pawn e7 to e8, promotes to queen` |

So a capture, an en passant capture and a quiet move look identical in form. The model must work
out from the position what each move does.

**`annotated`** (the `hinted` arm) = `plain` plus, in this order: `, captures {piece}` (or
`, captures pawn en passant`), `, castles {kingside|queenside}`, `, promotes to {piece}`, then a
trailing `, check` or `, checkmate` (checkmate replaces check). Examples:
`Queen h5 to f7, captures pawn, checkmate`; `King e1 to g1, castles kingside`;
`Pawn d7 to c8, captures rook, promotes to queen`. Stalemate and other outcomes are never annotated.

## 5. State

Serialise with **this exact key order** (object literal insertion order).

`slim` (default):

```json
{
  "game": "chess",
  "fen": "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4",
  "side_to_move": "white",
  "move_number": 4,
  "history_san": ["e4", "e5", "Qh5", "Nc6", "Bc4", "Nf6"]
}
```

- `history_san` = the last **16** plies. `history_len=full` is an ablation. Empty → `[]`.
- `hinted` arm additionally includes `"in_check": true|false` after `move_number`
  (a derived fact; omitted from `clean` and `image` to keep them hint-free).

`full` (ablation) adds `"legal_moves"` after `history_san`:

```json
"legal_moves": [{ "uci": "h5f7", "desc": "Queen h5 to f7" }]
```

(`hinted` entries also carry `"san"`.) This duplicates the criteria and roughly doubles
tokens; it exists only to check that `slim` loses nothing.

## 6. Question

`instructions` by `template`:

| Template | Text (`{Side}` = `White` or `Black`) |
| --- | --- |
| `neutral` (default) | `Choose the strongest legal chess move for {Side} in this position.` |
| `instructive` | `Choose the strongest legal chess move for {Side} in this position. Avoid losing material; prioritize checks, captures, and threats.` |
| `minimal` | `Best move?` |

```json
"questions": {
  "move": { "type": "choice", "instructions": "<template text>", "criteria": { "<key>": "<description>", "...": "..." } }
}
```

Only `move` is sent in games, series and position-suite Task A. Task B/C (M5) add
`eval` (`score`: `["losing","worse","equal","better","winning"]`) and `mate`
(`noul`, criteria `{"true": "A forced mate exists.", "false": "No forced mate."}`).

## 7. Request

```
POST https://openrouter.ai/api/alpha/decisions
Authorization: Bearer $OPENROUTER_API_KEY
Content-Type: application/json
X-Title: ChessDecide
```

```json
{ "model": "<canonical_slug>", "state": { ... }, "questions": { ... } }
```

Add `session_id` only when explicitly configured (never in benchmarks). Do not send `user`.
Timeout 60 s per HTTP call.

### Worked example (`clean` arm, mate in 1, options trimmed to 3)

```json
{
  "model": "typesafe/jev-1.14",
  "state": {
    "game": "chess",
    "fen": "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4",
    "side_to_move": "white",
    "move_number": 4,
    "history_san": ["e4", "e5", "Qh5", "Nc6", "Bc4", "Nf6"]
  },
  "questions": { "move": {
    "type": "choice",
    "instructions": "Choose the strongest legal chess move for White in this position.",
    "criteria": {
      "c4b5": "Bishop c4 to b5",
      "h5f7": "Queen h5 to f7",
      "h5h4": "Queen h5 to h4"
    }
  } }
}
```

The `hinted` arm for the same position uses keys `Bb5`, `Qxf7#`, `Qh4` and the description
`Queen h5 to f7, captures pawn, checkmate`, with `"in_check": false` in the state. In the `clean`
arm the description is `Queen h5 to f7` (no "captures pawn").

## 8. Response handling

Validate in this order; any failure is a typed error stored on the attempt:

1. HTTP 2xx and JSON object, else `http_error` / `bad_json`.
2. `answers.move` exists and `type == "choice"` → else `missing_answer` / `unexpected_type`
   (never default).
3. `choice` ∈ keys → else `invalid_choice`.
4. `probabilities` is optional: if present, every key must be known (unknown → `invalid_probs`),
   values in [0,1]. Store the raw sum; renormalise for metrics; set `prob_sum_warn` if the sum
   ∉ [0.9, 1.1].
5. `usage.input_tokens`, `usage.output_tokens`, `usage.cost` recorded (missing → null, not 0).
6. Record `id`, returned `model`, `provider`.

## 8b. Forced moves

A `choice` question needs at least 2 options (D1, D1 Ultra and Clef return HTTP 422 for one). When
`legal.length === 1` the game plays that move **without calling the model**: no attempt row, no
cost, `decision` is `null` and the ply is flagged `forced: true`. Forced plies are excluded from
ACPL, acceptable-rate and calibration metrics.

## 9. Retry, rate limit, cache

- **Retry** HTTP 429 / 5xx / network errors up to **3 attempts**: waits 1 s, 2 s, 4 s (±20 %
  jitter), honouring `Retry-After` when present. Other 4xx: no retry. `invalid_choice`:
  retry once. Every HTTP call is its own `attempts` row linked by `retry_of`.
- **Rate limit:** per model slug a semaphore of **2** concurrent calls and ≤ 4 req/s; on a 429,
  halve concurrency (min 1) for 60 s.
- **Cache key:** `sha256(model || 0x00 || exact request body bytes || 0x00 || repeat)`. A hit
  returns the stored response, writes an `attempts` row with `cache_hit=1`, `cost_usd=0`.
  "Re-run (paid)" and repeats `> 0` bypass/extend the key as above.

## 10. Estimator (used before any paid action)

```
est_input_tokens = 400 + 45 * n_options        # slim
                 = 400 + 75 * n_options        # full
est_cost         = est_input_tokens / 1e6 * price_in_per_m
```

Replaced by the rolling mean of real `usage.input_tokens` for the same (model, arm, state
variant) once at least 20 non-cached attempts exist. A pre-flight check also disables a model
in the UI if `est_input_tokens` > 80 % of its context length.

## 11. Fixtures required (M1)

Store under `packages/core/test/fixtures/prompts/`:

- `mate1.fen`, `quiet_italian.fen`, `startpos.fen`, `promotion.fen`, `enpassant.fen`,
  `castling.fen`, `in_check.fen` with the expected JSON for both default arms
  (`*.clean.json`, `*.hinted.json`) — byte-exact.
- Recorded Decisions responses from M0 for the response-handling tests (strip keys/ids).

## 12. Image arm (`interface: image`)

A separate arm; never merged with text arms.

- **State.** No FEN and no `history_san`. The position is one rendered board image. The text
  `state` carries only what the picture cannot: `{"game":"chess","side_to_move":"white","move_number":4}`.
- **Image.** Server-rendered SVG → PNG, 512×512, standard orientation (White at the bottom),
  cburnett pieces, rank/file coordinates, last-move highlight **off** (it would hint), no arrows,
  no check highlight. Deterministic bytes for a fixed position (hash pinned in a test).
- **Question.** Same `choice` question and the same **bare** `plain` options and UCI keys as `clean`;
  `instructions` use the `neutral` template with the lead-in `This image shows the current position.`
- **Request shape** (OpenRouter's Multimodal Decisions docs; **live-verified** on 6 models in `SPIKE.md` §9):
  `state` is an **array**: `[ {game, side_to_move, move_number}, {"type":"image_url","image_url":{"url":"data:image/png;base64,…"}} ]`.
  Jev needs 256–1,568 px per side; Clef needs the image under ~300 KB. 512×512 PNG ≈ 38 KB satisfies both.
- **Caveats.** Jev switches to long-context mode for any image (slower, possibly less accurate), so
  the arm's rating is a measure of "picture + options", not of chess alone. Input tokens per image
  are measured in S2 and folded into the estimator.
