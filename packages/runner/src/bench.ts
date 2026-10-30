/**
 * Headless bench runner: a plan expands into series, runs them in-process, resumes instead of
 * re-spending, and writes a committed results bundle. Spec: docs/build/tasks/T13-headless-bench.md.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statfsSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { desc, eq, like } from 'drizzle-orm';
import {
  benchLabel, benchReport as renderBenchReport, benchSummary as renderBenchSummary,
  buildLeaderboard, cellState, compareArms, expandCells, leaderboardCsv, parseBenchPlan, planPrefix,
  seriesCapFor, sizeTarget,
  type BenchCell, type BenchCellResult, type BenchPlan, type BenchStopReason,
  type GameEvent, type JudgePort, type LadderFile, type LadderLevel, type LeaderRow,
  type SeriesConfig, type SeriesEvent, type SeriesSize,
} from '@chessdecide/core';
import { EventHub } from '@chessdecide/api';
import {
  buildSeries, leaderboardInput, loadLadderLevels, loadSeriesRow, saveLadderLevels, saveSeries,
  type Db, type SeriesRow,
} from '@chessdecide/db';
import * as schema from '@chessdecide/db/schema';
import { estimateSeries, type ModelInfo } from '@chessdecide/providers';
import type { Opponent } from '@chessdecide/engine';
import { buildPorts, createRuntime, getCatalog, type Runtime } from './runtime.ts';
import { SeriesControlPlane, recoverSeries } from './series.ts';
import { loadLadderVersion } from './ladder.ts';
import { dataDir as defaultDataDir, findStockfish, isMock, loadEnv, openRouterKey } from './config.ts';
import { openLocalDb } from './d1.ts';
import { runPublish } from './publish.ts';

export interface BenchRunOptions {
  planPath: string;
  newRun?: boolean;
  resume?: boolean;                 // default true
  runId?: string;
  dryRun?: boolean;
  mock?: boolean;
  sql?: boolean;
  stopOnError?: boolean;
  commitEachCell?: boolean;
  allowOverCap?: boolean;
  reportsDir?: string;
  log?: (line: string) => void;
  // Test seams (documented in docs/QUESTIONS.md): injected dependencies skip the matching preflight.
  db?: Db;
  rt?: Runtime;
  ladder?: LadderFile;
  catalogModels?: ModelInfo[];
  hasKey?: () => boolean;
  gitEmail?: string | null;
  dataDir?: string;
  judge?: JudgePort;
  makeOpponentFor?: (level: LadderLevel, rng: () => number) => Promise<Opponent>;
}

export interface BenchRunResult {
  runId: string; stopReason: BenchStopReason; artifactsDir: string;
  cells: BenchCellResult[]; exitCode: 0 | 2 | 3 | 130;
}

export class BenchPreflightError extends Error {
  constructor(readonly checks: PreflightCheck[]) {
    const failed = checks.filter((c) => !c.ok).map((c) => c.name);
    super(`preflight failed: ${failed.join(', ')}`);
    this.name = 'BenchPreflightError';
  }
}

export interface PreflightCheck { ok: boolean; name: string; detail: string }
export type { BenchStopReason } from '@chessdecide/core';

interface Manifest {
  run_id: string; plan_name: string; plan_path: string; plan_sha256: string; plan: BenchPlan;
  prefix: string; seed: number; started_at: string; finished_at: string | null; stop_reason: BenchStopReason | null;
  env: { node: string; stockfish: string; gitSha: string | null; host: string; mock: boolean };
  ladder: { version: number; calibrated: boolean; file: string | null };
  git_email: string | null;
}

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/** Plan paths are written repo-relative; the CLI runs from packages/runner, so resolve both ways. */
function repoPath(p: string): string {
  if (p.startsWith('/')) return p;
  const fromCwd = join(process.env.INIT_CWD ?? process.cwd(), p);
  if (existsSync(fromCwd)) return fromCwd;
  return join(REPO_ROOT, p);
}

const stamp = (d = new Date()) => {
  const iso = d.toISOString();
  return `${iso.slice(0, 10).replace(/-/g, '')}-${iso.slice(11, 13)}${iso.slice(14, 16)}`;
};
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
const mascot = (status: string) => (status === 'finished' ? '✓' : status === 'stopped_budget' ? '!' : status === 'running' ? '…' : '×');

const stateOf = (row: SeriesRow | undefined, games: number): BenchCellResult['state'] | undefined =>
  row ? cellState({ status: row.status, status_reason: row.status_reason }, games) : undefined;

const targetGames = (size: SeriesSize): number | null => sizeTarget(size);

// ---- filesystem ----

const benchRoot = (dataRoot: string) => join(dataRoot, 'bench');
const runDir = (dataRoot: string, runId: string) => join(benchRoot(dataRoot), runId);

