# Bench run rest-clean-v1-20261031-0455

Plan `bench/plans/rest-clean-v1.json` (sha256 f62e8be7c8e9abe8…) · seed rest-clean-v1-20261031-0455 · judge depth 14 · concurrency 2
Ladder v2 (calibrated) · size standard (50) · caps $1.0000 per series, $6.0000 per run
Ran 2026-10-31 04:55 UTC → 2026-10-31 10:32 UTC (5 h 37 min) · node 22.22.0 · Stockfish Stockfish 16 · git bad648d
**Spend $0.3646 of $6.0000** · 13 cells: 7 finished · 432 games · 11 aborted

| Model · arm | Series | Elo (95 %) | W-D-L | Score | ACPL | Acc. | Blunders | Cost | Games |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| **Pplx Decider Flash V1.2 · clean** | `01M68501M3…` | **302 ± 109** (192–410) | 16-2-32 | 34 % | 320.3 | 64.9 % | 29.1 % | $0.0128 | 50 |
| **Span 02 · clean** | `01M68501S1…` | **311 ± 109** (201–418) | 15-5-30 | 35 % | 279.9 | 67.4 % | 26.3 % | $0.0089 | 50 |
| **Mercury Decide · clean** | `01M68501ZV…` | **297 ± 112** (186–410) | 22-5-23 | 49 % | 313.7 | 68.4 % | 28.0 % | $0.0367 | 50 |
| **Pplx Decider V1.2 · clean** | `01M6850260…` | **494 ± 108** (387–602) | 22-1-27 | 45 % | 253.0 | 72.3 % | 22.2 % | $0.0220 | 50 |
| **Clef Flash · clean** | `01M68D2E92…` | — | 0-0-0 | — | — | — | — | $0.0005 | 0 |
| **Drex V1.5 · clean** | `01M68D7NXH…` | **411 ± 104** (307–515) | 21-2-27 | 44 % | 266.8 | 66.9 % | 25.2 % | $0.0363 | 50 |
| **Jev 1.13 · clean** | `01M68ERA3B…` | **346 ± 106** (239–450) | 13-10-27 | 36 % | 244.8 | 74.7 % | 21.0 % | $0.0903 | 50 |
| **Solar Decide · clean** | `01M68F4P58…` | **876 ± 736** (124–1595) | 0-0-1 | 0 % | 94.4 | 83.3 % | 0.0 % | $0.0011 | 1 |
| **Solar Decide Flash · clean** | `01M68FF57E…` | — | 0-0-0 | — | — | — | — | $0.0002 | 0 |
| **Drex Max · clean** | `01M68FHS04…` | **452 ± 107** (345–558) | 20-3-27 | 43 % | 222.8 | 71.4 % | 21.7 % | $0.0704 | 50 |
| **Drex V2.0 · clean** | `01M68HG3JK…` | **603 ± 113** (491–716) | 20-4-21 | 49 % | 177.6 | 76.4 % | 16.5 % | $0.0477 | 45 |
| **Jev 1.14 · clean** | `01M68PQG7P…` | **481 ± 165** (317–647) | 9-2-13 | 42 % | 211.8 | 77.4 % | 18.3 % | $0.0334 | 24 |
| **D1 Ultra · clean** | `01M68TDPQN…` | **732 ± 261** (472–993) | 4-0-8 | 33 % | 178.3 | 78.5 % | 15.5 % | $0.0044 | 12 |

## Separated pairs (METRICS.md B6)

