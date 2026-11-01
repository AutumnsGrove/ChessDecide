# Bench run tail-v1-20261101-0118

Plan `bench/plans/tail-v1.json` (sha256 c2d690724d43f0c5…) · seed tail-v1-20261101-0118 · judge depth 14 · concurrency 2
Ladder v2 (calibrated) · size standard (50) · caps $2.0000 per series, $5.0000 per run
Ran 2026-11-01 01:18 UTC → 2026-11-01 01:18 UTC (0 h 00 min) · node 22.22.0 · Stockfish Stockfish 16 · git a022fe5
**Spend $0.0000 of $5.0000** · 6 cells: 0 finished · 0 games · 5 aborted

| Model · arm | Series | Elo (95 %) | W-D-L | Score | ACPL | Acc. | Blunders | Cost | Games |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| **Kev 4b · clean** | `01M6AAZQ4F…` | — | 0-0-0 | — | — | — | — | $0.0000 | 0 |
| **Kev 4b · hinted** | — | — | 0-0-0 | — | — | — | — | $0.0000 | 0 |
| **Tev1 4b Experimental · clean** | `01M6AAZQCZ…` | — | 0-0-0 | — | — | — | — | $0.0000 | 0 |
| **Tev1 4b Experimental · hinted** | — | — | 0-0-0 | — | — | — | — | $0.0000 | 0 |
| **Classify 1 · clean** | `01M6AAZQWT…` | — | 0-0-0 | — | — | — | — | $0.0000 | 0 |
| **Classify 1 · hinted** | — | — | 0-0-0 | — | — | — | — | $0.0000 | 0 |

## Ladder walk

| Model · arm | uci1320 |
| --- | ---: |
| Kev 4b · clean | 0 % |
| Kev 4b · hinted | — |
| Tev1 4b Experimental · clean | 0 % |
| Tev1 4b Experimental · hinted | — |
| Classify 1 · clean | 0 % |
| Classify 1 · hinted | — |

## Not finished

- cell 0 (jaredpalmer/kev-4b#clean, pending) running at 0/50 games, $0.0000
- cell 1 (jaredpalmer/kev-4b#hinted, pending) created at 0/50 games, $0.0000
- cell 2 (togethercomputer/tev1-4b-experimental#clean, pending) running at 0/50 games, $0.0000
- cell 3 (togethercomputer/tev1-4b-experimental#hinted, pending) created at 0/50 games, $0.0000
- cell 4 (scaledown/classify-1#clean, failed) stopped_error at 0/50 games, $0.0000 — too_many_aborts
- cell 5 (scaledown/classify-1#hinted, pending) created at 0/50 games, $0.0000

## Provenance

- plan: `bench/plans/tail-v1.json` sha256 c2d690724d43f0c5459a6e973a7c758288aa1ccf13e988e49e927a14996f6533 · seed tail-v1-20261101-0118 · host `vm`
- ladder: /home/user/ChessDecide/data/ladder/ladder-v2.json · stop reason: completed
