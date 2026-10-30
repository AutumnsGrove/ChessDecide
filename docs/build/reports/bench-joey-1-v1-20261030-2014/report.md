# Bench run joey-1-v1-20261030-2014

Plan `bench/plans/joey-1-v1.json` (sha256 629e5e48285c2ec0…) · seed joey-1-v1-20261030-2014 · judge depth 14 · concurrency 2
Ladder v2 (calibrated) · size standard (50) · caps $1.0000 per series, $2.0000 per run
Ran 2026-10-30 20:14 UTC → 2026-10-30 20:33 UTC (0 h 19 min) · node 22.22.0 · Stockfish Stockfish 16 · git a69d670
**Spend $0.0026 of $2.0000** · 2 cells: 0 finished · 12 games · 0 aborted

| Model · arm | Series | Elo (95 %) | W-D-L | Score | ACPL | Acc. | Blunders | Cost | Games |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| **Joey 1 · clean** | `01M677729M…` | **467 ± 278** (180–736) | 2-1-9 | 21 % | 187.7 | 71.4 % | 18.6 % | $0.0026 | 12 |
| **Joey 1 · hinted** | — | — | 0-0-0 | — | — | — | — | $0.0000 | 0 |

## Ladder walk

| Model · arm | uci1320 | eps50 | eps75 |
| --- | ---: | ---: | ---: |
| Joey 1 · clean | 0 % | 20 % | 75 % |
| Joey 1 · hinted | — | — | — |

## Not finished

- cell 0 (baseten/joey-1#clean, running) paused at 12/50 games, $0.0026 — paused
- cell 1 (baseten/joey-1#hinted, pending) created at 0/50 games, $0.0000

## Provenance

- plan: `bench/plans/joey-1-v1.json` sha256 629e5e48285c2ec034e4a7c6783df243636834596f0fec2c263d138d6caf69ea · seed joey-1-v1-20261030-2014 · host `vm`
- ladder: /home/user/ChessDecide/data/ladder/ladder-v2.json · stop reason: sliced
