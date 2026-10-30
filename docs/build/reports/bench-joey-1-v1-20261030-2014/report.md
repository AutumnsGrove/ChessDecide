# Bench run joey-1-v1-20261030-2014

Plan `bench/plans/joey-1-v1.json` (sha256 629e5e48285c2ec0…) · seed joey-1-v1-20261030-2014 · judge depth 14 · concurrency 2
Ladder v2 (calibrated) · size standard (50) · caps $1.0000 per series, $2.0000 per run
Ran 2026-10-30 20:14 UTC → 2026-10-30 20:33 UTC (0 h 19 min) · node 22.22.0 · Stockfish Stockfish 16 · git a69d670
**Spend $0.0270 of $2.0000** · 2 cells: 2 finished · 100 games · 0 aborted

| Model · arm | Series | Elo (95 %) | W-D-L | Score | ACPL | Acc. | Blunders | Cost | Games |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| **Joey 1 · clean** | `01M677729M…` | **379 ± 105** (274–483) | 15-10-25 | 40 % | 266.1 | 66.7 % | 25.5 % | $0.0178 | 50 |
| **Joey 1 · hinted** | `01M67BKVN8…` | **721 ± 109** (613–830) | 23-3-24 | 49 % | 134.9 | 82.2 % | 11.7 % | $0.0092 | 50 |

## Separated pairs (METRICS.md B6)

| A vs B | P(A stronger) | Elo gap (95 %) | Verdict |
| --- | ---: | --- | --- |
| Joey 1 · clean vs Joey 1 · hinted | 0.0 % | −342 (−493 … −192) | **separated** |

## Ladder walk

| Model · arm | uci1320 | eps50 | eps75 | eps30 |
| --- | ---: | ---: | ---: | ---: |
| Joey 1 · clean | 0 % | 20 % | 70 % | — |
| Joey 1 · hinted | 0 % | 80 % | 90 % | 20 % |

## Provenance

- plan: `bench/plans/joey-1-v1.json` sha256 629e5e48285c2ec034e4a7c6783df243636834596f0fec2c263d138d6caf69ea · seed joey-1-v1-20261030-2014 · host `vm`
- ladder: /home/user/ChessDecide/data/ladder/ladder-v2.json · stop reason: sliced
