# Bench run rest-clean-v1-20261031-0455

Plan `bench/plans/rest-clean-v1.json` (sha256 f62e8be7c8e9abe8…) · seed rest-clean-v1-20261031-0455 · judge depth 14 · concurrency 2
Ladder v2 (calibrated) · size standard (50) · caps $1.0000 per series, $6.0000 per run
Ran 2026-10-31 04:55 UTC → 2026-10-31 06:46 UTC (1 h 51 min) · node 22.22.0 · Stockfish Stockfish 16 · git bad648d
**Spend $0.0830 of $6.0000** · 13 cells: 3 finished · 206 games · 4 aborted

| Model · arm | Series | Elo (95 %) | W-D-L | Score | ACPL | Acc. | Blunders | Cost | Games |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| **Pplx Decider Flash V1.2 · clean** | `01M68501M3…` | **302 ± 109** (192–410) | 16-2-32 | 34 % | 320.3 | 64.9 % | 29.1 % | $0.0128 | 50 |
| **Span 02 · clean** | `01M68501S1…` | **311 ± 109** (201–418) | 15-5-30 | 35 % | 279.9 | 67.4 % | 26.3 % | $0.0089 | 50 |
| **Mercury Decide · clean** | `01M68501ZV…` | **269 ± 127** (142–396) | 14-5-21 | 41 % | 304.3 | 70.9 % | 25.7 % | $0.0304 | 40 |
| **Pplx Decider V1.2 · clean** | `01M6850260…` | **494 ± 108** (387–602) | 22-1-27 | 45 % | 253.0 | 72.3 % | 22.2 % | $0.0220 | 50 |
| **Clef Flash · clean** | `01M68D2E92…` | — | 0-0-0 | — | — | — | — | $0.0005 | 0 |
| **Drex V1.5 · clean** | `01M68D7NXH…` | **409 ± 284** (114–682) | 2-0-10 | 17 % | 209.7 | 71.2 % | 21.7 % | $0.0063 | 12 |
| **Jev 1.13 · clean** | `01M68ERA3B…` | **694 ± 573** (86–1231) | 0-0-4 | 0 % | 97.5 | 75.0 % | 10.7 % | $0.0021 | 4 |
| **Solar Decide · clean** | — | — | 0-0-0 | — | — | — | — | $0.0000 | 0 |
| **Solar Decide Flash · clean** | — | — | 0-0-0 | — | — | — | — | $0.0000 | 0 |
| **Drex Max · clean** | — | — | 0-0-0 | — | — | — | — | $0.0000 | 0 |
| **Drex V2.0 · clean** | — | — | 0-0-0 | — | — | — | — | $0.0000 | 0 |
| **Jev 1.14 · clean** | — | — | 0-0-0 | — | — | — | — | $0.0000 | 0 |
| **D1 Ultra · clean** | — | — | 0-0-0 | — | — | — | — | $0.0000 | 0 |

## Separated pairs (METRICS.md B6)

| A vs B | P(A stronger) | Elo gap (95 %) | Verdict |
| --- | ---: | --- | --- |
| Pplx Decider Flash V1.2 · clean vs Span 02 · clean | 45.5 % | −9 (−163 … +145) | ≈ not separable |
| Pplx Decider Flash V1.2 · clean vs Pplx Decider V1.2 · clean | 0.7 % | −192 (−346 … −40) | **separated** |
| Span 02 · clean vs Pplx Decider V1.2 · clean | 0.9 % | −183 (−336 … −32) | **separated** |

## Ladder walk

| Model · arm | uci1320 | eps50 | random | eps75 |
| --- | ---: | ---: | ---: | ---: |
| Pplx Decider Flash V1.2 · clean | 0 % | 0 % | 90 % | 60 % |
| Span 02 · clean | 0 % | 0 % | 90 % | 0 % |
| Mercury Decide · clean | 0 % | 0 % | 0 % | 10 % |
| Pplx Decider V1.2 · clean | 0 % | 20 % | — | 60 % |
| Clef Flash · clean | 0 % | — | — | — |
| Drex V1.5 · clean | 0 % | 20 % | — | 50 % |
| Jev 1.13 · clean | 0 % | — | — | — |
| Solar Decide · clean | — | — | — | — |
| Solar Decide Flash · clean | — | — | — | — |
| Drex Max · clean | — | — | — | — |
| Drex V2.0 · clean | — | — | — | — |
| Jev 1.14 · clean | — | — | — | — |
| D1 Ultra · clean | — | — | — | — |

## Not finished

- cell 2 (inception/mercury-decide#clean, running) running at 40/50 games, $0.0304
- cell 4 (cloudflare/clef-flash#clean, failed) stopped_error at 0/50 games, $0.0005 — too_many_aborts
- cell 5 (nace-ai/drex-v1.5#clean, running) running at 12/50 games, $0.0063
- cell 6 (typesafe/jev-1.13#clean, running) running at 4/50 games, $0.0021
- cell 7 (upstage/solar-decide#clean, pending) created at 0/50 games, $0.0000
- cell 8 (upstage/solar-decide-flash#clean, pending) created at 0/50 games, $0.0000
- cell 9 (nace-ai/drex-max#clean, pending) created at 0/50 games, $0.0000
- cell 10 (nace-ai/drex-v2.0#clean, pending) created at 0/50 games, $0.0000
- cell 11 (typesafe/jev-1.14#clean, pending) created at 0/50 games, $0.0000
- cell 12 (liquid/d1-ultra#clean, pending) created at 0/50 games, $0.0000

## Provenance

- plan: `bench/plans/rest-clean-v1.json` sha256 f62e8be7c8e9abe8e8c3fdbc149181499709f0e55810b66dd5a12ee4283f3cc3 · seed rest-clean-v1-20261031-0455 · host `vm`
- ladder: /home/user/ChessDecide/data/ladder/ladder-v2.json · stop reason: sliced