| A vs B | P(A stronger) | Elo gap (95 %) | Verdict |
| --- | ---: | --- | --- |
| Pplx Decider Flash V1.2 · clean vs Span 02 · clean | 45.5 % | −9 (−163 … +145) | ≈ not separable |
| Pplx Decider Flash V1.2 · clean vs Mercury Decide · clean | 53.0 % | +6 (−152 … +160) | ≈ not separable |
| Pplx Decider Flash V1.2 · clean vs Pplx Decider V1.2 · clean | 0.7 % | −192 (−346 … −40) | **separated** |
| Pplx Decider Flash V1.2 · clean vs Drex V1.5 · clean | 7.7 % | −109 (−260 … +41) | ≈ not separable |
| Pplx Decider Flash V1.2 · clean vs Jev 1.13 · clean | 28.6 % | −44 (−196 … +108) | ≈ not separable |
| Pplx Decider Flash V1.2 · clean vs Drex Max · clean | 2.7 % | −149 (−302 … +2) | ≈ not separable |
| Span 02 · clean vs Mercury Decide · clean | 57.4 % | +14 (−143 … +169) | ≈ not separable |
| Span 02 · clean vs Pplx Decider V1.2 · clean | 0.9 % | −183 (−336 … −32) | **separated** |
| Span 02 · clean vs Drex V1.5 · clean | 9.5 % | −100 (−251 … +49) | ≈ not separable |
| Span 02 · clean vs Jev 1.13 · clean | 32.5 % | −35 (−186 … +116) | ≈ not separable |
| Span 02 · clean vs Drex Max · clean | 3.4 % | −140 (−293 … +11) | ≈ not separable |
| Mercury Decide · clean vs Pplx Decider V1.2 · clean | 0.6 % | −198 (−352 … −42) | **separated** |
| Mercury Decide · clean vs Drex V1.5 · clean | 7.1 % | −114 (−266 … +39) | ≈ not separable |
| Mercury Decide · clean vs Jev 1.13 · clean | 26.3 % | −49 (−202 … +106) | ≈ not separable |
| Mercury Decide · clean vs Drex Max · clean | 2.5 % | −155 (−308 … +0) | ≈ not separable |
| Pplx Decider V1.2 · clean vs Drex V1.5 · clean | 86.3 % | +83 (−66 … +232) | ≈ not separable |
| Pplx Decider V1.2 · clean vs Jev 1.13 · clean | 97.4 % | +148 (−1 … +299) | ≈ not separable |
| Pplx Decider V1.2 · clean vs Drex Max · clean | 71.1 % | +43 (−108 … +194) | ≈ not separable |
| Drex V1.5 · clean vs Jev 1.13 · clean | 80.7 % | +65 (−82 … +214) | ≈ not separable |
| Drex V1.5 · clean vs Drex Max · clean | 29.7 % | −40 (−189 … +109) | ≈ not separable |
| Jev 1.13 · clean vs Drex Max · clean | 8.3 % | −106 (−256 … +44) | ≈ not separable |

## Ladder walk

| Model · arm | uci1320 | eps50 | random | eps75 | eps30 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Pplx Decider Flash V1.2 · clean | 0 % | 0 % | 90 % | 60 % | — |
| Span 02 · clean | 0 % | 0 % | 90 % | 0 % | — |
| Mercury Decide · clean | 0 % | 0 % | 100 % | 10 % | — |
| Pplx Decider V1.2 · clean | 0 % | 20 % | — | 60 % | — |
| Clef Flash · clean | 0 % | — | — | — | — |
| Drex V1.5 · clean | 0 % | 20 % | — | 60 % | — |
| Jev 1.13 · clean | 0 % | 30 % | — | 40 % | — |
| Solar Decide · clean | 0 % | — | — | — | — |
| Solar Decide Flash · clean | 0 % | — | — | — | — |
| Drex Max · clean | 0 % | 0 % | — | 50 % | — |
| Drex V2.0 · clean | 0 % | 0 % | — | 90 % | — |
| Jev 1.14 · clean | 0 % | 20 % | — | 63 % | — |
| D1 Ultra · clean | 0 % | 80 % | — | — | 0 % |

## Not finished

- cell 4 (cloudflare/clef-flash#clean, failed) stopped_error at 0/50 games, $0.0005 — too_many_aborts
- cell 7 (upstage/solar-decide#clean, failed) stopped_error at 1/50 games, $0.0011 — too_many_aborts
- cell 8 (upstage/solar-decide-flash#clean, failed) stopped_error at 0/50 games, $0.0002 — too_many_aborts
- cell 10 (nace-ai/drex-v2.0#clean, running) running at 45/50 games, $0.0477
- cell 11 (typesafe/jev-1.14#clean, running) running at 24/50 games, $0.0334
- cell 12 (liquid/d1-ultra#clean, running) running at 12/50 games, $0.0044

## Provenance

- plan: `bench/plans/rest-clean-v1.json` sha256 f62e8be7c8e9abe8e8c3fdbc149181499709f0e55810b66dd5a12ee4283f3cc3 · seed rest-clean-v1-20261031-0455 · host `vm`
- ladder: /home/user/ChessDecide/data/ladder/ladder-v2.json · stop reason: sliced