function readManifests(dataRoot: string): Manifest[] {
  const root = benchRoot(dataRoot);
  if (!existsSync(root)) return [];
  const out: Manifest[] = [];
  for (const dir of readdirSync(root)) {
    const path = join(root, dir, 'manifest.json');
    if (!existsSync(path)) continue;
    try { out.push(JSON.parse(readFileSync(path, 'utf8')) as Manifest); } catch { /* ignore scratch */ }
  }
  return out.sort((a, b) => (a.started_at < b.started_at ? -1 : 1));
}

function writeAtomic(path: string, text: string): void {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, text, 'utf8');
  renameSync(tmp, path);
}

// ---- DB helpers ----

const seriesByName = async (db: Db, name: string): Promise<SeriesRow | undefined> => {
  const rows = await db.select().from(schema.series).where(eq(schema.series.name, name))
    .orderBy(desc(schema.series.created_at)).limit(1);
  return rows[0];
};
const seriesByPrefix = async (db: Db, prefix: string): Promise<SeriesRow[]> =>
  db.select().from(schema.series).where(like(schema.series.name, `${prefix}%`));
const spentFor = (rows: readonly SeriesRow[]) => rows.reduce((n, r) => n + (r.cost_usd ?? 0), 0);

// ---- preflight ----

interface Ctx {
  o: BenchRunOptions; plan: BenchPlan; sha: string; mock: boolean; log: (line: string) => void;
  dataRoot: string; db: Db; rt: Runtime; ownDb: boolean; ownRt: boolean;
  ladder: LadderFile; ladderFile: string | null;
  env: Manifest['env'];
  models?: ModelInfo[];
}

