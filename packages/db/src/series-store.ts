/** Series persistence and the API `Series` projection. Spec: docs/API.md §3.3. */
import { and, asc, count, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import {
  BLOCK_SIZE, PRIOR_START_ELO, estimate, pickLeaderSeriesIds, seriesStats,
  type ArmSeries, type Block, type Color, type EloEstimate, type EloPoint, type Ply, type Series, type SeriesGame, type SeriesStats,
  type SeriesGameRec, type SeriesSize, type SeriesStatus, type SeriesSummary,
} from '@chessdecide/core';
import * as s from './schema.ts';
import type { Db } from './store.ts';

export type SeriesRow = typeof s.series.$inferSelect;
export type SeriesRowInput = typeof s.series.$inferInsert;

export async function saveSeries(db: Db, row: SeriesRowInput & { id: string }): Promise<void> {
  await db.insert(s.series).values(row).onConflictDoUpdate({ target: s.series.id, set: row });
}

export async function loadSeriesRow(db: Db, id: string): Promise<SeriesRow | undefined> {
  const [row] = await db.select().from(s.series).where(eq(s.series.id, id));
  return row;
}

export async function listSeriesRows(db: Db): Promise<SeriesRow[]> {
  return db.select().from(s.series).orderBy(asc(s.series.created_at));
}

/** Games of a series in play order. Paused/ready/stopped games count as `running` (in-flight). */
export async function seriesGames(db: Db, id: string): Promise<SeriesGameRec[]> {
  const rows = await db.select().from(s.games).where(eq(s.games.series_id, id)).orderBy(asc(s.games.series_index));
  return rows.map((r) => {
    const index = r.series_index ?? 0;
    const score = typeof r.model_score === 'number' ? (r.model_score as 0 | 0.5 | 1) : undefined;
    return {
      index, block: r.block_index ?? Math.floor(index / BLOCK_SIZE),
      levelId: r.level_id ?? '', levelElo: r.level_elo ?? 0,
      status: r.status === 'finished' ? 'finished' : r.status === 'aborted' ? 'aborted' : 'running',
      ...(score !== undefined ? { score } : {}),
    };
  });
}

export async function setGameSeriesFields(db: Db, gameId: string, fields: Partial<{
  series_id: string | null; series_index: number; block_index: number;
  level_id: string; level_elo: number; model_color: Color; model_score: number; opening_seed: number;
}>): Promise<void> {
  await db.update(s.games).set(fields).where(eq(s.games.id, gameId));
}

function parsePly(r: typeof s.plies.$inferSelect): Ply {
  const p = <T>(v: string | null): T | undefined => (v ? (JSON.parse(v) as T) : undefined);
  return {
    ply: r.ply, side: (r.side ?? 'white') as Ply['side'], by: (r.by ?? 'engine') as Ply['by'],
    uci: r.uci ?? '', san: r.san ?? '', fen_after: r.fen_after ?? '',
    ...(r.forced ? { forced: true } : {}),
    decision: p(r.decision_json) ?? null, engine_info: p(r.engine_json) ?? null,
    eval: p(r.eval_json) ?? null, judge: p(r.judge_json) ?? null,
    created_at: r.created_at ?? '',
  };
}

async function pliesForGames(db: Db, ids: readonly string[]): Promise<Map<string, Ply[]>> {
  const out = new Map<string, Ply[]>();
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    if (chunk.length === 0) continue;
    const rows = await db.select().from(s.plies).where(inArray(s.plies.game_id, chunk)).orderBy(asc(s.plies.ply));
    for (const r of rows) {
      const list = out.get(r.game_id) ?? [];
      list.push(parsePly(r));
      out.set(r.game_id, list);
    }
  }
  return out;
}

function acplOf(plies: readonly Ply[]): number | undefined {
  const judged = plies.filter((p) => p.by === 'model' && !p.forced && p.judge);
  if (judged.length === 0) return undefined;
  return judged.reduce((sum, p) => sum + p.judge!.cpl, 0) / judged.length;
}

export async function buildSeries(db: Db, id: string): Promise<Series | undefined> {
  const row = await loadSeriesRow(db, id);
  if (!row) return undefined;
  const gameRows = await db.select().from(s.games).where(eq(s.games.series_id, id)).orderBy(asc(s.games.series_index));
  const plies = await pliesForGames(db, gameRows.map((g) => g.id));
  return assembleSeries(row, gameRows, plies);
}

