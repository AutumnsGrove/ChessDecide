import { and, asc, desc, eq, gte, sql } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import type { Game, GameStore, Ply } from '@chessdecide/core';
import * as s from './schema.ts';

export type Db = DrizzleD1Database<typeof s>;
const j = (v: unknown) => (v === undefined || v === null ? null : JSON.stringify(v));
const p = <T>(v: string | null): T | undefined => (v ? (JSON.parse(v) as T) : undefined);

export async function saveGame(db: Db, g: Game): Promise<void> {
  const row = {
    id: g.id, status: g.status, status_reason: g.status_reason ?? null, config_json: JSON.stringify(g.config),
    white_player: JSON.stringify(g.config.white), black_player: JSON.stringify(g.config.black),
    series_id: g.series_id ?? null, series_index: g.series_index ?? null, level_id: g.level_id ?? null, level_elo: g.level_elo ?? null,
    model_color: g.model_color ?? null, adjudicated: g.adjudicated ? 1 : 0, start_fen: g.start_fen,
    result: g.result, termination: g.termination, budget_usd: g.config.budget_usd, cost_usd: g.cost_usd,
    created_at: g.created_at, finished_at: g.status === 'finished' || g.status === 'aborted' ? new Date().toISOString() : null,
  };
  await db.insert(s.games).values(row).onConflictDoUpdate({ target: s.games.id, set: { ...row, id: undefined, created_at: undefined } as any });
}

export async function savePly(db: Db, gameId: string, ply: Ply): Promise<void> {
  const row = {
    game_id: gameId, ply: ply.ply, side: ply.side, by: ply.by, uci: ply.uci, san: ply.san, fen_after: ply.fen_after,
    forced: ply.forced ? 1 : 0, attempt_id: ply.decision?.attempt_id || null,
    decision_json: j(ply.decision), engine_json: j(ply.engine_info), eval_json: j(ply.eval), judge_json: j(ply.judge),
    created_at: ply.created_at,
  };
  await db.insert(s.plies).values(row).onConflictDoUpdate({ target: [s.plies.game_id, s.plies.ply], set: row });
}

export async function loadGame(db: Db, id: string): Promise<Game | undefined> {
  const [g] = await db.select().from(s.games).where(eq(s.games.id, id));
  if (!g) return undefined;
  const rows = await db.select().from(s.plies).where(eq(s.plies.game_id, id)).orderBy(asc(s.plies.ply));
  return {
    id: g.id, status: g.status as Game['status'], ...(g.status_reason ? { status_reason: g.status_reason } : {}),
    config: JSON.parse(g.config_json), start_fen: g.start_fen,
    ...(g.series_id ? { series_id: g.series_id } : {}), ...(g.series_index !== null ? { series_index: g.series_index } : {}),
    ...(g.level_id ? { level_id: g.level_id } : {}), ...(g.level_elo !== null ? { level_elo: g.level_elo } : {}),
    ...(g.model_color ? { model_color: g.model_color as Game['model_color'] } : {}),
    adjudicated: !!g.adjudicated, result: (g.result ?? '*') as Game['result'], termination: (g.termination ?? '') as Game['termination'],
    cost_usd: g.cost_usd ?? 0, created_at: g.created_at,
    plies: rows.map((r): Ply => ({
      ply: r.ply, side: r.side as Ply['side'], by: r.by as Ply['by'], uci: r.uci!, san: r.san!, fen_after: r.fen_after!,
      ...(r.forced ? { forced: true } : {}),
      decision: p(r.decision_json) ?? null, engine_info: p(r.engine_json) ?? null, eval: p(r.eval_json) ?? null, judge: p(r.judge_json) ?? null,
      created_at: r.created_at ?? '',
    })),
  };
}

export const d1GameStore = (db: Db): GameStore => ({ saveGame: (g) => saveGame(db, g), savePly: (id, ply) => savePly(db, id, ply) });

export async function listGames(db: Db, limit = 50) {
  return db.select().from(s.games).orderBy(desc(s.games.created_at)).limit(limit);
}

/** Money spent on real (non-cached) calls since an ISO timestamp (or all time). */
export async function spendSince(db: Db, sinceIso?: string): Promise<{ usd: number; calls: number; cache_hits: number }> {
  const where = sinceIso ? gte(s.attempts.created_at, sinceIso) : undefined;
  const [r] = await db.select({
    usd: sql<number>`coalesce(sum(case when ${s.attempts.cache_hit} = 0 then ${s.attempts.cost_usd} else 0 end), 0)`,
    calls: sql<number>`coalesce(sum(case when ${s.attempts.cache_hit} = 0 and ${s.attempts.status} = 'ok' then 1 else 0 end), 0)`,
    hits: sql<number>`coalesce(sum(${s.attempts.cache_hit}), 0)`,
  }).from(s.attempts).where(where ?? sql`1=1`);
  return { usd: r?.usd ?? 0, calls: r?.calls ?? 0, cache_hits: r?.hits ?? 0 };
}

// ---- attempts ----
async function gzipB64(text: string): Promise<string> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  const buf = new Uint8Array(await new Response(stream).arrayBuffer());
  let bin = ''; for (const b of buf) bin += String.fromCharCode(b);
  return btoa(bin);
}
async function gunzipB64(b64: string): Promise<string> {
  const bin = atob(b64); const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
}

export function d1AttemptSink(db: Db, now: () => string = () => new Date().toISOString()) {
  return {
    async record(row: Record<string, any>): Promise<number> {
      const { request_json, response_json, ...rest } = row;
      const [r] = await db.insert(s.attempts).values({
        ...rest, created_at: now(), cache_hit: rest.cache_hit ? 1 : 0, metrics_version: 3,
        request_gz: request_json ? await gzipB64(request_json) : null,
        response_gz: response_json ? await gzipB64(response_json) : null,
      } as any).returning({ id: s.attempts.id });
      return r!.id;
    },
    async findCached(hash: string): Promise<{ response: any } | undefined> {
      const [r] = await db.select({ gz: s.attempts.response_gz }).from(s.attempts)
        .where(and(eq(s.attempts.request_hash, hash), eq(s.attempts.status, 'ok'), eq(s.attempts.cache_hit, 0)))
        .orderBy(desc(s.attempts.id)).limit(1);
      return r?.gz ? { response: JSON.parse(await gunzipB64(r.gz)) } : undefined;
    },
  };
}
