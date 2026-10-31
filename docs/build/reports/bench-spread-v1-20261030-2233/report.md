# Bench run spread-v1-20261030-2233

Plan `bench/plans/spread-v1.json` (sha256 e9137c4db88a2d9d…) · seed spread-v1-20261030-2233 · judge depth 14 · concurrency 2
Ladder v2 (calibrated) · size standard (50) · caps $3.0000 per series, $8.0000 per run
Ran 2026-10-30 22:33 UTC → 2026-10-31 00:23 UTC (1 h 51 min) · node 22.22.0 · Stockfish Stockfish 16 · git 23abef0
**Spend $0.1806 of $8.0000** · 10 cells: 2 finished · 155 games · 0 aborted

| Model · arm | Series | Elo (95 %) | W-D-L | Score | ACPL | Acc. | Blunders | Cost | Games |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| **Elephant 1 · clean** | `01M67F3V4M…` | **496 ± 108** (386–601) | 15-3-32 | 33 % | 218.0 | 71.2 % | 21.2 % | $0.0453 | 50 |
| **Elephant 1 · hinted** | — | — | 0-0-0 | — | — | — | — | $0.0000 | 0 |
| **Mammoth 1 · clean** | `01M67F3VBH…` | **637 ± 108** (529–745) | 21-5-21 | 50 % | 214.6 | 72.7 % | 19.5 % | $0.1194 | 47 |
| **Mammoth 1 · hinted** | — | — | 0-0-0 | — | — | — | — | $0.0000 | 0 |
| **D1 · clean** | `01M67F3VNG…` | **563 ± 106** (457–668) | 22-0-28 | 44 % | 242.7 | 69.3 % | 23.5 % | $0.0147 | 50 |
| **D1 · hinted** | `01M67NNKRT…` | **933 ± 345** (579–1268) | 3-0-5 | 38 % | 119.4 | 77.7 % | 13.7 % | $0.0012 | 8 |
| **D1.1 · clean** | — | — | 0-0-0 | — | — | — | — | $0.0000 | 0 |
| **D1.1 · hinted** | — | — | 0-0-0 | — | — | — | — | $0.0000 | 0 |
| **Microsoft Decision 1 · clean** | — | — | 0-0-0 | — | — | — | — | $0.0000 | 0 |
| **Microsoft Decision 1 · hinted** | — | — | 0-0-0 | — | — | — | — | $0.0000 | 0 |

## Separated pairs (METRICS.md B6)

| A vs B | P(A stronger) | Elo gap (95 %) | Verdict |
| --- | ---: | --- | --- |
| Elephant 1 · clean vs D1 · clean | 19.1 % | −67 (−219 … +83) | ≈ not separable |

## Ladder walk

| Model · arm | uci1320 | eps50 | eps75 |
| --- | ---: | ---: | ---: |
| Elephant 1 · clean | 0 % | 10 % | 70 % |
| Elephant 1 · hinted | — | — | — |
| Mammoth 1 · clean | 0 % | 50 % | 90 % |
| Mammoth 1 · hinted | — | — | — |
| D1 · clean | 0 % | 80 % | 100 % |
| D1 · hinted | 0 % | 100 % | — |
| D1.1 · clean | — | — | — |
| D1.1 · hinted | — | — | — |
| Microsoft Decision 1 · clean | — | — | — |
| Microsoft Decision 1 · hinted | — | — | — |

## Not finished

- cell 1 (baseten/elephant-1#hinted, pending) created at 0/50 games, $0.0000
- cell 2 (baseten/mammoth-1#clean, running) running at 47/50 games, $0.1194
- cell 3 (baseten/mammoth-1#hinted, pending) created at 0/50 games, $0.0000
- cell 5 (liquid/d1#hinted, running) running at 8/50 games, $0.0012
- cell 6 (liquid/d1.1#clean, pending) created at 0/50 games, $0.0000
- cell 7 (liquid/d1.1#hinted, pending) created at 0/50 games, $0.0000
- cell 8 (microsoft/microsoft-decision-1#clean, pending) created at 0/50 games, $0.0000
- cell 9 (microsoft/microsoft-decision-1#hinted, pending) created at 0/50 games, $0.0000

## Provenance

- plan: `bench/plans/spread-v1.json` sha256 e9137c4db88a2d9d78bd7d68c0d2fd1f7d1cb9b1b707c6709a0a7bfa65edd277 · seed spread-v1-20261030-2233 · host `vm`
- ladder: /home/user/ChessDecide/data/ladder/ladder-v2.json · stop reason: sliced