/** Pure projection of a series row + its games/plies. Shared by buildSeries and the leaderboard batch. */
export function assembleSeries(
  row: SeriesRow,
  gameRows: (typeof s.games.$inferSelect)[],
  plies: Map<string, Ply[]>,
): Series {
  const games: SeriesGame[] = gameRows.map((r) => {
    const index = r.series_index ?? 0;
    const modelColor = (r.model_color as Color | null) ?? 'white';
    const score = typeof r.model_score === 'number' ? (r.model_score as 0 | 0.5 | 1) : undefined;
    const pl = plies.get(r.id) ?? [];
    const acpl = acplOf(pl);
    return {
      game_id: r.id, index, block: r.block_index ?? Math.floor(index / BLOCK_SIZE),
      level_id: r.level_id ?? '', level_elo: r.level_elo ?? 0, model_color: modelColor,
      status: r.status, result: r.result ?? '*',
      ...(score !== undefined ? { model_score: score } : {}),
      termination: r.termination ?? '', adjudicated: !!r.adjudicated, plies: pl.length,
      ...(acpl !== undefined ? { acpl_model: acpl } : {}),
      cost_usd: r.cost_usd ?? 0,
    };
  });

  const finished = games.filter((g) => g.status === 'finished' && g.model_score !== undefined);
  const rated = finished.map((g) => ({ opponentElo: g.level_elo, score: g.model_score! }));
  const elo: EloEstimate | null = rated.length ? estimate(rated) : null;

  const history: EloPoint[] = [];
  const acc: typeof rated = [];
  for (const g of [...finished].sort((a, b) => a.index - b.index)) {
    acc.push({ opponentElo: g.level_elo, score: g.model_score! });
    const e = estimate(acc);
    history.push({ games: e.games, mean: e.mean, lo: e.lo, hi: e.hi });
  }

  const blocks: Block[] = [];
  for (const b of [...new Set(games.map((g) => g.block))].sort((x, y) => x - y)) {
    const inBlock = games.filter((g) => g.block === b);
    const first = inBlock[0]!;
    const finishedIn = inBlock.filter((g) => g.status === 'finished' && g.model_score !== undefined);
    const before = finished.filter((g) => g.block < b).map((g) => ({ opponentElo: g.level_elo, score: g.model_score! }));
    const after = finished.filter((g) => g.block <= b).map((g) => ({ opponentElo: g.level_elo, score: g.model_score! }));
    blocks.push({
      index: b, level_id: first.level_id, level_elo: first.level_elo, games: inBlock.length,
      score: finishedIn.length ? finishedIn.reduce((sum, g) => sum + g.model_score!, 0) / finishedIn.length : 0,
      posterior_before: before.length ? estimate(before).mean : PRIOR_START_ELO,
      posterior_after: after.length ? estimate(after).mean : PRIOR_START_ELO,
    });
  }

  const secondary = seriesStats(finished.map((g) => ({
    modelColor: g.model_color, score: g.model_score!,
    plies: plies.get(g.game_id) ?? [], costUsd: g.cost_usd, adjudicated: g.adjudicated,
  })));

  const size = JSON.parse(row.size_json) as SeriesSize;
  return {
    id: row.id,
    name: row.name ?? `${row.model_slug} · ${row.arm_id} · ${size.preset}`,
    model: row.model_slug, arm: row.arm_id,
    status: row.status as SeriesStatus,
    ...(row.status_reason ? { status_reason: row.status_reason } : {}),
    size, ladder_version: row.ladder_version, seed: row.seed ?? 0,
    budget_usd: row.budget_usd ?? 1, cost_usd: row.cost_usd ?? 0,
    games, blocks, elo, elo_history: history, secondary, created_at: row.created_at,
  };
}

export async function seriesSummaries(db: Db): Promise<SeriesSummary[]> {
  const rows = await listSeriesRows(db);
  const counts = await db.select({ id: s.games.series_id, n: count() }).from(s.games)
    .where(and(eq(s.games.status, 'finished'), isNotNull(s.games.series_id)))
    .groupBy(s.games.series_id);
  const done = new Map(counts.map((c) => [c.id!, Number(c.n)]));
  return rows.map((r) => {
    const size = JSON.parse(r.size_json) as SeriesSize;
    const w = r.w ?? 0, d = r.d ?? 0, l = r.l ?? 0;
    const elo = r.elo_mean !== null && r.elo_lo !== null && r.elo_hi !== null
      ? {
        mean: r.elo_mean, lo: r.elo_lo, hi: r.elo_hi, half_width: (r.elo_hi - r.elo_lo) / 2,
        games: w + d + l, w, d, l, score_pct: w + d + l ? (w + 0.5 * d) / (w + d + l) : 0,
      }
      : null;
    return {
      id: r.id, name: r.name ?? `${r.model_slug} · ${r.arm_id} · ${size.preset}`,
      model: r.model_slug, arm: r.arm_id, status: r.status as SeriesStatus, size,
      games_done: done.get(r.id) ?? 0, elo, cost_usd: r.cost_usd ?? 0, created_at: r.created_at,
    };
  });
}

/** A series that has stopped changing: its frozen `secondary_json` can be trusted. */
const TERMINAL: readonly string[] = ['finished', 'stopped_budget', 'stopped_error'];

/** Frozen stats for a settled series, or undefined when they must be (re)computed from plies. */
function frozenStats(row: SeriesRow): SeriesStats | undefined {
  if (!row.secondary_json || !TERMINAL.includes(row.status)) return undefined;
  try { return JSON.parse(row.secondary_json) as SeriesStats; } catch { return undefined; }
}

/**
 * Compute a series' secondary stats from its plies and store them on the row. Call when a series ends;
 * `backfillSecondary` uses it for series that finished before the column existed.
 */
