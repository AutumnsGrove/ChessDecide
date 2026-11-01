# Bench run premium-v1-20261031-2027

Plan `bench/plans/premium-v1.json` (sha256 ca86e56b0cfb2a8e…) · seed premium-v1-20261031-2027 · judge depth 14 · concurrency 2
Ladder v2 (calibrated) · size standard (50) · caps $4.0000 per series, $10.0000 per run
Ran 2026-10-31 20:27 UTC → 2026-11-01 00:45 UTC (4 h 18 min) · node 22.22.0 · Stockfish Stockfish 16 · git 9123240
**Spend $1.3044 of $10.0000** · 6 cells: 6 finished · 300 games · 2 aborted

| Model · arm | Series | Elo (95 %) | W-D-L | Score | ACPL | Acc. | Blunders | Cost | Games |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| **Gpt 6 Luna Decisions · clean** | `01M69TBE75…` | **277 ± 111** (166–388) | 17-6-27 | 40 % | 303.7 | 69.4 % | 25.2 % | $0.1372 | 50 |
| **Gpt 6 Luna Decisions · hinted** | `01M6A3D6GD…` | **741 ± 105** (635–845) | 17-9-24 | 43 % | 125.2 | 81.2 % | 13.9 % | $0.0949 | 50 |
| **Clef Omni · clean** | `01M69TBEDD…` | **385 ± 106** (278–490) | 16-6-28 | 38 % | 285.6 | 67.7 % | 25.1 % | $0.3049 | 50 |
| **Clef Omni · hinted** | `01M6A3JMSB…` | **813 ± 103** (710–916) | 22-3-25 | 47 % | 115.8 | 84.6 % | 10.6 % | $0.1799 | 50 |
| **Clef · clean** | `01M69TBENK…` | **711 ± 106** (607–818) | 27-0-23 | 54 % | 170.8 | 73.7 % | 17.8 % | $0.2923 | 50 |
| **Clef · hinted** | `01M6A09Q54…` | **840 ± 105** (736–946) | 24-5-21 | 53 % | 109.2 | 82.9 % | 11.3 % | $0.2952 | 50 |

## Separated pairs (METRICS.md B6)

| A vs B | P(A stronger) | Elo gap (95 %) | Verdict |
| --- | ---: | --- | --- |
| Gpt 6 Luna Decisions · clean vs Gpt 6 Luna Decisions · hinted | 0.0 % | −463 (−616 … −311) | **separated** |
| Gpt 6 Luna Decisions · clean vs Clef Omni · clean | 8.4 % | −108 (−261 … +46) | ≈ not separable |
| Gpt 6 Luna Decisions · clean vs Clef Omni · hinted | 0.0 % | −535 (−687 … −385) | **separated** |
| Gpt 6 Luna Decisions · clean vs Clef · clean | 0.0 % | −434 (−587 … −282) | **separated** |
| Gpt 6 Luna Decisions · clean vs Clef · hinted | 0.0 % | −563 (−716 … −411) | **separated** |
| Gpt 6 Luna Decisions · hinted vs Clef Omni · clean | 100.0 % | +356 (+207 … +505) | **separated** |
| Gpt 6 Luna Decisions · hinted vs Clef Omni · hinted | 16.8 % | −72 (−219 … +75) | ≈ not separable |
| Gpt 6 Luna Decisions · hinted vs Clef · clean | 65.5 % | +30 (−120 … +178) | ≈ not separable |
| Gpt 6 Luna Decisions · hinted vs Clef · hinted | 9.4 % | −99 (−249 … +48) | ≈ not separable |
| Clef Omni · clean vs Clef Omni · hinted | 0.0 % | −428 (−576 … −281) | **separated** |
| Clef Omni · clean vs Clef · clean | 0.0 % | −326 (−477 … −177) | **separated** |
| Clef Omni · clean vs Clef · hinted | 0.0 % | −455 (−605 … −307) | **separated** |
| Clef Omni · hinted vs Clef · clean | 91.2 % | +102 (−46 … +248) | ≈ not separable |
| Clef Omni · hinted vs Clef · hinted | 35.7 % | −28 (−175 … +119) | ≈ not separable |
| Clef · clean vs Clef · hinted | 4.4 % | −129 (−278 … +20) | ≈ not separable |

## Ladder walk

| Model · arm | uci1320 | eps50 | random | eps75 | eps30 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Gpt 6 Luna Decisions · clean | 0 % | 0 % | 90 % | 0 % | — |
| Gpt 6 Luna Decisions · hinted | 10 % | 100 % | — | — | 0 % |
| Clef Omni · clean | 0 % | 0 % | — | 40 % | — |
| Clef Omni · hinted | 0 % | 80 % | — | — | 60 % |
| Clef · clean | 0 % | 80 % | — | — | 0 % |
| Clef · hinted | 0 % | 80 % | — | — | 50 % |

## Provenance

- plan: `bench/plans/premium-v1.json` sha256 ca86e56b0cfb2a8e84f43a2e93c5b1e979ab7e516ef5806a97d50ea91c7428a1 · seed premium-v1-20261031-2027 · host `vm`
- ladder: /home/user/ChessDecide/data/ladder/ladder-v2.json · stop reason: completed
