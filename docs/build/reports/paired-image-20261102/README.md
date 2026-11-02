# Paired position test: board picture added to clean / hinted (2026-11-02)

Question: does sending the rendered board image *in addition to* the exact `clean` / `hinted` text request
improve move quality? 16 image-capable decision models × 200 positions × 4 arms = 12,800 calls, $0.733.

- `report.md` — results (paired differences in win-probability loss, bootstrap 95 % CIs, per-model cost).
- `positions.json` — 200 positions: random 4-ply opening, then Stockfish 16 at UCI_Elo 1500 with 15 % random moves, sampled at plies 8–70, 100 White / 100 Black to move.
- `oracle.json.gz` — Stockfish 16, depth 14, every legal move scored (gunzip to reuse).
- `results.jsonl` — every call: model, arm, position, pick, tokens, cost, latency.
- Reproduce: `packages/runner/scripts/paired-image.ts` (`positions`, `oracle`, `run`, `analyze`).
