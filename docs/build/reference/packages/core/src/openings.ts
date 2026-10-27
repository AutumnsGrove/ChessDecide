/** Seeded random 4-ply openings with an eval filter. Pure given the injected evaluator. */
import { applyMove, legalMoves } from './chess.ts';
import { mulberry32, subSeed } from './rng.ts';
import { START_FEN } from './types.ts';

export interface Opening { fen: string; sans: string[]; seed: number; attempts: number; eval_cp: number }

/**
 * Play 4 random legal plies from the start position. Accept if |eval| <= maxAbsCp (White POV, from `evalCp`),
 * else resample with the next sub-seed. After `maxAttempts` return the candidate closest to 0.
 * Games that end inside 4 plies are impossible from the start position (fastest mate is 4 plies: fool's mate!),
 * so candidates that are checkmate/stalemate/no moves are skipped.
 */
export async function randomOpening(
  seed: number,
  evalCp: (fen: string) => Promise<number>,
  opts: { maxAbsCp?: number; maxAttempts?: number; startFen?: string } = {},
): Promise<Opening> {
  const maxAbs = opts.maxAbsCp ?? 100, maxAttempts = opts.maxAttempts ?? 50;
  let best: Opening | null = null;
  for (let a = 0; a < maxAttempts; a++) {
    const s = subSeed(seed, a);
    const rng = mulberry32(s);
    let fen = opts.startFen ?? START_FEN;
    const sans: string[] = [];
    let ok = true;
    for (let p = 0; p < 4; p++) {
      const moves = legalMoves(fen);
      if (moves.length === 0) { ok = false; break; }
      const m = moves[Math.floor(rng() * moves.length)]!;
      const r = applyMove(fen, m.uci);
      sans.push(r.move.san); fen = r.fen;
      if (r.move.mate) { ok = false; break; }
    }
    if (!ok || legalMoves(fen).length === 0) continue;
    const cp = await evalCp(fen);
    const cand: Opening = { fen, sans, seed: s, attempts: a + 1, eval_cp: cp };
    if (Math.abs(cp) <= maxAbs) return cand;
    if (!best || Math.abs(cp) < Math.abs(best.eval_cp)) best = cand;
  }
  if (!best) throw new Error('could not generate an opening');
  return best;
}
