# Bench run tail-v1-20261101-0118

Plan `bench/plans/tail-v1.json` (sha256 c2d690724d43f0c5…) · seed tail-v1-20261101-0118 · judge depth 14 · concurrency 2
Ladder v2 (calibrated) · size standard (50) · caps $2.0000 per series, $5.0000 per run
Ran 2026-11-01 01:18 UTC → 2026-11-01 03:09 UTC (1 h 51 min) · node 22.22.0 · Stockfish Stockfish 16 · git a022fe5
**Spend $0.1239 of $5.0000** · 6 cells: 2 finished · 101 games · 15 aborted

| Model · arm | Series | Elo (95 %) | W-D-L | Score | ACPL | Acc. | Blunders | Cost | Games |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| **Kev 4b · clean** | `01M6AAZQ4F…` | **122 ± 102** (23–227) | 10-15-25 | 35 % | 472.2 | 55.0 % | 39.9 % | $0.0726 | 50 |
| **Kev 4b · hinted** | `01M6AFMQ67…` | **249 ± 109** (141–359) | 18-14-18 | 50 % | 295.8 | 68.3 % | 27.1 % | $0.0512 | 50 |
| **Tev1 4b Experimental · clean** | `01M6AAZQCZ…` | — | 0-0-0 | — | — | — | — | $0.0000 | 0 |
| **Tev1 4b Experimental · hinted** | `01M6AB22H7…` | **876 ± 736** (124–1595) | 0-0-1 | 0 % | 212.2 | 80.0 % | 20.0 % | $0.0001 | 1 |
| **Classify 1 · clean** | `01M6AAZQWT…` | — | 0-0-0 | — | — | — | — | $0.0000 | 0 |
| **Classify 1 · hinted** | `01M6AB11QK…` | — | 0-0-0 | — | — | — | — | $0.0000 | 0 |

## Separated pairs (METRICS.md B6)

| A vs B | P(A stronger) | Elo gap (95 %) | Verdict |
| --- | ---: | --- | --- |
| Kev 4b · clean vs Kev 4b · hinted | 4.9 % | −127 (−276 … +23) | ≈ not separable |

## Ladder walk

| Model · arm | uci1320 | eps50 | random |
| --- | ---: | ---: | ---: |
| Kev 4b · clean | 0 % | 0 % | 50 % |
| Kev 4b · hinted | 0 % | 0 % | 50 % |
| Tev1 4b Experimental · clean | 0 % | — | — |
| Tev1 4b Experimental · hinted | 0 % | — | — |
| Classify 1 · clean | 0 % | — | — |
| Classify 1 · hinted | 0 % | — | — |

## Not finished

- cell 2 (togethercomputer/tev1-4b-experimental#clean, failed) stopped_error at 0/50 games, $0.0000 — too_many_aborts
- cell 3 (togethercomputer/tev1-4b-experimental#hinted, failed) stopped_error at 1/50 games, $0.0001 — too_many_aborts
- cell 4 (scaledown/classify-1#clean, failed) stopped_error at 0/50 games, $0.0000 — too_many_aborts
- cell 5 (scaledown/classify-1#hinted, failed) stopped_error at 0/50 games, $0.0000 — too_many_aborts

## Provenance

- plan: `bench/plans/tail-v1.json` sha256 c2d690724d43f0c5459a6e973a7c758288aa1ccf13e988e49e927a14996f6533 · seed tail-v1-20261101-0118 · host `vm`
- ladder: /home/user/ChessDecide/data/ladder/ladder-v2.json · stop reason: sliced
