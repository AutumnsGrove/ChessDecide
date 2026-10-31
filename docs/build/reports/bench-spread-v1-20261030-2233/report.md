# Bench run spread-v1-20261030-2233

Plan `bench/plans/spread-v1.json` (sha256 e9137c4db88a2d9d…) · seed spread-v1-20261030-2233 · judge depth 14 · concurrency 2
Ladder v2 (calibrated) · size standard (50) · caps $3.0000 per series, $8.0000 per run
Ran 2026-10-30 22:33 UTC → 2026-10-31 00:23 UTC (1 h 51 min) · node 22.22.0 · Stockfish Stockfish 16 · git 23abef0
**Spend $0.2850 of $8.0000** · 10 cells: 5 finished · 285 games · 0 aborted

| Model · arm | Series | Elo (95 %) | W-D-L | Score | ACPL | Acc. | Blunders | Cost | Games |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| **Elephant 1 · clean** | `01M67F3V4M…` | **496 ± 108** (386–601) | 15-3-32 | 33 % | 218.0 | 71.2 % | 21.2 % | $0.0453 | 50 |
| **Elephant 1 · hinted** | `01M67PB605…` | **819 ± 105** (714–923) | 21-3-26 | 45 % | 113.9 | 82.9 % | 11.3 % | $0.0257 | 50 |
| **Mammoth 1 · clean** | `01M67F3VBH…` | **635 ± 104** (532–740) | 22-6-22 | 50 % | 212.1 | 72.4 % | 19.6 % | $0.1241 | 50 |
| **Mammoth 1 · hinted** | `01M67PHVSD…` | **883 ± 127** (756–1010) | 14-2-19 | 43 % | 104.5 | 82.5 % | 10.5 % | $0.0641 | 35 |
| **D1 · clean** | `01M67F3VNG…` | **563 ± 106** (457–668) | 22-0-28 | 44 % | 242.7 | 69.3 % | 23.5 % | $0.0147 | 50 |
| **D1 · hinted** | `01M67NNKRT…` | **752 ± 106** (645–857) | 17-3-30 | 37 % | 139.4 | 79.2 % | 14.3 % | $0.0111 | 50 |
| **D1.1 · clean** | `01M67TWST0…` | — | 0-0-0 | — | — | — | — | $0.0000 | 0 |
| **D1.1 · hinted** | — | — | 0-0-0 | — | — | — | — | $0.0000 | 0 |
| **Microsoft Decision 1 · clean** | — | — | 0-0-0 | — | — | — | — | $0.0000 | 0 |
| **Microsoft Decision 1 · hinted** | — | — | 0-0-0 | — | — | — | — | $0.0000 | 0 |

## Separated pairs (METRICS.md B6)

| A vs B | P(A stronger) | Elo gap (95 %) | Verdict |
| --- | ---: | --- | --- |
| Elephant 1 · clean vs Elephant 1 · hinted | 0.0 % | −323 (−474 … −174) | **separated** |
| Elephant 1 · clean vs Mammoth 1 · clean | 3.3 % | −139 (−291 … +9) | ≈ not separable |
| Elephant 1 · clean vs D1 · clean | 19.1 % | −67 (−219 … +83) | ≈ not separable |
| Elephant 1 · clean vs D1 · hinted | 0.0 % | −257 (−409 … −106) | **separated** |
| Elephant 1 · hinted vs Mammoth 1 · clean | 99.2 % | +184 (+36 … +331) | **separated** |
| Elephant 1 · hinted vs D1 · clean | 100.0 % | +256 (+108 … +404) | **separated** |
| Elephant 1 · hinted vs D1 · hinted | 80.8 % | +66 (−82 … +216) | ≈ not separable |
| Mammoth 1 · clean vs D1 · clean | 83.1 % | +72 (−75 … +221) | ≈ not separable |
| Mammoth 1 · clean vs D1 · hinted | 6.2 % | −117 (−265 … +33) | ≈ not separable |
| D1 · clean vs D1 · hinted | 0.7 % | −190 (−339 … −39) | **separated** |

## Ladder walk

| Model · arm | uci1320 | eps50 | eps75 | eps15 | eps30 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Elephant 1 · clean | 0 % | 10 % | 70 % | — | — |
| Elephant 1 · hinted | 0 % | 100 % | — | 20 % | 50 % |
| Mammoth 1 · clean | 0 % | 50 % | 90 % | — | — |
| Mammoth 1 · hinted | 20 % | — | — | 0 % | 0 % |
| D1 · clean | 0 % | 80 % | 100 % | — | — |
| D1 · hinted | 0 % | 100 % | — | 20 % | 20 % |
| D1.1 · clean | 0 % | — | — | — | — |
| D1.1 · hinted | — | — | — | — | — |
| Microsoft Decision 1 · clean | — | — | — | — | — |
| Microsoft Decision 1 · hinted | — | — | — | — | — |

## Not finished

- cell 3 (baseten/mammoth-1#hinted, running) running at 35/50 games, $0.0641
- cell 6 (liquid/d1.1#clean, pending) running at 0/50 games, $0.0000
- cell 7 (liquid/d1.1#hinted, pending) created at 0/50 games, $0.0000
- cell 8 (microsoft/microsoft-decision-1#clean, pending) created at 0/50 games, $0.0000
- cell 9 (microsoft/microsoft-decision-1#hinted, pending) created at 0/50 games, $0.0000

## Provenance

- plan: `bench/plans/spread-v1.json` sha256 e9137c4db88a2d9d78bd7d68c0d2fd1f7d1cb9b1b707c6709a0a7bfa65edd277 · seed spread-v1-20261030-2233 · host `vm`
- ladder: /home/user/ChessDecide/data/ladder/ladder-v2.json · stop reason: sliced
