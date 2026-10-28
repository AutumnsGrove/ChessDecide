import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/d1';
import { getPlatformProxy } from 'wrangler';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { LadderFile } from '@chessdecide/core';
import * as schema from '../src/schema.ts';
import {
  addLadderGame, ladderGameCount, ladderGameIndexes, loadCalibrationGames, loadLadderLevels, saveLadderLevels,
  scoreFor, type Db,
} from '../src/index.ts';

let db: Db; let dispose: () => Promise<void>;
const migDir = fileURLToPath(new URL('../migrations/', import.meta.url));

beforeAll(async () => {
  const proxy = await getPlatformProxy<{ DB: D1Database }>({
    configPath: fileURLToPath(new URL('../../../apps/web/wrangler.jsonc', import.meta.url)),
    persist: { path: mkdtempSync(join(tmpdir(), 'cd-ladder-')) },
  });
  dispose = proxy.dispose;
  for (const f of readdirSync(migDir).filter((x) => x.endsWith('.sql')).sort())
    for (const st of readFileSync(migDir + f, 'utf8').split('--> statement-breakpoint')) if (st.trim()) await proxy.env.DB.exec(st.trim().replace(/\s+/g, ' '));
  db = drizzle(proxy.env.DB, { schema });
}, 60_000);
afterAll(async () => { await dispose?.(); });

const file: LadderFile = {
  version: 1, calibrated: true, movetime_ms: 50, sf_version: 'Stockfish 19', calibrated_at: '2026-01-01T00:00:00Z',
  anchor: { level: 'uci1320', elo: 1320 },
  levels: [
    { id: 'random', kind: 'random', label: 'Random mover', elo: 240, se: 30, games: 400 },
    { id: 'eps50', kind: 'eps', label: 'Stockfish 1320, 50% random', elo: 810, se: 25, games: 400, eps: 0.5, uci_elo: 1320 },
    { id: 'uci1320', kind: 'uci', label: 'Stockfish 1320', elo: 1320, se: 0, games: 400, uci_elo: 1320 },
  ],
};

describe('ladder store', () => {
  it('saves and loads calibrated levels (upsert by version+id)', async () => {
    await saveLadderLevels(db, file);
    const loaded = await loadLadderLevels(db, 1);
    expect(loaded.map((l) => l.id)).toEqual(['random', 'eps50', 'uci1320']);
    expect(loaded[1]).toMatchObject({ elo: 810, eps: 0.5, uci_elo: 1320, label: 'Stockfish 1320, 50% random' });
    await saveLadderLevels(db, { ...file, levels: file.levels.map((l) => (l.id === 'eps50' ? { ...l, elo: 820 } : l)) });
    expect((await loadLadderLevels(db, 1)).find((l) => l.id === 'eps50')!.elo).toBe(820);
    expect(await loadLadderLevels(db, 2)).toEqual([]);
  });

  it('records games, counts them per pair and exposes their indexes', async () => {
    await addLadderGame(db, { ladder_version: 1, level_a: 'random', level_b: 'eps50', game_index: 0, opening_seed: 1, a_color: 'white', result: '1-0', plies: 42 });
    await addLadderGame(db, { ladder_version: 1, level_a: 'random', level_b: 'eps50', game_index: 1, opening_seed: 1, a_color: 'black', result: '1/2-1/2', plies: 200 });
    await addLadderGame(db, { ladder_version: 1, level_a: 'eps50', level_b: 'uci1320', game_index: 0, opening_seed: 2, a_color: 'white', result: '0-1', plies: 30 });
    expect(await ladderGameCount(db, 1, 'random', 'eps50')).toBe(2);
    expect(await ladderGameCount(db, 1, 'uci1320', 'random')).toBe(0);
    expect((await ladderGameIndexes(db, 1, 'random', 'eps50')).sort()).toEqual([0, 1]);
    const games = await loadCalibrationGames(db, 1);
    expect(games).toHaveLength(3);
    expect(games[0]).toEqual({ a: 'random', b: 'eps50', scoreA: 1 });
    expect(games[1]).toEqual({ a: 'random', b: 'eps50', scoreA: 0.5 });
    expect(games[2]).toEqual({ a: 'eps50', b: 'uci1320', scoreA: 0 });
  });

  it('maps White-POV results to the score of level a', () => {
    expect(scoreFor('white', '1-0')).toBe(1);
    expect(scoreFor('white', '0-1')).toBe(0);
    expect(scoreFor('black', '1-0')).toBe(0);
    expect(scoreFor('black', '0-1')).toBe(1);
    expect(scoreFor('white', '1/2-1/2')).toBe(0.5);
    expect(scoreFor('white', null)).toBeNull();
  });
});
