import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Minimal `.env` loader: no dependency, never overrides a real environment variable. */
export function loadEnv(path = resolve(process.cwd(), '.env')): void {
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))))
      value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
}

export function openRouterKey(): string | undefined {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  return key || undefined;
}

export const isMock = (): boolean => process.env.CHESSDECIDE_MOCK === '1';

export function findStockfish(): string {
  const c = [process.env.STOCKFISH_PATH, '/opt/homebrew/bin/stockfish', '/usr/local/bin/stockfish', '/usr/games/stockfish', '/usr/bin/stockfish'];
  for (const p of c) if (p && existsSync(p)) return p;
  throw new Error('Stockfish not found. Install it (brew install stockfish) or set STOCKFISH_PATH.');
}

export const judgeWorkers = () => Number(process.env.CHESSDECIDE_JUDGE_WORKERS ?? Math.max(1, Math.min(4, (navigator.hardwareConcurrency ?? 4) - 2)));
