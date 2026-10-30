/** Ladder persistence: calibrated levels and CPU calibration games. */
import { and, eq, inArray, max } from 'drizzle-orm';
import { DEFAULT_LADDER, type CalibGame, type LadderFile, type LadderLevel } from '@chessdecide/core';
import * as s from './schema.ts';
import type { Db } from './store.ts';

const nominalOrder = (id: string) => {
  const i = DEFAULT_LADDER.levels.findIndex((l) => l.id === id);
  return i < 0 ? DEFAULT_LADDER.levels.length : i;
};

export async function saveLadderLevels(db: Db, file: LadderFile): Promise<void> {
  for (const l of file.levels) {
    const params_json = JSON.stringify({
      ...(l.eps !== undefined ? { eps: l.eps } : {}),
      ...(l.uci_elo !== undefined ? { uci_elo: l.uci_elo } : {}),
    });
    const row = {
      ladder_version: file.version, id: l.id, kind: l.kind, params_json,
      elo: l.elo, se: l.se ?? null, games: l.games ?? null,
    };
    await db.insert(s.ladder_levels).values(row)
      .onConflictDoUpdate({ target: [s.ladder_levels.ladder_version, s.ladder_levels.id], set: row });
  }
}

export async function loadLadderLevels(db: Db, version: number): Promise<LadderLevel[]> {
  const rows = await db.select().from(s.ladder_levels).where(eq(s.ladder_levels.ladder_version, version));
  return rows.map((r): LadderLevel => {
    const p = JSON.parse(r.params_json) as { eps?: number; uci_elo?: number };
    const label = DEFAULT_LADDER.levels.find((l) => l.id === r.id)?.label ?? r.id;
    return {
      id: r.id, kind: r.kind as LadderLevel['kind'], label, elo: r.elo,
      ...(r.se !== null ? { se: r.se } : {}), ...(r.games !== null ? { games: r.games } : {}),
      ...(p.eps !== undefined ? { eps: p.eps } : {}), ...(p.uci_elo !== undefined ? { uci_elo: p.uci_elo } : {}),
    };
  }).sort((a, b) => nominalOrder(a.id) - nominalOrder(b.id) || (a.id < b.id ? -1 : 1));
}

const VERDICT = ['finished', 'stopped_budget', 'stopped_error'] as const;

/** Highest ladder version that has a series with a verdict; falls back to the highest levels present. */
export async function publishedLadderVersion(db: Db): Promise<number | undefined> {
  const [row] = await db.select({ v: max(s.series.ladder_version) }).from(s.series)
    .where(inArray(s.series.status, [...VERDICT]));
  if (row?.v !== null && row?.v !== undefined) return Number(row.v);
  const [lvl] = await db.select({ v: max(s.ladder_levels.ladder_version) }).from(s.ladder_levels);
  return lvl?.v === null || lvl?.v === undefined ? undefined : Number(lvl.v);
}

/**
 * The ladder a read-only deployment should present: the ruler its published series were rated on.
 * `undefined` when nothing was published, so callers can fall back to the nominal ladder.
 */
export async function loadPublishedLadder(db: Db): Promise<LadderFile | undefined> {
  const version = await publishedLadderVersion(db);
  if (version === undefined) return undefined;
  const levels = await loadLadderLevels(db, version);
  if (levels.length === 0) return undefined;
  return {
    version, calibrated: version > 0, movetime_ms: DEFAULT_LADDER.movetime_ms, sf_version: 'unknown',
    anchor: DEFAULT_LADDER.anchor, levels,
  };
}

export interface LadderGameRow {
  ladder_version: number;
  level_a: string; level_b: string;
  game_index?: number;
  opening_seed?: number; a_color?: string; result?: string; plies?: number;
}

export async function addLadderGame(db: Db, row: LadderGameRow): Promise<void> {
  await db.insert(s.ladder_games).values(row);
}

/** Start a fresh run of `version` (only used without --resume). */
export async function clearLadderGames(db: Db, version: number): Promise<void> {
  await db.delete(s.ladder_games).where(eq(s.ladder_games.ladder_version, version));
}

export async function ladderGameCount(db: Db, version: number, a: string, b: string): Promise<number> {
  const rows = await db.select({ id: s.ladder_games.id }).from(s.ladder_games)
    .where(and(eq(s.ladder_games.ladder_version, version), eq(s.ladder_games.level_a, a), eq(s.ladder_games.level_b, b)));
  return rows.length;
}

/** Game indexes already stored for one pair (resume skips exactly these). */
export async function ladderGameIndexes(db: Db, version: number, a: string, b: string): Promise<number[]> {
  const rows = await db.select({ i: s.ladder_games.game_index }).from(s.ladder_games)
    .where(and(eq(s.ladder_games.ladder_version, version), eq(s.ladder_games.level_a, a), eq(s.ladder_games.level_b, b)));
  return rows.map((r) => r.i).filter((i): i is number => typeof i === 'number');
}

/** White-POV result → score for level `a` (a_color is 'white' or 'black'). */
export function scoreFor(aColor: string | null, result: string | null): 0 | 0.5 | 1 | null {
  if (result !== '1-0' && result !== '0-1' && result !== '1/2-1/2') return null;
  if (result === '1/2-1/2') return 0.5;
  const whiteWon = result === '1-0';
  return (aColor === 'white') === whiteWon ? 1 : 0;
}

export async function loadCalibrationGames(db: Db, version: number): Promise<CalibGame[]> {
  const rows = await db.select().from(s.ladder_games).where(eq(s.ladder_games.ladder_version, version));
  const out: CalibGame[] = [];
  for (const r of rows) {
    const scoreA = scoreFor(r.a_color, r.result);
    if (scoreA !== null) out.push({ a: r.level_a, b: r.level_b, scoreA });
  }
  return out;
}
