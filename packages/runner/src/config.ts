import { existsSync } from 'node:fs';

export function findStockfish(): string {
  const c = [process.env.STOCKFISH_PATH, '/opt/homebrew/bin/stockfish', '/usr/local/bin/stockfish', '/usr/games/stockfish', '/usr/bin/stockfish'];
  for (const p of c) if (p && existsSync(p)) return p;
  throw new Error('Stockfish not found. Install it (brew install stockfish) or set STOCKFISH_PATH.');
}
export const judgeWorkers = () => Number(process.env.CHESSDECIDE_JUDGE_WORKERS ?? Math.max(1, Math.min(4, (navigator.hardwareConcurrency ?? 4) - 2)));
