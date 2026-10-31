# Bench run spread-v1-20261030-2233

Plan `bench/plans/spread-v1.json` (sha256 e9137c4db88a2d9d…) · seed spread-v1-20261030-2233 · judge depth 14 · concurrency 2
Ladder v2 (calibrated) · size standard (50) · caps $3.0000 per series, $8.0000 per run
Ran 2026-10-30 22:33 UTC → 2026-10-31 00:23 UTC (1 h 51 min) · node 22.22.0 · Stockfish Stockfish 16 · git 23abef0
**Spend $0.1604 of $8.0000** · 10 cells: 1 finished · 138 games · 0 aborted

| Model · arm | Series | Elo (95 %) | W-D-L | Score | ACPL | Acc. | Blunders | Cost | Games |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| **Elephant 1 · clean** | `01M67F3V4M…` | **518 ± 113** (404–629) | 15-2-28 | 36 % | 208.1 | 73.0 % | 19.9 % | $0.0390 | 45 |
| **Elephant 1 · hinted** | — | — | 0-0-0 | — | — | — | — | $0.0000 | 0 |
| **Mammoth 1 · clean** | `01M67F3VBH…` | **649 ± 114** (536–764) | 20-4-19 | 51 % | 212.9 | 71.6 % | 20.1 % | $0.1066 | 43 |
| **Mammoth 1 · hinted** | — | — | 0-0-0 | — | — | — | — | $0.0000 | 0 |
| **D1 · clean** | `01M67F3VNG…` | **563 ± 106** (457–668) | 22-0-28 | 44 % | 242.7 | 69.3 % | 23.5 % | $0.0147 | 50 |
| **D1 · hinted** | — | — | 0-0-0 | — | — | — | — | $0.0000 | 0 |
| **D1.1 · clean** | — | — | 0-0-0 | — | — | — | — | $0.0000 | 0 |
| **D1.1 · hinted** | — | — | 0-0-0 | — | — | — | — | $0.0000 | 0 |
| **Microsoft Decision 1 · clean** | — | — | 0-0-0 | — | — | — | — | $0.0000 | 0 |
| **Microsoft Decision 1 · hinted** | — | — | 0-0-0 | — | — | — | — | $0.0000 | 0 |

## Ladder walk

| Model · arm | uci1320 | eps50 | eps75 |
| --- | ---: | ---: | ---: |
| Elephant 1 · clean | 0 % | 0 % | 70 % |
| Elephant 1 · hinted | — | — | — |
| Mammoth 1 · clean | 0 % | 67 % | 90 % |
| Mammoth 1 · hinted | — | — | — |
| D1 · clean | 0 % | 80 % | 100 % |
| D1 · hinted | — | — | — |
| D1.1 · clean | — | — | — |
| D1.1 · hinted | — | — | — |
| Microsoft Decision 1 · clean | — | — | — |
| Microsoft Decision 1 · hinted | — | — | — |

## Not finished

- cell 0 (baseten/elephant-1#clean, running) running at 45/50 games, $0.0390
- cell 1 (baseten/elephant-1#hinted, pending) created at 0/50 games, $0.0000
- cell 2 (baseten/mammoth-1#clean, running) running at 43/50 games, $0.1066
- cell 3 (baseten/mammoth-1#hinted, pending) created at 0/50 games, $0.0000
- cell 5 (liquid/d1#hinted, pending) created at 0/50 games, $0.0000
- cell 6 (liquid/d1.1#clean, pending) created at 0/50 games, $0.0000
- cell 7 (liquid/d1.1#hinted, pending) created at 0/50 games, $0.0000
- cell 8 (microsoft/microsoft-decision-1#clean, pending) created at 0/50 games, $0.0000
- cell 9 (microsoft/microsoft-decision-1#hinted, pending) created at 0/50 games, $0.0000

## Provenance

- plan: `bench/plans/spread-v1.json` sha256 e9137c4db88a2d9d78bd7d68c0d2fd1f7d1cb9b1b707c6709a0a7bfa65edd277 · seed spread-v1-20261030-2233 · host `vm`
- ladder: /home/user/ChessDecide/data/ladder/ladder-v2.json · stop reason: sliced
