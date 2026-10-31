# Bench run spread-v1-20261030-2233

Plan `bench/plans/spread-v1.json` (sha256 e9137c4db88a2d9d…) · seed spread-v1-20261030-2233 · judge depth 14 · concurrency 2
Ladder v2 (calibrated) · size standard (50) · caps $3.0000 per series, $8.0000 per run
Ran 2026-10-30 22:33 UTC → 2026-10-31 00:23 UTC (1 h 51 min) · node 22.22.0 · Stockfish Stockfish 16 · git 23abef0
**Spend $0.1583 of $8.0000** · 10 cells: 0 finished · 135 games · 0 aborted

| Model · arm | Series | Elo (95 %) | W-D-L | Score | ACPL | Acc. | Blunders | Cost | Games |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| **Elephant 1 · clean** | `01M67F3V4M…` | **518 ± 113** (404–629) | 15-2-28 | 36 % | 208.1 | 73.0 % | 19.9 % | $0.0390 | 45 |
| **Elephant 1 · hinted** | — | — | 0-0-0 | — | — | — | — | $0.0000 | 0 |
| **Mammoth 1 · clean** | `01M67F3VBH…` | **640 ± 116** (525–757) | 19-4-19 | 50 % | 213.2 | 71.6 % | 20.1 % | $0.1054 | 42 |
| **Mammoth 1 · hinted** | — | — | 0-0-0 | — | — | — | — | $0.0000 | 0 |
| **D1 · clean** | `01M67F3VNG…` | **543 ± 108** (434–650) | 20-0-28 | 42 % | 246.2 | 69.1 % | 23.7 % | $0.0139 | 48 |
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
| Mammoth 1 · clean | 0 % | 50 % | 90 % |
| Mammoth 1 · hinted | — | — | — |
| D1 · clean | 0 % | 67 % | 100 % |
| D1 · hinted | — | — | — |
| D1.1 · clean | — | — | — |
| D1.1 · hinted | — | — | — |
| Microsoft Decision 1 · clean | — | — | — |
| Microsoft Decision 1 · hinted | — | — | — |

## Not finished

- cell 0 (baseten/elephant-1#clean, running) paused at 45/50 games, $0.0390 — paused
- cell 1 (baseten/elephant-1#hinted, pending) created at 0/50 games, $0.0000
- cell 2 (baseten/mammoth-1#clean, running) paused at 42/50 games, $0.1054 — paused
- cell 3 (baseten/mammoth-1#hinted, pending) created at 0/50 games, $0.0000
- cell 4 (liquid/d1#clean, running) paused at 48/50 games, $0.0139 — paused
- cell 5 (liquid/d1#hinted, pending) created at 0/50 games, $0.0000
- cell 6 (liquid/d1.1#clean, pending) created at 0/50 games, $0.0000
- cell 7 (liquid/d1.1#hinted, pending) created at 0/50 games, $0.0000
- cell 8 (microsoft/microsoft-decision-1#clean, pending) created at 0/50 games, $0.0000
- cell 9 (microsoft/microsoft-decision-1#hinted, pending) created at 0/50 games, $0.0000

## Provenance

- plan: `bench/plans/spread-v1.json` sha256 e9137c4db88a2d9d78bd7d68c0d2fd1f7d1cb9b1b707c6709a0a7bfa65edd277 · seed spread-v1-20261030-2233 · host `vm`
- ladder: /home/user/ChessDecide/data/ladder/ladder-v2.json · stop reason: sliced
