# Text-model arm — DEFERRED (not in v1, not in any default path)

Status: **parked**. Built so it *can* be added when there is time and money; v1 ships no text
provider, no text UI and no text spend. The architecture already leaves room: the
`MoveProvider` interface, the `arm` concept, and attempt columns (`provider`, `returned_model`,
`session_id`, `order_json`) are generic. A text arm adds columns (`reasoning_effort`,
`max_tokens`, `reasoning_tokens`, `finish_reason`, `nudge`) in a new migration.

Cost warning from M0: text models were **10–40× more expensive** and **3–50× slower** once
reasoning is on. A full text arm (6 models × 3 protocols × 2 reasoning arms × 400 positions)
is ~50k calls — roughly **$80–$270** and a day of wall-clock at reasoning-on latencies.
If this is ever built: N=1 (temperature 0), a 100-position subset for the reasoning-on arm,
and a hard budget cap like everything else.

---

## 1. Interfaces

| Mode | Interface | Notes |
| --- | --- | --- |
| `chat_text` | Chat Completions, free text | parse SAN from reply |
| `chat_tool` | forced function call, `enum` of legal moves | closest analogue of `choice` |
| `chat_json` | `response_format: json_schema` with `enum` | structured-decoding cousin |
| `chat_image` / `decisions_image` | board PNG | vision-capable models only |

Same information as the decision arm (same state, same descriptors), same option order.
A `blind` variant (no legal-move list) measures how much the list helps text models.

Parser spec for `chat_text`: strip markdown; accept SAN with or without `+`/`#`, `0-0`/`O-O`,
`=Q`/`Q` promotions, and UCI as fallback; prefer the last move-looking token after a
`Move:` label; the result must match exactly one legal move, else a parse failure.

## 2. Standard models (locked when the arm was designed)

| Model | In $/M | Out $/M | Context | Supported reasoning | Default | Mandatory |
| --- | --- | --- | --- | --- | --- | --- |
| `deepseek/deepseek-v4.1-flash-1017` | 0.15 | 0.60 | 1.05M | max, high, low, none | high | no |
| `anthropic/claude-haiku-5.5` | 0.10 | 0.50 | 1M | max, xhigh, high, medium, low, none | medium | no |
| `openai/gpt-6-luna` | 0.10 | 0.50 | 1.05M | max, xhigh, high, medium, low, none | medium | no |
| `xiaomi/mimo-v2.6-flash` | 0.14 | 0.28 | 1.05M | (not exposed) | on | no |
| `z-ai/glm-5.3-flash` | 0.15 | 0.50 | 1.05M | max, high, low | max | yes |
| `meta/muse-spark-1.3-contributor` | 0.10 | 0.20 | 1.05M | max, xhigh, high, medium, low, minimal | medium | yes |

Read settings from the live catalog (`model.reasoning`), do not assume.

## 3. Protocol (from M0 failures)

- **Reasoning is a recorded dimension.** Primary arm: lowest supported effort (`none` for
  DeepSeek/Claude/GPT/Mimo, `low`/`minimal` for GLM/Muse). Secondary: default effort. Never
  mix arms in one leaderboard.
- `max_tokens`: 16384 when reasoning is on, 1024 when off.
- Empty content or `finish_reason=length`: one **nudge** call ("Output only your chosen move
  in SAN"), reasoning off; record both attempts.
- Tool mode: forced `tool_choice`; on the "only `auto` is supported" 400 retry with `auto`; if
  no tool call, fall back to JSON schema. Keep `provider.require_parameters=true`.
- Temperature 0; retry parse failures ≤ 2; count failures separately.
- Transport: 429/5xx backoff, per-provider concurrency cap.

## 4. M0 observations (N=2 positions, illustrative)

- Mate-in-1: all text models found `Qxf7#` (muse tool mode 400'd).
- Quiet Italian: modes disagree — Haiku tool `Bxf7+` (CPL 666) vs text `Bb3` (CPL 16); GLM
  tool `Nxe5` vs text `Ng5`. Forced enums can hurt. Mode must be a leaderboard dimension.
- DeepSeek `none`: `Bxf7+` in 1.2 s, $0.000024; `low` + 16k cap: `Re1` in 24.5 s, $0.0033.
- Mimo ignores effort; default reasoning burned 16,384 tokens and returned nothing.
- Per-move cost $0.000002–$0.0066; the expensive calls were reasoning-heavy or failed.

## 5. What to build if revived

`internal/providers/chat/` implementing `MoveProvider` per mode; a catalog-driven reasoning
resolver; the parser; extra attempt columns; a "Text models" section in the model picker that
is hidden unless `CHESSDECIDE_TEXT_ARM=1`; Compare gains a "text" cell type. All existing
metrics apply unchanged, plus `illegal_rate`, `parse_failure_rate`, `no_answer_rate`,
`reasoning_token_share`.
