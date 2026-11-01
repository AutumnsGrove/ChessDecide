# Bench run rest-hinted-v2-20261031-1430

Plan `bench/plans/rest-hinted-v2.json` (sha256 e04d992090d9f023…) · seed rest-hinted-v2-20261031-1430 · judge depth 14 · concurrency 2
Ladder v2 (calibrated) · size standard (50) · caps $1.0000 per series, $6.0000 per run
Ran 2026-10-31 14:30 UTC → 2026-10-31 20:03 UTC (5 h 33 min) · node 22.22.0 · Stockfish Stockfish 16 · git 07bbc61
**Spend $0.2801 of $6.0000** · 10 cells: 10 finished · 500 games · 0 aborted

| Model · arm | Series | Elo (95 %) | W-D-L | Score | ACPL | Acc. | Blunders | Cost | Games |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| **Pplx Decider Flash V1.2 · hinted** | `01M695X6CZ…` | **767 ± 104** (663–871) | 20-4-26 | 44 % | 135.8 | 83.8 % | 11.6 % | $0.0072 | 50 |
| **Span 02 · hinted** | `01M695X6JG…` | **641 ± 106** (534–746) | 20-0-30 | 40 % | 148.0 | 80.4 % | 14.8 % | $0.0072 | 50 |
| **Mercury Decide · hinted** | `01M695X6SK…` | **732 ± 109** (623–840) | 20-3-27 | 43 % | 132.6 | 82.7 % | 12.4 % | $0.0193 | 50 |
| **Pplx Decider V1.2 · hinted** | `01M695X738…` | **775 ± 104** (671–879) | 21-3-26 | 45 % | 116.5 | 82.4 % | 11.8 % | $0.0127 | 50 |
| **Drex V1.5 · hinted** | `01M69B87P0…` | **718 ± 106** (613–825) | 25-2-23 | 52 % | 128.3 | 80.7 % | 13.5 % | $0.0236 | 50 |
| **Jev 1.13 · hinted** | `01M69DBPSW…` | **775 ± 104** (671–879) | 21-3-26 | 45 % | 125.1 | 84.3 % | 11.0 % | $0.0475 | 50 |
| **Drex Max · hinted** | `01M69DYYV7…` | **829 ± 103** (726–932) | 23-3-24 | 49 % | 110.4 | 79.6 % | 13.1 % | $0.0511 | 50 |
| **Drex V2.0 · hinted** | `01M69E078C…` | **794 ± 105** (689–898) | 20-2-28 | 42 % | 130.8 | 81.2 % | 12.5 % | $0.0381 | 50 |
| **Jev 1.14 · hinted** | `01M69K256B…` | **723 ± 106** (617–829) | 21-5-24 | 47 % | 125.7 | 85.1 % | 11.0 % | $0.0519 | 50 |
| **D1 Ultra · hinted** | `01M69MAG7P…` | **767 ± 104** (663–871) | 20-4-26 | 44 % | 128.9 | 83.4 % | 11.6 % | $0.0215 | 50 |

## Separated pairs (METRICS.md B6)