async function openCtx(o: BenchRunOptions): Promise<{ ctx: Ctx; checks: PreflightCheck[]; close: () => Promise<void> }> {
  loadEnv();
  const planPath = repoPath(o.planPath);
  const raw = readFileSync(planPath, 'utf8');
  const plan = parseBenchPlan(JSON.parse(raw));
  const sha = sha256(raw);
  const mock = o.mock ?? isMock();
  const log = o.log ?? ((line: string) => console.log(line));
  const dataRoot = o.dataDir ?? defaultDataDir();

  let ownRt = false, closeDb: (() => Promise<void>) | undefined;
  let db: Db;
  if (o.db) db = o.db;
  else { const opened = await openLocalDb(); db = opened.db; closeDb = opened.close; }
  const rt = o.rt ?? (ownRt = true, await createRuntime());

  const ladderCheck = loadLadderVersion(dataRoot, plan.ladder_version);
  const ladder = o.ladder ?? ladderCheck?.file;
  const ladderFile = o.ladder ? null : (ladderCheck?.path ?? null);

  const env: Manifest['env'] = {
    node: process.versions.node,
    stockfish: await (async () => { try { return (await rt.engines[0]?.version()) ?? 'unknown'; } catch { return 'unknown'; } })(),
    gitSha: (() => { try { return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { return null; } })(),
    host: hostname(),
    mock,
  };

  let models: ModelInfo[] | undefined = o.catalogModels;
  const ctx: Ctx = { o, plan, sha, mock, log, dataRoot, db, rt, ownDb: !o.db, ownRt, ladder: ladder!, ladderFile, env, ...(models ? { models } : {}) };
  const checks: PreflightCheck[] = [];

  // 1. git identity: the final commit must not fail after hours.
  const email = o.gitEmail !== undefined ? o.gitEmail : (() => {
    try { return execFileSync('git', ['config', 'user.email'], { encoding: 'utf8' }).trim() || null; } catch { return null; }
  })();
  checks.push(email
    ? { ok: true, name: 'git identity', detail: email }
    : { ok: false, name: 'git identity', detail: 'git config user.email is not set; the results commit would fail' });

  // 2. key
  const hasKey = o.hasKey ?? (() => !!openRouterKey());
  checks.push(mock || hasKey()
    ? { ok: true, name: 'OpenRouter key', detail: mock ? 'skipped (mock)' : 'present' }
    : { ok: false, name: 'OpenRouter key', detail: 'OPENROUTER_API_KEY is not set (add it to .env)' });

  // 3. Stockfish
  if (o.rt) checks.push({ ok: true, name: 'Stockfish', detail: 'skipped (injected runtime)' });
  else {
    try { const p = findStockfish(); checks.push({ ok: true, name: 'Stockfish', detail: p }); }
    catch (e) { checks.push({ ok: false, name: 'Stockfish', detail: e instanceof Error ? e.message : String(e) }); }
  }

  // 4. catalog + estimate gate
  if (mock) checks.push({ ok: true, name: 'catalog', detail: 'skipped (mock)' });
  else {
    try {
      models ??= await getCatalog().list();
      ctx.models = models;
      const missing = plan.models.filter((slug) => !models!.some((m) => m.slug === slug));
      const disabled = plan.models.filter((slug) => models!.find((m) => m.slug === slug)?.disabled_reason);
      if (missing.length) checks.push({ ok: false, name: 'catalog', detail: `unknown model ${missing.join(', ')}` });
      else if (disabled.length) checks.push({ ok: false, name: 'catalog', detail: `model disabled: ${disabled.join(', ')}` });
      else checks.push({ ok: true, name: 'catalog', detail: plan.models.map((s) => `${s} $${models!.find((m) => m.slug === s)!.price_in_per_m.toFixed(2)}/M in`).join(' · ') });
    } catch (e) {
      checks.push({ ok: false, name: 'catalog', detail: `catalog unreachable: ${e instanceof Error ? e.message : String(e)}` });
    }
  }

  // 6. DB (before the ladder import: a fresh box has no tables yet)
  try { await db.select({ id: schema.series.id }).from(schema.series).limit(1); checks.push({ ok: true, name: 'database', detail: 'series table present' }); }
  catch { checks.push({ ok: false, name: 'database', detail: 'series table missing — run `pnpm db:migrate`' }); }

  // 5. ladder
  const fixedLevel = plan.ladder.mode === 'fixed' ? plan.ladder.level : null;
  if (!ladder) checks.push({ ok: false, name: 'ladder', detail: `data/ladder/ladder-v${plan.ladder_version}.json is missing or invalid` });
  else if (ladder.version !== plan.ladder_version) checks.push({ ok: false, name: 'ladder', detail: `file is v${ladder.version}, plan wants v${plan.ladder_version}` });
  else if (fixedLevel !== null && !ladder.levels.some((l) => l.id === fixedLevel))
    checks.push({ ok: false, name: 'ladder', detail: `fixed level ${fixedLevel} is not in ladder v${ladder.version}` });
  else checks.push({ ok: true, name: 'ladder', detail: `v${ladder.version}${ladder.calibrated ? '' : ' (UNcalibrated)'}${ladderFile ? ` · ${ladderFile}` : ''}` });

  if (ladder && fixedLevel !== null && ladder.levels.some((l) => l.id === fixedLevel)) {
    try {
      const rows = await loadLadderLevels(db, plan.ladder_version);
      if (rows.length === 0) { await saveLadderLevels(db, ladder); checks.push({ ok: true, name: 'ladder rows', detail: `imported ${ladder.levels.length} levels into ladder_levels` }); }
    } catch (e) {
      checks.push({ ok: false, name: 'ladder rows', detail: e instanceof Error ? e.message : String(e) });
    }
  }

  // 7. disk
  try {
    const s = statfsSync(dataRoot);
    const freeGb = (s.bavail * s.bsize) / 1e9;
    checks.push(freeGb >= 1
      ? { ok: true, name: 'disk', detail: `${freeGb.toFixed(1)} GB free` }
      : { ok: false, name: 'disk', detail: `only ${freeGb.toFixed(2)} GB free on the data volume` });
  } catch { checks.push({ ok: true, name: 'disk', detail: 'unknown (statfs unavailable)' }); }

  // 8. estimate gate
  if (mock || !models) checks.push({ ok: true, name: 'estimate', detail: mock ? 'skipped (mock)' : 'skipped (catalog unavailable)' });
  else {
    try {
      let typical = 0, worst = 0;
      for (const cell of expandCells(plan, planPrefix(plan))) {
        const e = estimateSeries(cellConfig(ctx, cell), models);
        typical += e.typical.est_cost_usd;
        worst += e.worst_case.est_cost_usd;
      }
      const over = typical > plan.run_cap_usd;
      const detail = `typical $${typical.toFixed(4)} · worst $${worst.toFixed(4)} of $${plan.run_cap_usd.toFixed(2)} cap`;
      checks.push(over && !o.allowOverCap
        ? { ok: false, name: 'estimate', detail: `${detail} — typical exceeds the run cap (--allow-over-cap to proceed)` }
        : { ok: true, name: 'estimate', detail: `${detail}${over ? ' (over cap, allowed)' : ''}` });
    } catch (e) {
      checks.push({ ok: false, name: 'estimate', detail: e instanceof Error ? e.message : String(e) });
    }
  }

  const close = async () => {
    if (ownRt) await rt.close();
    if (closeDb) await closeDb();
  };
  return { ctx, checks, close };
}

function cellConfig(ctx: Ctx, cell: BenchCell, budget = ctx.plan.series_cap_usd): SeriesConfig {
  const p = ctx.plan;
  return {
    name: cell.seriesName, model: cell.model, arm: cell.arm, size: p.size, ladder: p.ladder,
    seed: p.seed ?? Number(stamp().slice(0, 8)), budget_usd: budget,
    concurrency: p.concurrency, judge_depth: p.judge_depth,
  } as SeriesConfig;
}

// ---- status ----

interface StatusCell {
  index: number; name: string; series_id: string | null; state: string; games: number; target: number | null;
  cost_usd: number; elo: { mean: number; lo: number; hi: number } | null;
}
interface StatusFile {
  run_id: string; prefix: string; updated_at: string; stop_reason: BenchStopReason | null;
  totals: { cells: number; finished: number; games: number; cost_usd: number };
  cells: StatusCell[];
}

async function buildStatus(ctx: Ctx, runId: string, prefix: string, stopReason: BenchStopReason | null): Promise<StatusFile> {
  const rows = await seriesByPrefix(ctx.db, prefix);
  const byName = new Map(rows.map((r) => [r.name ?? '', r]));
  const cells: StatusCell[] = [];
  for (const cell of expandCells(ctx.plan, prefix)) {
    const row = byName.get(cell.seriesName);
    if (!row) { cells.push({ index: cell.index, name: cell.seriesName, series_id: null, state: 'pending', games: 0, target: targetGames(ctx.plan.size), cost_usd: 0, elo: null }); continue; }
    const s = await buildSeries(ctx.db, row.id);
    const games = s ? s.games.filter((g) => g.status === 'finished').length : 0;
    cells.push({
      index: cell.index, name: cell.seriesName, series_id: row.id,
      state: stateOf(row, games) ?? 'pending', games, target: targetGames(ctx.plan.size),
      cost_usd: row.cost_usd ?? 0,
      elo: s?.elo ? { mean: s.elo.mean, lo: s.elo.lo, hi: s.elo.hi } : null,
    });
  }
  const finished = cells.filter((c) => c.state === 'finished').length;
  return {
    run_id: runId, prefix, updated_at: new Date().toISOString(), stop_reason: stopReason,
    totals: { cells: cells.length, finished, games: cells.reduce((n, c) => n + c.games, 0), cost_usd: cells.reduce((n, c) => n + c.cost_usd, 0) },
    cells,
  };
}

// ---- artifacts ----

interface CellsAndPairs { cells: BenchCellResult[]; pairs: BenchReportInputPairs; leaderboard: LeaderRow[] }

type BenchReportInputPairs = { a: string; b: string; pAGtB: number; diffMean: number; diffLo: number; diffHi: number }[];

async function readCells(ctx: Ctx, manifest: Manifest): Promise<CellsAndPairs> {
  const rows = await seriesByPrefix(ctx.db, manifest.prefix);
  const byName = new Map(rows.map((r) => [r.name ?? '', r]));
  const cells: BenchCellResult[] = [];
  for (const cell of expandCells(manifest.plan, manifest.prefix)) {
    const row = byName.get(cell.seriesName);
    if (!row) {
      cells.push({ cell, seriesId: null, state: 'pending', status: 'created', statusReason: null, games: 0, target: targetGames(manifest.plan.size), costUsd: 0, elo: null, w: 0, d: 0, l: 0, acpl: null, acceptableRate: null, blunderRate: null, blocks: [], abortedGames: 0, startedAt: null, finishedAt: null });
      continue;
    }
    const s = await buildSeries(ctx.db, row.id);
    const finished = (s?.games ?? []).filter((g) => g.status === 'finished');
    const rated = finished.filter((g) => g.model_score !== undefined).length;
    const timeout = (ctx.o as { timedOut?: Set<string> }).timedOut?.has(row.id) ?? false;
    cells.push({
      cell, seriesId: row.id,
      state: timeout ? 'timeout' : (stateOf(row, finished.length) ?? 'pending'),
      status: row.status, statusReason: row.status_reason,
      games: finished.length, target: targetGames(manifest.plan.size), costUsd: row.cost_usd ?? 0,
      elo: s?.elo ? { mean: s.elo.mean, lo: s.elo.lo, hi: s.elo.hi, games: s.elo.games } : null,
      w: s?.elo?.w ?? 0, d: s?.elo?.d ?? 0, l: s?.elo?.l ?? 0,
      acpl: rated ? (s?.secondary.acpl ?? null) : null,
      acceptableRate: rated ? (s?.secondary.acceptable_rate ?? null) : null,
      blunderRate: rated ? (s?.secondary.blunder_rate ?? null) : null,
      blocks: (s?.blocks ?? []).map((b) => ({ levelId: b.level_id, levelElo: b.level_elo, games: b.games, score: b.score })),
      abortedGames: (s?.games ?? []).filter((g) => g.status === 'aborted').length,
      startedAt: row.created_at, finishedAt: row.finished_at,
    });
  }

  const input = await leaderboardInput(ctx.db, manifest.plan.ladder_version);
  const runIds = new Set(rows.map((r) => r.id));
  const mine = input.filter((a) => runIds.has(a.series_id));
  const { rows: board } = buildLeaderboard(mine, manifest.plan.ladder_version, ctx.ladder.levels);
  const armBySeries = new Map(mine.map((a) => [a.series_id, a]));
  const pairs: BenchReportInputPairs = [];
  const done = cells.filter((c) => c.state === 'finished' && c.seriesId);
  for (let i = 0; i < done.length; i++)
    for (let j = i + 1; j < done.length; j++) {
      const a = armBySeries.get(done[i]!.seriesId!), b = armBySeries.get(done[j]!.seriesId!);
      if (!a || !b) continue;
      const c = compareArms(a.games, b.games);
      pairs.push({ a: benchLabel(a.model, a.arm), b: benchLabel(b.model, b.arm), pAGtB: c.p_a_gt_b, diffMean: c.diff_mean, diffLo: c.diff_lo, diffHi: c.diff_hi });
    }
  return { cells, pairs, leaderboard: board };
}

export async function writeBenchArtifacts(o: BenchRunOptions, runId: string): Promise<{ dir: string; cells: BenchCellResult[] }> {
  const dataRoot = o.dataDir ?? defaultDataDir();
  const manifest = JSON.parse(readFileSync(join(runDir(dataRoot, runId), 'manifest.json'), 'utf8')) as Manifest;
  const raw = readFileSync(repoPath(manifest.plan_path), 'utf8');
  const plan = parseBenchPlan(JSON.parse(raw));
  const ladderCheck = loadLadderVersion(dataRoot, plan.ladder_version);
  const ladder = o.ladder ?? ladderCheck?.file ?? { version: plan.ladder_version, calibrated: false, movetime_ms: 50, sf_version: 'unknown', anchor: { level: 'uci1320', elo: 1320 }, levels: [] };
  const opened = o.db ? null : await openLocalDb();
  const db = o.db ?? opened!.db;
  const rt = o.rt ?? ({ judge: { async oracle() { throw new Error('no runtime'); }, async evalPosition() { throw new Error('no runtime'); } }, engines: [], close: async () => {} } as unknown as Runtime);
  const ctx: Ctx = {
    o, plan, sha: manifest.plan_sha256, mock: manifest.env.mock, log: o.log ?? (() => {}), dataRoot, db, rt,
    ownDb: false, ownRt: false, ladder, ladderFile: ladderCheck?.path ?? manifest.ladder.file, env: manifest.env,
  };
  const { cells, pairs, leaderboard } = await readCells(ctx, manifest);
  const dir = join(o.reportsDir ?? join(REPO_ROOT, 'docs/build/reports'), `bench-${runId}`);
  mkdirSync(join(dir, 'series'), { recursive: true });
  for (const c of cells) if (c.seriesId) writeFileSync(join(dir, 'series', `${c.seriesId}.json`), JSON.stringify(await buildSeries(db, c.seriesId), null, 2) + '\n');
  writeFileSync(join(dir, 'leaderboard.csv'), leaderboardCsv(leaderboard));

  const input = {
    runId, plan, planPath: manifest.plan_path, planSha256: manifest.plan_sha256, prefix: manifest.prefix,
    env: manifest.env, ladder: { version: plan.ladder_version, calibrated: ladder.calibrated, file: ladderCheck?.path ?? manifest.ladder.file },
    startedAt: manifest.started_at, finishedAt: manifest.finished_at,
    stopReason: (manifest.stop_reason ?? 'completed') as BenchStopReason,
    cells, pairs, leaderboard,
  };
  writeFileSync(join(dir, 'report.md'), renderBenchReport(input));
  writeFileSync(join(dir, 'summary.json'), JSON.stringify(renderBenchSummary(input), null, 2) + '\n');

  if ((o.sql ?? plan.artifacts.sql) && cells.some((c) => c.seriesId)) {
    const levels = await loadLadderLevels(db, plan.ladder_version);
    if (levels.length !== ladder.levels.length)
      throw new Error(`ladder_levels missing for v${plan.ladder_version} — the published ruler would be empty (${levels.length}/${ladder.levels.length} rows)`);
    const outBase = join(dir, 'sql', 'part.sql');
    await runPublish({ db, seriesIds: cells.flatMap((c) => (c.seriesId ? [c.seriesId] : [])), outBase, log: () => {} });
  }
  await opened?.close();
  return { dir, cells };
}

// ---- run ----

export async function runBench(o: BenchRunOptions): Promise<BenchRunResult> {
  const { ctx, checks, close } = await openCtx(o);
  const log = ctx.log;
  try {
    log(`bench ${ctx.plan.name} · plan ${o.planPath} sha256 ${ctx.sha.slice(0, 16)}…${ctx.mock ? ' · MOCK' : ''}`);
    for (const c of checks) log(`  ${c.ok ? '✓' : '×'} ${c.name.padEnd(16)} ${c.detail}`);
    if (checks.some((c) => !c.ok)) throw new BenchPreflightError(checks);

    const cells = expandCells(ctx.plan, planPrefix(ctx.plan, o.newRun ? stamp() : undefined));
    if (o.dryRun) {
      log('');
      log('cell  series');
      let typical = 0;
      for (const cell of cells) {
        const est = ctx.mock ? null : estimateSeries(cellConfig(ctx, cell), ctx.models ?? o.catalogModels ?? []);
        if (est) typical += est.typical.est_cost_usd;
        log(`  ${String(cell.index).padStart(2)}  ${cell.seriesName}  ${cell.model}#${cell.arm}  ${est ? `≈$${est.typical.est_cost_usd.toFixed(4)}` : 'mock'}`);
      }
      log(`\n${cells.length} cells · ${ctx.plan.size.preset} · run cap $${ctx.plan.run_cap_usd.toFixed(2)}${ctx.mock ? '' : ` · typical $${typical.toFixed(4)}`}`);
      return { runId: '', stopReason: 'completed', artifactsDir: '', cells: [], exitCode: 0 };
    }

    // Resume: an unfinished manifest with the same plan name and hash wins.
    const existing = readManifests(ctx.dataRoot);
    const sameName = existing.filter((m) => m.plan_name === ctx.plan.name);
    let manifest: Manifest | undefined;
    if (o.runId) manifest = existing.find((m) => m.run_id === o.runId);
    else if (!o.newRun) {
      const unfinished = sameName.filter((m) => !m.finished_at || m.stop_reason !== 'completed');
      const sameHash = unfinished.filter((m) => m.plan_sha256 === ctx.sha);
      if (sameHash.length) manifest = sameHash[sameHash.length - 1];
      else if (unfinished.length && !unfinished.every((m) => m.stop_reason === 'stopped_budget'))
        throw new Error(`plan \`${ctx.plan.name}\` changed since run \`${unfinished.at(-1)!.run_id}\`; use --new or rename the plan`);
      else if (unfinished.length) manifest = unfinished[unfinished.length - 1];   // budget stop: a raised cap is the documented resume
      else if (sameName.some((m) => m.stop_reason === 'completed' && m.plan_sha256 === ctx.sha)) {
        const done = sameName.filter((m) => m.stop_reason === 'completed').at(-1)!;
        log(`run ${done.run_id} is already complete; report: ${join(o.reportsDir ?? 'docs/build/reports', `bench-${done.run_id}`, 'report.md')}`);
        return { runId: done.run_id, stopReason: 'completed', artifactsDir: join(o.reportsDir ?? 'docs/build/reports', `bench-${done.run_id}`), cells: [], exitCode: 0 };
      }
    }
    if (manifest && manifest.plan_sha256 !== ctx.sha && manifest.stop_reason !== 'stopped_budget')
      throw new Error(`run \`${manifest.run_id}\` was made with a different plan; use --new`);
    if (manifest && manifest.plan_sha256 !== ctx.sha && manifest.stop_reason === 'stopped_budget')
      log(`  note: plan changed since run ${manifest.run_id} (cap raised?); resuming it`);

    const startedAt = manifest?.started_at ?? new Date().toISOString();
    const runId = manifest?.run_id ?? `${ctx.plan.name}-${stamp()}`;
    const prefix = manifest?.prefix ?? planPrefix(ctx.plan, o.newRun ? stamp() : undefined);
    const seed = ctx.plan.seed ?? Number(stamp().slice(0, 8));
    const dir = runDir(ctx.dataRoot, runId);
    mkdirSync(dir, { recursive: true });
    const logPath = join(dir, 'run.log');
    const say = (line: string) => { log(line); appendFileSync(logPath, line + '\n'); };

    const m: Manifest = manifest ?? {
      run_id: runId, plan_name: ctx.plan.name, plan_path: o.planPath, plan_sha256: ctx.sha, plan: ctx.plan,
      prefix, seed, started_at: startedAt, finished_at: null, stop_reason: null,
      env: ctx.env, ladder: { version: ctx.plan.ladder_version, calibrated: ctx.ladder.calibrated, file: ctx.ladderFile },
      git_email: o.gitEmail ?? null,
    };
    m.plan = ctx.plan; m.plan_sha256 = ctx.sha; m.started_at = startedAt;
    writeAtomic(join(dir, 'manifest.json'), JSON.stringify(m, null, 2) + '\n');

    await recoverSeries(ctx.db);
    const hub = new EventHub<SeriesEvent>();
    const gameHub = new EventHub<GameEvent>();
    const series = new SeriesControlPlane({
      rt: ctx.rt, db: ctx.db, hub, gameHub, mock: ctx.mock, ladder: () => ctx.ladder,
      ...(o.judge ? { judge: o.judge } : {}), ...(o.makeOpponentFor ? { makeOpponentFor: o.makeOpponentFor } : {}),
    });

    const timedOut = new Set<string>();
    (o as { timedOut?: Set<string> }).timedOut = timedOut;
    let stopRequested = false, currentId: string | undefined;
    const onSignal = async () => { stopRequested = true; if (currentId) await series.pause(currentId); };
    process.once('SIGINT', onSignal);
    process.once('SIGTERM', onSignal);

    let stopReason: BenchStopReason = 'completed';
    const t0 = Date.parse(startedAt);
    say(`run ${runId} · prefix ${prefix} · seed ${seed}`);

    try {
      for (const cell of cells) {
        if (stopRequested) { stopReason = 'interrupted'; break; }
        const rowsNow = await seriesByPrefix(ctx.db, prefix);
        const spent = spentFor(rowsNow);
        if (spent >= ctx.plan.run_cap_usd) { stopReason = 'stopped_budget'; say(`run cap reached ($${spent.toFixed(4)} of $${ctx.plan.run_cap_usd.toFixed(2)})`); break; }
        if ((Date.now() - t0) / 3_600_000 >= ctx.plan.max_hours) { stopReason = 'stopped_time'; say(`max_hours reached (${ctx.plan.max_hours} h)`); break; }
        const cap = seriesCapFor(ctx.plan, spent);
        if (cap < 0.05) { stopReason = 'stopped_budget'; say(`no room left for cell ${cell.index} (cap $${cap.toFixed(4)})`); break; }

        let row = await seriesByName(ctx.db, cell.seriesName);
        if (row && ['finished', 'aborted', 'stopped_error'].includes(row.status)) {
          say(`cell ${cell.index + 1}/${cells.length} ${cell.seriesName} → ${row.status}, skipped`);
          continue;
        }
        if (row) {
          await saveSeries(ctx.db, { ...row, budget_usd: cap });
          say(`cell ${cell.index + 1}/${cells.length} ${cell.seriesName} → series ${row.id} (resume, cap $${cap.toFixed(2)})`);
        } else {
          const cfg = cellConfig(ctx, cell, cap);
          const created = await series.create({ ...cfg, seed });
          row = await loadSeriesRow(ctx.db, created.id);
          say(`cell ${cell.index + 1}/${cells.length} ${cell.seriesName} → series ${created.id} (cap $${cap.toFixed(2)})`);
        }
        if (!row) throw new Error(`series ${cell.seriesName} vanished after create`);

        currentId = row.id;
        const gamesSeen = { n: 0 };
        const off = hub.subscribe(row.id, (e) => {
          if (e.event !== 'game_finished') return;
          const g = e.data as { index: number; result: string; termination: string; level_id: string; cost_usd: number };
          gamesSeen.n++;
          say(`${new Date().toISOString()} cell ${cell.index + 1} game ${gamesSeen.n} ${g.result} vs ${g.level_id} $${(g.cost_usd ?? 0).toFixed(4)}`);
          void writeStatus(ctx, runId, prefix, null).catch(() => {});
        });

        const timer = setTimeout(() => { timedOut.add(row!.id); void series.pause(row!.id); }, ctx.plan.cell_timeout_min * 60_000);
        try {
          await series.start(row.id);
          await series.idle(row.id);
        } finally {
          clearTimeout(timer);
          off();
          currentId = undefined;
        }
        if (timedOut.has(row.id)) {
          await series.pause(row.id);
          say(`cell ${cell.index + 1} timed out after ${ctx.plan.cell_timeout_min} min; paused`);
        }

        const after = await loadSeriesRow(ctx.db, row.id);
        const state = timedOut.has(row.id) ? 'timeout' : (stateOf(after, 0) ?? 'pending');
        if (o.commitEachCell) {
          try {
            const art = await writeBenchArtifacts(o, runId);
            execFileSync('git', ['add', art.dir], { stdio: 'ignore' });
            execFileSync('git', ['commit', '-m', `Record bench cell ${cell.index + 1} ${cell.model}#${cell.arm}`], { stdio: 'ignore' });
            say(`committed ${art.dir}`);
          } catch (e) { say(`commit failed: ${e instanceof Error ? e.message : String(e)}`); }
        }
        if (state === 'failed' && o.stopOnError) { stopReason = 'stopped_error'; say(`stopping on error (--stop-on-error)`); break; }
      }
    } finally {
      process.removeListener('SIGINT', onSignal);
      process.removeListener('SIGTERM', onSignal);
    }

    m.finished_at = new Date().toISOString();
    m.stop_reason = stopReason;
    writeAtomic(join(dir, 'manifest.json'), JSON.stringify(m, null, 2) + '\n');
    await writeStatus(ctx, runId, prefix, stopReason);
    const artifacts = await writeBenchArtifacts(o, runId);
    say(`artifacts: ${artifacts.dir}`);
    const cellsOut = artifacts.cells;
    const failed = cellsOut.some((c) => c.state === 'failed');
    const exitCode = stopReason === 'interrupted' ? 130 : (stopReason !== 'completed' || failed) ? 3 : 0;
    return { runId, stopReason, artifactsDir: artifacts.dir, cells: cellsOut, exitCode };
  } finally {
    await close();
  }
}

async function writeStatus(ctx: Ctx, runId: string, prefix: string, stopReason: BenchStopReason | null): Promise<void> {
  const status = await buildStatus(ctx, runId, prefix, stopReason);
  writeAtomic(join(runDir(ctx.dataRoot, runId), 'status.json'), JSON.stringify(status, null, 2) + '\n');
}

// ---- status / report / models ----

export async function benchStatus(o: { runId?: string; json?: boolean; db?: Db; dataDir?: string } = {}): Promise<string> {
  const dataRoot = o.dataDir ?? defaultDataDir();
  const manifests = readManifests(dataRoot);
  const m = o.runId ? manifests.find((x) => x.run_id === o.runId) : manifests.at(-1);
  if (!m) return 'no bench run yet (data/bench/*/manifest.json not found)';
  const statusPath = join(runDir(dataRoot, m.run_id), 'status.json');
  const status = existsSync(statusPath) ? JSON.parse(readFileSync(statusPath, 'utf8')) as StatusFile : null;
  if (o.json) return JSON.stringify(status ?? { run_id: m.run_id, prefix: m.prefix, cells: [] }, null, 2);

  const opened = o.db ? null : await openLocalDb();
  const db = o.db ?? opened!.db;
  const live = await buildStatus({ o: {} as BenchRunOptions, plan: m.plan, sha: m.plan_sha256, mock: m.env.mock, log: () => {}, dataRoot, db, rt: {} as Runtime, ownDb: false, ownRt: false, ladder: {} as LadderFile, ladderFile: m.ladder.file, env: m.env }, m.run_id, m.prefix, m.stop_reason);
  const elapsedMin = Math.max(0, Math.round((Date.parse(m.finished_at ?? new Date().toISOString()) - Date.parse(m.started_at)) / 60_000));
  const done = live.totals.games;
  const perGame = done ? live.totals.cost_usd / done : 0;
  const remaining = live.cells.reduce((n, c) => n + Math.max(0, (c.target ?? 0) - c.games), 0);
  const lines = [
    `run ${m.run_id} · ${m.prefix}${m.env.mock ? ' · MOCK' : ''} · ${live.totals.finished}/${live.totals.cells} cells · ${done} games · $${live.totals.cost_usd.toFixed(4)}${m.plan ? ` of $${m.plan.run_cap_usd.toFixed(2)}` : ''}`,
    `elapsed ${elapsedMin} min${remaining && done ? ` · ≈ ${(elapsedMin / done).toFixed(1)} min/game · ETA ≈ ${Math.round(remaining * (elapsedMin / done))} min` : ''}`,
    '',
    ...live.cells.map((c) => {
      const elo = c.elo ? ` ${Math.round(c.elo.mean)} ±${Math.round((c.elo.hi - c.elo.lo) / 2)}` : '';
      return `${mascot(c.state === 'finished' ? 'finished' : c.state === 'budget' ? 'stopped_budget' : c.state)} ${c.state.padEnd(8)} ${String(c.games).padStart(3)}/${String(c.target ?? '?').padEnd(3)} $${c.cost_usd.toFixed(4)}${elo}  ${c.name}`;
    }),
  ];
  await opened?.close();
  const logPath = join(runDir(dataRoot, m.run_id), 'run.log');
  if (existsSync(logPath)) {
    const tail = readFileSync(logPath, 'utf8').trimEnd().split('\n').slice(-5);
    if (tail.length) lines.push('', 'last log:', ...tail.map((l) => `  ${l}`));
  }
  return lines.join('\n');
}

export async function benchReport(o: { runId?: string; db?: Db; dataDir?: string; reportsDir?: string; log?: (l: string) => void } = {}): Promise<string> {
  const dataRoot = o.dataDir ?? defaultDataDir();
  const manifests = readManifests(dataRoot);
  const m = o.runId ? manifests.find((x) => x.run_id === o.runId) : manifests.at(-1);
  if (!m) throw new Error('no bench run yet');
  const { dir } = await writeBenchArtifacts({ planPath: m.plan_path, db: o.db, dataDir: dataRoot, ...(o.reportsDir ? { reportsDir: o.reportsDir } : {}), log: o.log ?? (() => {}) }, m.run_id);
  return dir;
}

export async function benchModels(): Promise<string> {
  const models = await getCatalog().list();
  const rows = models.filter((m) => !m.disabled_reason).map((m) =>
    `${m.roster ? '*' : ' '} ${m.slug.padEnd(38)} $${m.price_in_per_m.toFixed(2).padStart(6)}/M in  ctx ${String(m.context_length ?? '?').padStart(7)}  ${m.name ?? ''}`);
  return ['  slug                                   price          context  name', ...rows].join('\n');
}
