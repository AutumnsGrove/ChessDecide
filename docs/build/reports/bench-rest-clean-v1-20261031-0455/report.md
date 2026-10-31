# Bench run rest-clean-v1-20261031-0455

Plan `bench/plans/rest-clean-v1.json` (sha256 f62e8be7c8e9abe8…) · seed rest-clean-v1-20261031-0455 · judge depth 14 · concurrency 2
Ladder v2 (calibrated) · size standard (50) · caps $1.0000 per series, $6.0000 per run
Ran 2026-10-31 04:55 UTC → 2026-10-31 06:46 UTC (1 h 51 min) · node 22.22.0 · Stockfish Stockfish 16 · git bad648d
**Spend $0.0775 of $6.0000** · 13 cells: 2 finished · 196 games · 4 aborted

| Model · arm | Series | Elo (95 %) | W-D-L | Score | ACPL | Acc. | Blunders | Cost | Games |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| **Pplx Decider Flash V1.2 · clean** | `01M68501M3…` | **266 ± 116** (147–379) | 13-2-32 | 30 % | 317.0 | 64.9 % | 29.2 % | $0.0119 | 47 |
| **Span 02 · clean** | `01M68501S1…` | **311 ± 109** (201–418) | 15-5-30 | 35 % | 279.9 | 67.4 % | 26.3 % | $0.0089 | 50 |
| **Mercury Decide · clean** | `01M68501ZV…` | **260 ± 129** (131–389) | 13-5-21 | 40 % | 299.7 | 70.7 % | 25.9 % | $0.0290 | 39 |
| **Pplx Decider V1.2 · clean** | `01M6850260…` | **494 ± 108** (387–602) | 22-1-27 | 45 % | 253.0 | 72.3 % | 22.2 % | $0.0220 | 50 |
| **Clef Flash · clean** | `01M68D2E92…` | — | 0-0-0 | — | — | — | — | $0.0005 | 0 |
| **Drex V1.5 · clean** | `01M68D7NXH…` | **414 ± 328** (75–730) | 1-0-9 | 10 % | 210.0 | 73.0 % | 21.0 % | $0.0053 | 10 |
| **Jev 1.13 · clean** | — | — | 0-0-0 | — | — | — | — | $0.0000 | 0 |
| **Solar Decide · clean** | — | — | 0-0-0 | — | — | — | — | $0.0000 | 0 |
| **Solar Decide Flash · clean** | — | — | 0-0-0 | — | — | — | — | $0.0000 | 0 |
| **Drex Max · clean** | — | — | 0-0-0 | — | — | — | — | $0.0000 | 0 |
| **Drex V2.0 · clean** | — | — | 0-0-0 | — | — | — | — | $0.0000 | 0 |
| **Jev 1.14 · clean** | — | — | 0-0-0 | — | — | — | — | $0.0000 | 0 |
| **D1 Ultra · clean** | — | — | 0-0-0 | — | — | — | — | $0.0000 | 0 |

## Separated pairs (METRICS.md B6)

| A vs B | P(A stronger) | Elo gap (95 %) | Verdict |
| --- | ---: | --- | --- |
| Span 02 · clean vs Pplx Decider V1.2 · clean | 0.9 % | −183 (−336 … −32) | **separated** |

## Ladder walk

| Model · arm | uci1320 | eps50 | random | eps75 |
| --- | ---: | ---: | ---: | ---: |
| Pplx Decider Flash V1.2 · clean | 0 % | 0 % | 90 % | 0 % |
| Span 02 · clean | 0 % | 0 % | 90 % | 0 % |
| Mercury Decide · clean | 0 % | 0 % | 75 % | 10 % |
| Pplx Decider V1.2 · clean | 0 % | 20 % | — | 60 % |
| Clef Flash · clean | 0 % | — | — | — |
| Drex V1.5 · clean | 0 % | 20 % | — | 0 % |
| Jev 1.13 · clean | — | — | — | — |
| Solar Decide · clean | — | — | — | — |
| Solar Decide Flash · clean | — | — | — | — |
| Drex Max · clean | — | — | — | — |
| Drex V2.0 · clean | — | — | — | — |
| Jev 1.14 · clean | — | — | — | — |
| D1 Ultra · clean | — | — | — | — |

## Not finished

- cell 0 (perplexity/pplx-decider-flash-v1.2#clean, running) running at 47/50 games, $0.0119
- cell 2 (inception/mercury-decide#clean, running) running at 39/50 games, $0.0290
- cell 4 (cloudflare/clef-flash#clean, failed) stopped_error at 0/50 games, $0.0005 — too_many_aborts
- cell 5 (nace-ai/drex-v1.5#clean, running) running at 10/50 games, $0.0053
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