| A vs B | P(A stronger) | Elo gap (95 %) | Verdict |
| --- | ---: | --- | --- |
| Pplx Decider Flash V1.2 · hinted vs Span 02 · hinted | 95.2 % | +126 (−22 … +275) | ≈ not separable |
| Pplx Decider Flash V1.2 · hinted vs Mercury Decide · hinted | 67.8 % | +35 (−115 … +186) | ≈ not separable |
| Pplx Decider Flash V1.2 · hinted vs Pplx Decider V1.2 · hinted | 45.7 % | −8 (−155 … +139) | ≈ not separable |
| Pplx Decider Flash V1.2 · hinted vs Drex V1.5 · hinted | 74.5 % | +50 (−100 … +197) | ≈ not separable |
| Pplx Decider Flash V1.2 · hinted vs Jev 1.13 · hinted | 45.7 % | −8 (−155 … +139) | ≈ not separable |
| Pplx Decider Flash V1.2 · hinted vs Drex Max · hinted | 20.5 % | −61 (−208 … +85) | ≈ not separable |
| Pplx Decider Flash V1.2 · hinted vs Drex V2.0 · hinted | 36.0 % | −27 (−174 … +121) | ≈ not separable |
| Pplx Decider Flash V1.2 · hinted vs Jev 1.14 · hinted | 72.2 % | +44 (−104 … +193) | ≈ not separable |
| Pplx Decider Flash V1.2 · hinted vs D1 Ultra · hinted | 50.0 % | −0 (−147 … +147) | ≈ not separable |
| Span 02 · hinted vs Mercury Decide · hinted | 12.0 % | −91 (−243 … +61) | ≈ not separable |
| Span 02 · hinted vs Pplx Decider V1.2 · hinted | 3.8 % | −134 (−283 … +14) | ≈ not separable |
| Span 02 · hinted vs Drex V1.5 · hinted | 15.7 % | −77 (−227 … +72) | ≈ not separable |
| Span 02 · hinted vs Jev 1.13 · hinted | 3.8 % | −134 (−283 … +14) | ≈ not separable |
| Span 02 · hinted vs Drex Max · hinted | 0.6 % | −187 (−336 … −40) | **separated** |
| Span 02 · hinted vs Drex V2.0 · hinted | 2.2 % | −153 (−302 … −4) | **separated** |
| Span 02 · hinted vs Jev 1.14 · hinted | 14.2 % | −82 (−232 … +67) | ≈ not separable |
| Span 02 · hinted vs D1 Ultra · hinted | 4.8 % | −126 (−275 … +22) | ≈ not separable |
| Mercury Decide · hinted vs Pplx Decider V1.2 · hinted | 28.5 % | −43 (−194 … +107) | ≈ not separable |
| Mercury Decide · hinted vs Drex V1.5 · hinted | 57.4 % | +14 (−138 … +165) | ≈ not separable |
| Mercury Decide · hinted vs Jev 1.13 · hinted | 28.5 % | −43 (−194 … +107) | ≈ not separable |
| Mercury Decide · hinted vs Drex Max · hinted | 10.2 % | −97 (−246 … +52) | ≈ not separable |
| Mercury Decide · hinted vs Drex V2.0 · hinted | 20.9 % | −62 (−213 … +89) | ≈ not separable |
| Mercury Decide · hinted vs Jev 1.14 · hinted | 54.7 % | +9 (−143 … +160) | ≈ not separable |
| Mercury Decide · hinted vs D1 Ultra · hinted | 32.2 % | −35 (−186 … +115) | ≈ not separable |
| Pplx Decider V1.2 · hinted vs Drex V1.5 · hinted | 77.8 % | +58 (−91 … +205) | ≈ not separable |
| Pplx Decider V1.2 · hinted vs Jev 1.13 · hinted | 50.0 % | +0 (−147 … +147) | ≈ not separable |
| Pplx Decider V1.2 · hinted vs Drex Max · hinted | 23.7 % | −53 (−200 … +93) | ≈ not separable |
| Pplx Decider V1.2 · hinted vs Drex V2.0 · hinted | 40.1 % | −19 (−166 … +129) | ≈ not separable |
| Pplx Decider V1.2 · hinted vs Jev 1.14 · hinted | 75.7 % | +53 (−96 … +201) | ≈ not separable |
| Pplx Decider V1.2 · hinted vs D1 Ultra · hinted | 54.3 % | +8 (−139 … +155) | ≈ not separable |
| Drex V1.5 · hinted vs Jev 1.13 · hinted | 22.2 % | −58 (−205 … +91) | ≈ not separable |
| Drex V1.5 · hinted vs Drex Max · hinted | 7.0 % | −111 (−258 … +37) | ≈ not separable |
| Drex V1.5 · hinted vs Drex V2.0 · hinted | 15.7 % | −76 (−224 … +73) | ≈ not separable |
| Drex V1.5 · hinted vs Jev 1.14 · hinted | 47.2 % | −5 (−154 … +145) | ≈ not separable |
| Drex V1.5 · hinted vs D1 Ultra · hinted | 25.5 % | −50 (−197 … +100) | ≈ not separable |
| Jev 1.13 · hinted vs Drex Max · hinted | 23.7 % | −53 (−200 … +93) | ≈ not separable |
| Jev 1.13 · hinted vs Drex V2.0 · hinted | 40.1 % | −19 (−166 … +129) | ≈ not separable |
| Jev 1.13 · hinted vs Jev 1.14 · hinted | 75.7 % | +53 (−96 … +201) | ≈ not separable |
| Jev 1.13 · hinted vs D1 Ultra · hinted | 54.3 % | +8 (−139 … +155) | ≈ not separable |
| Drex Max · hinted vs Drex V2.0 · hinted | 67.7 % | +35 (−112 … +182) | ≈ not separable |
| Drex Max · hinted vs Jev 1.14 · hinted | 92.0 % | +106 (−42 … +253) | ≈ not separable |
| Drex Max · hinted vs D1 Ultra · hinted | 79.5 % | +61 (−85 … +208) | ≈ not separable |
| Drex V2.0 · hinted vs Jev 1.14 · hinted | 82.6 % | +71 (−78 … +220) | ≈ not separable |
| Drex V2.0 · hinted vs D1 Ultra · hinted | 64.0 % | +27 (−121 … +174) | ≈ not separable |
| Jev 1.14 · hinted vs D1 Ultra · hinted | 27.8 % | −44 (−193 … +104) | ≈ not separable |

## Ladder walk

| Model · arm | uci1320 | eps50 | eps30 | eps15 |
| --- | ---: | ---: | ---: | ---: |
| Pplx Decider Flash V1.2 · hinted | 0 % | 90 % | 30 % | — |
| Span 02 · hinted | 0 % | 60 % | 0 % | — |
| Mercury Decide · hinted | 0 % | 100 % | 20 % | 0 % |
| Pplx Decider V1.2 · hinted | 0 % | 80 % | 40 % | — |
| Drex V1.5 · hinted | 0 % | 80 % | 30 % | — |
| Jev 1.13 · hinted | 0 % | 100 % | 40 % | — |
| Drex Max · hinted | 0 % | 90 % | 40 % | — |
| Drex V2.0 · hinted | 0 % | 100 % | 60 % | 10 % |
| Jev 1.14 · hinted | 0 % | 90 % | 10 % | — |
| D1 Ultra · hinted | 0 % | 80 % | 40 % | — |

## Provenance

- plan: `bench/plans/rest-hinted-v2.json` sha256 e04d992090d9f023627d9f5ba09b0ef89d76b3bca2bad2310ec131b7a3c702a0 · seed rest-hinted-v2-20261031-1430 · host `vm`
- ladder: /home/user/ChessDecide/data/ladder/ladder-v2.json · stop reason: completed
