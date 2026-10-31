# Bench run rest-clean-v1-20261031-0455

Plan `bench/plans/rest-clean-v1.json` (sha256 f62e8be7c8e9abe8…) · seed rest-clean-v1-20261031-0455 · judge depth 14 · concurrency 2
Ladder v2 (calibrated) · size standard (50) · caps $1.0000 per series, $6.0000 per run
Ran 2026-10-31 04:55 UTC → 2026-10-31 06:46 UTC (1 h 51 min) · node 22.22.0 · Stockfish Stockfish 16 · git bad648d
**Spend $0.0638 of $6.0000** · 13 cells: 1 finished · 165 games · 3 aborted

| Model · arm | Series | Elo (95 %) | W-D-L | Score | ACPL | Acc. | Blunders | Cost | Games |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| **Pplx Decider Flash V1.2 · clean** | `01M68501M3…` | **297 ± 126** (169–420) | 12-2-26 | 33 % | 316.4 | 65.2 % | 29.1 % | $0.0101 | 40 |
| **Span 02 · clean** | `01M68501S1…` | **354 ± 122** (231–475) | 13-5-22 | 39 % | 270.2 | 68.1 % | 25.7 % | $0.0075 | 40 |
| **Mercury Decide · clean** | `01M68501ZV…` | **247 ± 139** (108–385) | 11-3-21 | 36 % | 304.0 | 70.1 % | 26.6 % | $0.0238 | 35 |
| **Pplx Decider V1.2 · clean** | `01M6850260…` | **494 ± 108** (387–602) | 22-1-27 | 45 % | 253.0 | 72.3 % | 22.2 % | $0.0220 | 50 |
| **Clef Flash · clean** | `01M68D2E92…` | — | 0-0-0 | — | — | — | — | $0.0004 | 0 |
| **Drex V1.5 · clean** | — | — | 0-0-0 | — | — | — | — | $0.0000 | 0 |
| **Jev 1.13 · clean** | — | — | 0-0-0 | — | — | — | — | $0.0000 | 0 |
| **Solar Decide · clean** | — | — | 0-0-0 | — | — | — | — | $0.0000 | 0 |
| **Solar Decide Flash · clean** | — | — | 0-0-0 | — | — | — | — | $0.0000 | 0 |
| **Drex Max · clean** | — | — | 0-0-0 | — | — | — | — | $0.0000 | 0 |
| **Drex V2.0 · clean** | — | — | 0-0-0 | — | — | — | — | $0.0000 | 0 |
| **Jev 1.14 · clean** | — | — | 0-0-0 | — | — | — | — | $0.0000 | 0 |
| **D1 Ultra · clean** | — | — | 0-0-0 | — | — | — | — | $0.0000 | 0 |

## Ladder walk

| Model · arm | uci1320 | eps50 | random | eps75 |
| --- | ---: | ---: | ---: | ---: |
| Pplx Decider Flash V1.2 · clean | 0 % | 0 % | 90 % | 0 % |
| Span 02 · clean | 0 % | 0 % | 90 % | 0 % |
| Mercury Decide · clean | 0 % | 0 % | 0 % | 10 % |
| Pplx Decider V1.2 · clean | 0 % | 20 % | — | 60 % |
| Clef Flash · clean | 0 % | — | — | — |
| Drex V1.5 · clean | — | — | — | — |
| Jev 1.13 · clean | — | — | — | — |
| Solar Decide · clean | — | — | — | — |
| Solar Decide Flash · clean | — | — | — | — |
| Drex Max · clean | — | — | — | — |
| Drex V2.0 · clean | — | — | — | — |
| Jev 1.14 · clean | — | — | — | — |
| D1 Ultra · clean | — | — | — | — |

## Not finished

- cell 0 (perplexity/pplx-decider-flash-v1.2#clean, running) running at 40/50 games, $0.0101
- cell 1 (respan/span-02#clean, running) running at 40/50 games, $0.0075
- cell 2 (inception/mercury-decide#clean, running) running at 35/50 games, $0.0238
- cell 4 (cloudflare/clef-flash#clean, failed) stopped_error at 0/50 games, $0.0004 — too_many_aborts
- cell 5 (nace-ai/drex-v1.5#clean, pending) created at 0/50 games, $0.0000
- cell 6 (typesafe/jev-1.13#clean, pending) created at 0/50 games, $0.0000
- cell 7 (upstage/solar-decide#clean, pending) created at 0/50 games, $0.0000
- cell 8 (upstage/solar-decide-flash#clean, pending) created at 0/50 games, $0.0000
- cell 9 (nace-ai/drex-max#clean, pending) created at 0/50 games, $0.0000
- cell 10 (nace-ai/drex-v2.0#clean, pending) created at 0/50 games, $0.0000
- cell 11 (typesafe/jev-1.14#clean, pending) created at 0/50 games, $0.0000
- cell 12 (liquid/d1-ultra#clean, pending) created at 0/50 games, $0.0000

## Provenance

- plan: `bench/plans/rest-clean-v1.json` sha256 f62e8be7c8e9abe8e8c3fdbc149181499709f0e55810b66dd5a12ee4283f3cc3 · seed rest-clean-v1-20261031-0455 · host `vm`
- ladder: /home/user/ChessDecide/data/ladder/ladder-v2.json · stop reason: sliced