export async function freezeSecondary(db: Db, id: string): Promise<SeriesStats | undefined> {
  const series = await buildSeries(db, id);
  if (!series) return undefined;
  await db.update(s.series).set({ secondary_json: JSON.stringify(series.secondary) }).where(eq(s.series.id, id));
  return series.secondary;
}

/** Freeze stats for every settled series that lacks them. Returns the ids it touched. */
export async function backfillSecondary(db: Db): Promise<string[]> {
  const rows = await db.select({ id: s.series.id, status: s.series.status }).from(s.series)
    .where(isNull(s.series.secondary_json));
  const done: string[] = [];
  for (const r of rows) {
    if (!TERMINAL.includes(r.status)) continue;
    await freezeSecondary(db, r.id);
    done.push(r.id);
  }
  return done;
}

/**
 * Leaderboard input: one series per arm on `ladderVersion`, with its rated games and secondary stats.
 * A leaderboard arm is **model + arm** (`liquid/d1-ultra#hinted`): the same arm preset on two models is
 * two different rows. Picks with the metadata-only rule first so untouched series cost no plies.
 *
 * Settled series carry frozen stats (`secondary_json`), so the common case reads only series + game
 * summary rows and never touches `plies`. Only a series without frozen stats (still running, or not yet
 * backfilled) pays for a ply scan.
 */
export async function leaderboardInput(db: Db, ladderVersion: number): Promise<ArmSeries[]> {
  const rows = await listSeriesRows(db);
  if (rows.length === 0) return [];
  const counts = await db.select({ id: s.games.series_id, n: count() }).from(s.games)
    .where(and(eq(s.games.status, 'finished'), isNotNull(s.games.series_id)))
    .groupBy(s.games.series_id);
  const done = new Map(counts.map((c) => [c.id!, Number(c.n)]));
  const armKey = (r: SeriesRow) => `${r.model_slug}#${r.arm_id}`;
  const ids = new Set(pickLeaderSeriesIds(rows.map((r) => ({
    arm_id: armKey(r), series_id: r.id, status: r.status as SeriesStatus,
    ladder_version: r.ladder_version, finished_games: done.get(r.id) ?? 0,
  })), ladderVersion));
  const selected = rows.filter((r) => ids.has(r.id));
  const out: ArmSeries[] = [];
  if (selected.length === 0) return out;

  // One games query for every selected arm (never three per arm), and only the columns the board uses.
  // Chunked like the plies helper: D1 caps bound parameters per statement.
  const gameRows: Array<Pick<typeof s.games.$inferSelect, 'id' | 'series_id' | 'series_index' | 'status' | 'level_elo' | 'model_score'>> = [];
  for (let i = 0; i < selected.length; i += 50) {
    gameRows.push(...await db.select({
      id: s.games.id, series_id: s.games.series_id, series_index: s.games.series_index,
      status: s.games.status, level_elo: s.games.level_elo, model_score: s.games.model_score,
    }).from(s.games).where(inArray(s.games.series_id, selected.slice(i, i + 50).map((r) => r.id)))
      .orderBy(asc(s.games.series_id), asc(s.games.series_index)));
  }
  const gamesBySeries = new Map<string, typeof gameRows>();
  for (const g of gameRows) {
    const list = gamesBySeries.get(g.series_id ?? '') ?? [];
    list.push(g);
    gamesBySeries.set(g.series_id ?? '', list);
  }

  // Slow path, batched: series without frozen stats share one full-games query and one plies scan, so the
  // statement count stays flat as arms grow. Scoped to those series only, never the whole board.
  const unfrozen = selected.filter((r) => !frozenStats(r));
  const computed = new Map<string, SeriesStats>();
  if (unfrozen.length > 0) {
    const fullGames: (typeof s.games.$inferSelect)[] = [];
    for (let i = 0; i < unfrozen.length; i += 50) {
      fullGames.push(...await db.select().from(s.games).where(inArray(s.games.series_id, unfrozen.slice(i, i + 50).map((r) => r.id)))
        .orderBy(asc(s.games.series_id), asc(s.games.series_index)));
    }
    const plies = await pliesForGames(db, fullGames.map((g) => g.id));
    for (const row of unfrozen) {
      computed.set(row.id, assembleSeries(row, fullGames.filter((g) => g.series_id === row.id), plies).secondary);
    }
  }

  for (const row of selected) {
    const mine = gamesBySeries.get(row.id) ?? [];
    const rated = mine.filter((g) => g.status === 'finished' && typeof g.model_score === 'number')
      .map((g) => ({ opponentElo: g.level_elo ?? 0, score: g.model_score as 0 | 0.5 | 1 }));
    const stats = frozenStats(row) ?? computed.get(row.id)!;
    out.push({
      arm_id: armKey(row), model: row.model_slug, arm: row.arm_id,
      series_id: row.id, status: row.status as SeriesStatus, ladder_version: row.ladder_version,
      games: rated,
      w: rated.filter((g) => g.score === 1).length,
      d: rated.filter((g) => g.score === 0.5).length,
      l: rated.filter((g) => g.score === 0).length,
      cost_usd: row.cost_usd ?? 0,
      stats,
    });
  }
  return out;
}
