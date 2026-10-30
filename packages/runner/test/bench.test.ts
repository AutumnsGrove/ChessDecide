import { mkdtempSync, readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/d1';
import { desc, eq } from 'drizzle-orm';
import { getPlatformProxy } from 'wrangler';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { legalMoves, type BenchStopReason, type JudgePort, type LadderLevel } from '@chessdecide/core';
import { RandomOpponent } from '@chessdecide/engine';
import * as schema from '@chessdecide/db/schema';
import type { Db } from '@chessdecide/db';
import { benchStatus, runBench, writeBenchArtifacts, BenchPreflightError, type BenchRunOptions } from '../src/bench.ts';
import { loadLadderVersion } from '../src/ladder.ts';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const MIGRATIONS = fileURLToPath(new URL('../../db/migrations/', import.meta.url));
const CONFIG = fileURLToPath(new URL('../../../apps/web/wrangler.jsonc', import.meta.url));
const SMOKE = join(ROOT, 'bench/plans/smoke.json');
const LADDER = loadLadderVersion(join(ROOT, 'data'), 2)!.file;

const judge: JudgePort = {
  async oracle(fen) {
    const white = fen.split(' ')[1] === 'w';
    const cp = white ? 1000 : -1000;
    const wdl: [number, number, number] = white ? [1000, 0, 0] : [0, 0, 1000];
    return { depth: 6, sf_version: 'fake', rows: legalMoves(fen).map((m) => ({ uci: m.uci, san: m.san, cp, wp: white ? 100 : 0, wdl })) };
  },
  async evalPosition(fen) {
    const white = fen.split(' ')[1] === 'w';
    return { cp_stm: white ? 1000 : -1000, wdl_stm: white ? [1000, 0, 0] : [0, 0, 1000] };
  },
};
const rt = { judge, engines: [], close: async () => {} };
const randomOpponent = async (level: LadderLevel, rng: () => number) => new RandomOpponent(rng, { levelId: level.id, levelElo: level.elo });

let db: Db; let dispose: () => Promise<void>;
beforeAll(async () => {
  const proxy = await getPlatformProxy<{ DB: D1Database }>({ configPath: CONFIG, persist: { path: mkdtempSync(join(tmpdir(), 'cd-bench-')) } });
  dispose = proxy.dispose;
  for (const f of readdirSync(MIGRATIONS).filter((x) => x.endsWith('.sql')).sort())
    for (const st of readFileSync(MIGRATIONS + f, 'utf8').split('--> statement-breakpoint'))
      if (st.trim()) await proxy.env.DB.exec(st.trim().replace(/\s+/g, ' '));
  db = drizzle(proxy.env.DB, { schema });
}, 60_000);
afterAll(async () => { await dispose?.(); });
beforeEach(async () => {
  await db.delete(schema.plies);
  await db.delete(schema.games);
  await db.delete(schema.series);
  await db.delete(schema.ladder_levels);
});
const preflightError = async (o: BenchRunOptions): Promise<BenchPreflightError> => {
  try { await runBench(o); } catch (e) { if (e instanceof BenchPreflightError) return e; throw e; }
  throw new Error('expected a BenchPreflightError');
};

function dirs() {
  const base = mkdtempSync(join(tmpdir(), 'cd-bench-run-'));
  const data = join(base, 'data'); const reports = join(base, 'reports');
  mkdirSync(data, { recursive: true }); mkdirSync(reports, { recursive: true });
  return { base, data, reports };
}

const opts = (over: Partial<BenchRunOptions> = {}): BenchRunOptions => {
  const d = dirs();
  return {
    planPath: SMOKE, mock: true, db, rt, ladder: LADDER, judge, makeOpponentFor: randomOpponent,
    dataDir: d.data, reportsDir: d.reports, gitEmail: 'bench@test', log: () => {}, ...over,
  };
};

const rowsByName = (prefix: string) => db.select().from(schema.series).where(eq(schema.series.name, `${prefix}typesafe/jev-1.14#clean`));
const countGames = async () => (await db.select().from(schema.games)).length;

function planFile(over: Record<string, unknown>): string {
  const smoke = JSON.parse(readFileSync(SMOKE, 'utf8')) as Record<string, unknown>;
  const dir = mkdtempSync(join(tmpdir(), 'cd-bench-plan-'));
  const path = join(dir, 'plan.json');
  writeFileSync(path, JSON.stringify({ ...smoke, ...over }));
  return path;
}

describe('bench runner (mock, in-process)', () => {
  it('runs the smoke plan and writes the bundle', async () => {
    const o = opts({ sql: true });
    const res = await runBench(o);
    expect(res.exitCode).toBe(0);
    expect(res.stopReason).toBe('completed');
    expect(res.cells).toHaveLength(1);
    expect(res.cells[0]!.state).toBe('finished');
    expect(res.cells[0]!.games).toBe(3);

    const dir = res.artifactsDir;
    for (const f of ['report.md', 'summary.json', 'leaderboard.csv']) expect(existsSync(join(dir, f)), f).toBe(true);
    const report = readFileSync(join(dir, 'report.md'), 'utf8');
    expect(report).toContain('**MOCK RUN — do not compare**');
    expect(report).toContain(res.cells[0]!.seriesId!.slice(0, 10));
    const summary = JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf8'));
    expect(summary.totals).toMatchObject({ cells: 1, finished: 1, games: 3 });
    expect(summary.cells[0].elo).not.toBeNull();
    expect(readdirSync(join(dir, 'series'))).toHaveLength(1);
    expect(existsSync(join(dir, 'sql', 'part-001.sql'))).toBe(true);
    expect(readFileSync(join(dir, 'sql', 'part-001.sql'), 'utf8')).toContain('INSERT OR REPLACE INTO "series"');
  }, 120_000);

  it('never re-runs a finished cell', async () => {
    const o = opts();
    const first = await runBench(o);
    const seriesId = first.cells[0]!.seriesId;
    const games = await countGames();
    const second = await runBench(o);
    expect(second.exitCode).toBe(0);
    expect(await rowsByName('smoke/')).toHaveLength(1);
    expect((await rowsByName('smoke/'))[0]!.id).toBe(seriesId);
    expect(await countGames()).toBe(games);
  }, 120_000);

  it('resumes a paused series instead of creating a second one', async () => {
    const o = opts();
    const first = await runBench(o);
    const [row] = await rowsByName('smoke/');
    const last = (await db.select().from(schema.games).where(eq(schema.games.series_id, row!.id)).orderBy(desc(schema.games.series_index)))[0]!;
    await db.delete(schema.plies).where(eq(schema.plies.game_id, last.id));
    await db.delete(schema.games).where(eq(schema.games.id, last.id));
    await db.update(schema.series).set({ status: 'paused', status_reason: 'test' }).where(eq(schema.series.id, row!.id));
    const manifestPath = join(o.dataDir!, 'bench', first.runId, 'manifest.json');
    const m = JSON.parse(readFileSync(manifestPath, 'utf8'));
    m.finished_at = null; m.stop_reason = null;
    writeFileSync(manifestPath, JSON.stringify(m));

    const second = await runBench(o);
    expect(second.cells[0]!.seriesId).toBe(row!.id);
    expect(second.cells[0]!.games).toBe(3);
    const rows = await db.select().from(schema.series).where(eq(schema.series.name, 'smoke/typesafe/jev-1.14#clean'));
    expect(rows).toHaveLength(1);
  }, 180_000);

  it('--dry-run creates no series and writes no artifacts', async () => {
    const o = opts({ dryRun: true });
    const res = await runBench(o);
    expect(res.exitCode).toBe(0);
    expect(await rowsByName('smoke/')).toHaveLength(0);
    expect(existsSync(join(o.dataDir!, 'bench'))).toBe(false);
    expect(readdirSync(o.reportsDir!)).toHaveLength(0);
  }, 60_000);

  it('--no-sql writes no sql directory', async () => {
    const res = await runBench(opts({ sql: false }));
    expect(existsSync(join(res.artifactsDir, 'sql'))).toBe(false);
  }, 120_000);

  it('refuses to write SQL when ladder_levels has no rows for the run ladder', async () => {
    const o = opts({ sql: true });
    const res = await runBench(o);
    await db.delete(schema.ladder_levels).where(eq(schema.ladder_levels.ladder_version, 2));
    await expect(writeBenchArtifacts(o, res.runId)).rejects.toThrow(/ladder_levels missing for v2/);
  }, 120_000);

  it('stops on budget when the run cap leaves less than $0.05', async () => {
    const o = opts({ planPath: planFile({ series_cap_usd: 0.01, run_cap_usd: 0.01 }) });
    const res = await runBench(o);
    expect(res.stopReason).toBe('stopped_budget');
    expect(res.exitCode).toBe(3);
    expect(res.cells[0]!.state).toBe('pending');
    expect(await rowsByName('smoke/')).toHaveLength(0);
  }, 60_000);

  describe('parallel_models', () => {
    /** Peak number of games in flight at once, with a short pause per move so overlap is observable. */
    function counting() {
      const peak = { open: 0, max: 0 };
      const makeOpponentFor = async (level: LadderLevel, rng: () => number) => {
        peak.open++; peak.max = Math.max(peak.max, peak.open);
        const inner = new RandomOpponent(rng, { levelId: level.id, levelElo: level.elo });
        return { move: async (fen: string) => { await new Promise((r) => setTimeout(r, 2)); return inner.move(fen); }, close: async () => { peak.open--; } };
      };
      return { peak, makeOpponentFor };
    }
    const plan = (over: Record<string, unknown>) => planFile({ concurrency: 1, size: { preset: 'custom', games: 2 }, ...over });

    it('defaults to one cell at a time', async () => {
      const c = counting();
      const res = await runBench(opts({ planPath: plan({ models: ['m/one', 'm/two'] }), makeOpponentFor: c.makeOpponentFor }));
      expect(res.cells.map((x) => x.state)).toEqual(['finished', 'finished']);
      expect(c.peak.max).toBe(1);
    }, 120_000);

    it('runs different models at the same time', async () => {
      const c = counting();
      const res = await runBench(opts({ planPath: plan({ models: ['m/one', 'm/two'], parallel_models: 2 }), makeOpponentFor: c.makeOpponentFor }));
      expect(res.stopReason).toBe('completed');
      expect(res.cells.map((x) => x.state)).toEqual(['finished', 'finished']);
      expect(res.cells.map((x) => x.games)).toEqual([2, 2]);
      expect(c.peak.max).toBe(2);
    }, 120_000);

    it('never runs two cells of the same model together', async () => {
      const c = counting();
      const res = await runBench(opts({ planPath: plan({ arms: ['clean', 'hinted'], parallel_models: 2 }), makeOpponentFor: c.makeOpponentFor }));
      expect(res.cells.map((x) => x.state)).toEqual(['finished', 'finished']);
      expect(c.peak.max).toBe(1);
    }, 120_000);

    it('reserves a running cell\'s unspent allowance, so parallel cells wait instead of overshooting the run cap', async () => {
      // 0.06 cap, 0.05 per cell: the second model cannot start until the first hands its allowance back.
      const c = counting();
      const res = await runBench(opts({ planPath: plan({ models: ['m/one', 'm/two'], parallel_models: 2, series_cap_usd: 0.05, run_cap_usd: 0.06 }), makeOpponentFor: c.makeOpponentFor }));
      expect(res.cells.map((x) => x.state)).toEqual(['finished', 'finished']);
      expect(c.peak.max).toBe(1);
    }, 120_000);

    it('rejects an out-of-range value', async () => {
      await expect(runBench(opts({ planPath: plan({ parallel_models: 5 }) }))).rejects.toThrow(/parallel_models/);
    });
  });

  it('reports status from the DB', async () => {
    const o = opts();
    const res = await runBench(o);
    const text = await benchStatus({ runId: res.runId, db, dataDir: o.dataDir! });
    expect(text).toContain('finished');
    expect(text).toContain('3/3');
    expect(text).toContain('smoke/typesafe/jev-1.14#clean');
  }, 120_000);
});

describe('bench preflight', () => {
  const model = (price: number) => [{
    slug: 'typesafe/jev-1.14', canonical_slug: null, name: 'Jev', context_length: 200_000,
    price_in_per_m: price, input_modalities: ['text'], roster: true, disabled_reason: null,
  }];

  it('names the missing key and writes nothing', async () => {
    const o = opts({ mock: false, hasKey: () => false, catalogModels: model(0.2) });
    const err = await preflightError(o);
    expect(err.checks.find((c) => c.name === 'OpenRouter key')?.ok).toBe(false);
    expect(await rowsByName('smoke/')).toHaveLength(0);
  }, 60_000);

  it('names an unknown model', async () => {
    const o = opts({ mock: false, hasKey: () => true, catalogModels: [] });
    const err = await preflightError(o);
    expect(err.checks.find((c) => c.name === 'catalog')?.detail).toMatch(/unknown model/);
  }, 60_000);

  it('refuses a typical estimate over the run cap unless allowed', async () => {
    const o = opts({ mock: false, hasKey: () => true, catalogModels: model(100_000) });
    const err = await preflightError(o);
    expect(err.checks.find((c) => c.name === 'estimate')?.ok).toBe(false);
    const allowed = await runBench({ ...o, allowOverCap: true, dryRun: true });
    expect(allowed.exitCode).toBe(0);
  }, 60_000);

  it('says pnpm db:migrate when the schema is missing', async () => {
    const proxy = await getPlatformProxy<{ DB: D1Database }>({ configPath: CONFIG, persist: { path: mkdtempSync(join(tmpdir(), 'cd-bench-empty-')) } });
    const empty = drizzle(proxy.env.DB, { schema });
    const err = await preflightError(opts({ db: empty }));
    expect(err.checks.find((c) => c.name === 'database')?.detail).toMatch(/pnpm db:migrate/);
    await proxy.dispose();
  }, 60_000);

  it('records a stop reason for a failed cell without stopping the run', async () => {
    const o = opts({ stopOnError: false });
    const res = await runBench(o);
    expect(['completed', 'stopped_error'] as BenchStopReason[]).toContain(res.stopReason);
  }, 120_000);
});
