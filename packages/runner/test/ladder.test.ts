import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/d1';
import { getPlatformProxy } from 'wrangler';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_LADDER, START_FEN, type LadderLevel, type Opening } from '@chessdecide/core';
import { legalMoves } from '@chessdecide/core';
import { NativeUciEngine, type Engine, type SearchRequest, type SearchResult } from '@chessdecide/engine';
import * as schema from '@chessdecide/db/schema';
import { ladderGameCount, type Db } from '@chessdecide/db';
import { calibrate, loadLadder, nextLadderVersion } from '../src/ladder.ts';
import { findStockfish } from '../src/config.ts';

/** Always plays the first legal move; enough to exercise the loop, scheduling and persistence. */
class FirstMoveEngine implements Engine {
  readonly id = 'fake';
  async version() { return 'Fake 1'; }
  async search(req: SearchRequest): Promise<SearchResult> {
    const m = legalMoves(req.fen)[0];
    return { bestUci: m?.uci ?? '(none)', lines: [] };
  }
  async close() {}
}

const LEVELS: LadderLevel[] = [
  { id: 'random', kind: 'random', label: 'Random mover', elo: 250 },
  { id: 'eps50', kind: 'eps', label: 'Stockfish 1320, 50% random', elo: 790, eps: 0.5, uci_elo: 1320 },
  { id: 'uci1320', kind: 'uci', label: 'Stockfish 1320', elo: 1320, uci_elo: 1320 },
  { id: 'uci1700', kind: 'uci', label: 'Stockfish 1700', elo: 1700, uci_elo: 1700 },
];
const OPENING: Opening = { fen: START_FEN, sans: [], seed: 1, attempts: 1, eval_cp: 0 };

let db: Db; let dispose: () => Promise<void>;
const migDir = fileURLToPath(new URL('../../db/migrations/', import.meta.url));

beforeAll(async () => {
  const proxy = await getPlatformProxy<{ DB: D1Database }>({
    configPath: fileURLToPath(new URL('../../../apps/web/wrangler.jsonc', import.meta.url)),
    persist: { path: mkdtempSync(join(tmpdir(), 'cd-cal-')) },
  });
  dispose = proxy.dispose;
  for (const f of readdirSync(migDir).filter((x) => x.endsWith('.sql')).sort())
    for (const st of readFileSync(migDir + f, 'utf8').split('--> statement-breakpoint')) if (st.trim()) await proxy.env.DB.exec(st.trim().replace(/\s+/g, ' '));
  db = drizzle(proxy.env.DB, { schema });
}, 60_000);
afterAll(async () => { await dispose?.(); });

const opts = (dataDir: string, over: Record<string, unknown> = {}) => ({
  db, dataDir, levels: LEVELS, openings: [OPENING], gamesPerPair: 2, workers: 2, version: 1,
  makeEngine: async () => new FirstMoveEngine(), log: () => {}, now: () => new Date('2026-01-01T00:00:00Z'),
  ...over,
});

describe('ladder calibration', () => {
  it('plays every pair, fits, writes the file and stores the levels', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cd-ladder-data-'));
    const res = await calibrate(opts(dir));
    expect(res.file.version).toBe(1);
    expect(res.file.calibrated).toBe(true);
    expect(res.file.sf_version).toBe('Fake 1');
    expect(res.file.anchor).toEqual({ level: 'uci1320', elo: 1320 });
    expect(res.file.levels).toHaveLength(LEVELS.length);
    expect(res.file.levels.find((l) => l.id === 'uci1320')!.elo).toBe(1320);
    expect(res.games).toBe(10);
    expect(existsSync(res.path)).toBe(true);
    expect(loadLadder(dir).version).toBe(1);
    expect(await ladderGameCount(db, 1, 'random', 'eps50')).toBe(2);
  }, 60_000);

  it('resumes: a rerun with --resume plays only missing games', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cd-ladder-resume-'));
    const first = await calibrate(opts(dir, { version: 2 }));
    expect(first.games).toBe(10);
    rmSync(first.path);
    const logs: string[] = [];
    const second = await calibrate(opts(dir, { version: 2, resume: true, log: (l: string) => logs.push(l) }));
    expect(second.games).toBe(10);
    expect(logs.some((l) => l.includes('0 to play'))).toBe(true);
    expect(existsSync(second.path)).toBe(true);
  }, 60_000);

  it('starts a fresh version without --resume', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cd-ladder-fresh-'));
    await calibrate(opts(dir, { version: 3 }));
    await calibrate(opts(dir, { version: 3 }));
    expect(await ladderGameCount(db, 3, 'random', 'eps50')).toBe(2);
  }, 60_000);

  it('loadLadder ignores corrupt files and picks the highest valid version', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cd-ladder-load-'));
    const ladderDir = join(dir, 'ladder');
    mkdirSync(ladderDir, { recursive: true });
    writeFileSync(join(ladderDir, 'ladder-v1.json'), JSON.stringify({ ...DEFAULT_LADDER, version: 1, calibrated: true }));
    writeFileSync(join(ladderDir, 'ladder-v2.json'), '{not json');
    const warns: string[] = [];
    const loaded = loadLadder(dir, (m) => warns.push(m));
    expect(loaded.version).toBe(1);
    expect(warns).toHaveLength(1);
    expect(warns[0]).toContain('ladder-v2.json');
    expect(loadLadder(mkdtempSync(join(tmpdir(), 'cd-empty-')))).toEqual(DEFAULT_LADDER);
    expect(nextLadderVersion(dir)).toBe(3);
  });
});

const stockfish = (() => { try { return findStockfish(); } catch { return null; } })();

describe.skipIf(!stockfish)('ladder calibration (real Stockfish)', () => {
  it('plays one real pair and writes a calibrated file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cd-ladder-sf-'));
    const res = await calibrate({
      db, dataDir: dir, levels: [LEVELS[2]!, LEVELS[3]!], pairs: [['uci1320', 'uci1700']],
      openings: [OPENING], gamesPerPair: 2, workers: 1, movetimeMs: 20, version: 10,
      makeEngine: () => NativeUciEngine.start({ path: stockfish! }), log: () => {},
    });
    expect(res.games).toBe(2);
    expect(res.file.levels.map((l) => l.id)).toEqual(['uci1320', 'uci1700']);
    expect(res.file.calibrated).toBe(true);
    expect(res.file.levels.find((l) => l.id === 'uci1320')!.elo).toBe(1320);
  }, 120_000);
});
