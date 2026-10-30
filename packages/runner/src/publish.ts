/**
 * Publish finished local work as SQL files for a remote D1, and optionally run them.
 * Spec: docs/build/tasks/T10-publish.md. Never publishes attempts, oracle_moves, settings,
 * models_snapshot or ladder_games — raw request/response bodies stay local (D13/D28).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { and, asc, eq, inArray, isNull, or, type SQL } from 'drizzle-orm';
import * as s from '@chessdecide/db/schema';
import type { Db } from '@chessdecide/db';
import { dataDir } from './config.ts';

/** A series only reaches the public site when it ran to a verdict, not while it is still going. */
export const PUBLISHABLE_SERIES_STATUSES = ['finished', 'stopped_budget', 'stopped_error'] as const;

export type TableName = 'ladder_levels' | 'series' | 'games' | 'plies';
export const PUBLISH_ORDER: readonly TableName[] = ['ladder_levels', 'series', 'games', 'plies'];

/** Explicit column lists: an INSERT built from `select *` would silently publish a new local column. */
export const COLUMNS: Record<TableName, readonly string[]> = {
  ladder_levels: ['ladder_version', 'id', 'kind', 'params_json', 'elo', 'se', 'games'],
  series: [
    'id', 'name', 'model_slug', 'arm_id', 'arm_json', 'status', 'status_reason', 'size_json',
    'ladder_mode', 'ladder_level', 'ladder_version', 'seed', 'budget_usd', 'concurrency', 'judge_depth',
    'cost_usd', 'elo_mean', 'elo_lo', 'elo_hi', 'w', 'd', 'l', 'elo_history_json', 'blocks_json',
    'catalog_snapshot_json', 'created_at', 'finished_at',
  ],
  games: [
    'id', 'status', 'status_reason', 'config_json', 'white_player', 'black_player', 'engine_id',
    'series_id', 'series_index', 'block_index', 'level_id', 'level_elo', 'model_color', 'model_score',
    'adjudicated', 'start_fen', 'opening_seed', 'result', 'termination', 'budget_usd', 'cost_usd',
    'created_at', 'finished_at',
  ],
  plies: [
    'game_id', 'ply', 'side', 'by', 'uci', 'san', 'fen_after', 'forced', 'attempt_id',
    'decision_json', 'engine_json', 'eval_json', 'judge_json', 'created_at',
  ],
};

/** D1 caps a statement at 100 KB and recommends files under 2 MB. */
export const MAX_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_STATEMENT_BYTES = 100 * 1024;

export type Row = Record<string, unknown>;
export type PublishTables = Record<TableName, Row[]>;

export interface PublishOptions {
  /** Explicit series ids; overrides the status filter. */
  seriesIds?: string[];
  /** Also publish finished games that belong to no series. */
  allGames?: boolean;
}

export interface PublishPlan {
  tables: PublishTables;
  statements: SqlStatement[];
  /** SQL text of each output file, in publish order. */
  chunks: string[];
  counts: Record<TableName, number>;
  bytes: number;
}

export interface SqlStatement { table: TableName; key: string; sql: string; }

const bytesOf = (text: string) => new TextEncoder().encode(text).length;

const SECRET_KEY = /^(api_?key|apikey|key|token|secret|password|authorization)$/i;
const SECRET_VALUE = /(?:^|[^a-z0-9])sk-(?:or-)?[A-Za-z0-9_-]{8,}/i;

/**
 * Keep `games.config_json` as it is, but refuse to publish it if a key ever leaked into it.
 * The config holds only player/opening/pace/budget fields today; this is a guard, not a filter.
 */
export function sanitizeConfigJson(raw: string): string {
  const parsed = JSON.parse(raw) as unknown;
  const walk = (value: unknown, path: string): void => {
    if (typeof value === 'string') {
      if (SECRET_VALUE.test(value)) throw new Error(`publish refused: games.config_json at ${path} looks like it holds an API key`);
      return;
    }
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (SECRET_KEY.test(key)) throw new Error(`publish refused: games.config_json has a "${key}" field at ${path}`);
      walk(child, `${path}.${key}`);
    }
  };
  walk(parsed, 'config');
  return JSON.stringify(parsed);
}

/** One SQL literal. Strings use doubled single quotes; numbers stay raw; booleans become 0/1. */
export function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`publish refused: cannot serialize ${String(value)} as a SQL number`);
    return String(value);
  }
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'string') return `'${value.replaceAll("'", "''")}'`;
  throw new Error(`publish refused: cannot serialize a ${typeof value}`);
}

function rowKey(table: TableName, row: Row): string {
  if (table === 'ladder_levels') return `${String(row.ladder_version)}/${String(row.id)}`;
  if (table === 'series' || table === 'games') return String(row.id);
  return `${String(row.game_id)}#${String(row.ply)}`;
}

function rowStatement(table: TableName, row: Row): SqlStatement {
  const columns = COLUMNS[table];
  const values = columns.map((c) => sqlLiteral(row[c]));
  return {
    table, key: rowKey(table, row),
    sql: `INSERT OR REPLACE INTO "${table}" (${columns.map((c) => `"${c}"`).join(', ')}) VALUES (${values.join(', ')});`,
  };
}

function chunk<T>(items: readonly T[], size = 50): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function pliesForGames(db: Db, gameIds: readonly string[]): Promise<Row[]> {
  const rows: Row[] = [];
  for (const ids of chunk(gameIds)) {
    if (ids.length === 0) continue;
    rows.push(...(await db.select().from(s.plies).where(inArray(s.plies.game_id, ids))
      .orderBy(asc(s.plies.game_id), asc(s.plies.ply))) as Row[]);
  }
  return rows;
}

/** Read the publishable rows. Read-only; no files, no network. */
export async function collectPublishRows(db: Db, opts: PublishOptions = {}): Promise<PublishTables> {
  const seriesRows = (opts.seriesIds?.length
    ? await db.select().from(s.series).where(inArray(s.series.id, opts.seriesIds)).orderBy(asc(s.series.created_at), asc(s.series.id))
    : await db.select().from(s.series).where(inArray(s.series.status, [...PUBLISHABLE_SERIES_STATUSES]))
      .orderBy(asc(s.series.created_at), asc(s.series.id))) as Row[];

  const versions = [...new Set(seriesRows.map((r) => Number(r.ladder_version)))].filter((v) => Number.isInteger(v) && v >= 0);
  const ladderRows = (versions.length
    ? await db.select().from(s.ladder_levels).where(inArray(s.ladder_levels.ladder_version, versions))
      .orderBy(asc(s.ladder_levels.ladder_version), asc(s.ladder_levels.id))
    : []) as Row[];

  // A series game inherits its series' verdict; `--all-games` adds only *finished* games outside any series.
  const seriesIds = seriesRows.map((r) => String(r.id));
  const gameWhere: SQL[] = [];
  if (seriesIds.length) gameWhere.push(inArray(s.games.series_id, seriesIds));
  if (opts.allGames) gameWhere.push(and(isNull(s.games.series_id), eq(s.games.status, 'finished'))!);
  const games = (gameWhere.length
    ? await db.select().from(s.games).where(gameWhere.length === 1 ? gameWhere[0]! : or(...gameWhere)!)
      .orderBy(asc(s.games.series_id), asc(s.games.series_index), asc(s.games.created_at))
    : []) as Row[];

  const plies = await pliesForGames(db, games.map((g) => String(g.id)));

  const cleanedGames = games.map((g) => ({ ...g, config_json: sanitizeConfigJson(String(g.config_json)) }));
  const cleanedPlies = plies.map((p) => ({ ...p, attempt_id: null }));

  return { ladder_levels: ladderRows, series: seriesRows, games: cleanedGames, plies: cleanedPlies };
}

/** Split statements into files under 2 MB, refusing a single row over D1's 100 KB statement cap. */
export function chunkStatements(statements: readonly SqlStatement[]): string[] {
  const chunks: string[] = [];
  let lines: string[] = [];
  let bytes = 0;
  const flush = () => {
    if (lines.length === 0) return;
    chunks.push(lines.join('\n') + '\n');
    lines = [];
    bytes = 0;
  };
  for (const st of statements) {
    const size = bytesOf(st.sql) + 1;
    if (size > MAX_STATEMENT_BYTES)
      throw new Error(`publish refused: row ${st.table} ${st.key} renders to ${size} bytes, over D1's ${MAX_STATEMENT_BYTES}-byte statement limit`);
    if (bytes + size > MAX_FILE_BYTES) flush();
    lines.push(st.sql);
    bytes += size;
  }
  flush();
  return chunks;
}

/** Render the rows as one ordered statement list (ladder_levels, series, games, plies). */
export function renderStatements(tables: PublishTables): SqlStatement[] {
  return PUBLISH_ORDER.flatMap((table) => tables[table].map((row) => rowStatement(table, row)));
}

export async function planPublish(db: Db, opts: PublishOptions = {}): Promise<PublishPlan> {
  const tables = await collectPublishRows(db, opts);
  const statements = renderStatements(tables);
  const chunks = chunkStatements(statements);
  return {
    tables, statements, chunks,
    counts: Object.fromEntries(PUBLISH_ORDER.map((t) => [t, tables[t].length])) as Record<TableName, number>,
    bytes: chunks.reduce((n, c) => n + bytesOf(c), 0),
  };
}

/** `outBase` for one file; `out-001.sql`, `out-002.sql`, … when it needs chunking. */
export function outputPaths(outBase: string, count: number): string[] {
  if (count <= 1) return count === 1 ? [outBase] : [];
  const m = /^(.*?)(\.[^./\\]*)?$/.exec(outBase)!;
  return Array.from({ length: count }, (_, i) => `${m[1]}-${String(i + 1).padStart(3, '0')}${m[2] ?? '.sql'}`);
}

export function writePublishFiles(chunks: readonly string[], outBase: string): string[] {
  const paths = outputPaths(outBase, chunks.length);
  if (paths.length === 0) return paths;
  mkdirSync(dirname(outBase), { recursive: true });
  chunks.forEach((sql, i) => writeFileSync(paths[i]!, sql, 'utf8'));
  return paths;
}

// ---- remote ----

const WEB_DIR = fileURLToPath(new URL('../../../apps/web/', import.meta.url));

/** Resolve a `--config` value against `apps/web/` (wrangler runs from there). */
export function webConfigPath(name = 'wrangler.jsonc'): string {
  return isAbsolute(name) ? name : join(WEB_DIR, name);
}

/** Strip `//` and block comments so `wrangler.jsonc` parses as JSON. String-aware. */
export function stripJsonComments(text: string): string {
  let out = '';
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (inString) {
      out += c;
      if (c === '\\') { out += text[i + 1] ?? ''; i++; }
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') { inString = true; out += c; continue; }
    if (c === '/' && text[i + 1] === '/') { while (i < text.length && text[i] !== '\n') i++; out += '\n'; continue; }
    if (c === '/' && text[i + 1] === '*') { i += 2; while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++; i++; continue; }
    out += c;
  }
  return out;
}

export function readWranglerConfig(path: string): { d1_databases?: { database_id?: string }[] } {
  return JSON.parse(stripJsonComments(readFileSync(path, 'utf8')));
}

/** D1 database ids are UUIDs; a placeholder is a config mistake, not a production id. */
const DATABASE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `--remote` must never write into the local dev database by accident. */
export function assertRemoteReady(configPath: string): void {
  if (!existsSync(configPath)) throw new Error(`publish --remote: config not found at ${configPath}`);
  const id = readWranglerConfig(configPath).d1_databases?.[0]?.database_id;
  if (!id || id === 'local-dev' || !DATABASE_ID.test(id))
    throw new Error(`publish --remote refused: ${configPath} has database_id "${id ?? 'missing'}", which is not a Cloudflare D1 id. `
      + 'Create the production database and paste its id into apps/web/wrangler.production.jsonc (see docs/DEPLOY.md).');
}

export interface RemoteOptions {
  configPath?: string;
  /** Injected in tests; defaults to `execFileSync` with inherited stdio. */
  exec?: (cmd: string, args: string[]) => void;
  log?: (line: string) => void;
}

export function pushRemotely(files: readonly string[], opts: RemoteOptions = {}): void {
  const configPath = webConfigPath(opts.configPath ?? 'wrangler.jsonc');
  assertRemoteReady(configPath);
  const exec = opts.exec ?? ((cmd, args) => { execFileSync(cmd, args, { stdio: 'inherit' }); });
  const log = opts.log ?? ((line) => console.log(line));
  for (const file of files) {
    log(`publish --remote: ${file}`);
    exec('pnpm', ['--filter', '@chessdecide/web', 'exec', 'wrangler', 'd1', 'execute', 'DB',
      '--remote', '--config', configPath, '--file', file]);
  }
}

// ---- entry point used by the CLI ----

export interface RunPublishOptions extends PublishOptions {
  db: Db;
  /** Base output path; defaults to `<data>/publish/<ts>.sql`. */
  outBase?: string;
  dryRun?: boolean;
  remote?: boolean;
  configPath?: string;
  exec?: RemoteOptions['exec'];
  log?: (line: string) => void;
}

export interface PublishSummary {
  counts: Record<TableName, number>;
  bytes: number;
  /** Written (or, for `--dry-run`, would-be) file paths. */
  files: string[];
  dryRun: boolean;
}

export const timestampName = (now = new Date()): string => now.toISOString().replace(/[:.]/g, '-').slice(0, 19);

export async function runPublish(opts: RunPublishOptions): Promise<PublishSummary> {
  const log = opts.log ?? ((line) => console.log(line));
  const outBase = opts.outBase ?? join(dataDir(), 'publish', `${timestampName()}.sql`);
  const plan = await planPublish(opts.db, opts);
  const files = outputPaths(outBase, plan.chunks.length);

  log(opts.dryRun ? 'publish: dry run' : `publish: ${files.length} file(s) for ${outBase}`);
  for (const table of PUBLISH_ORDER) log(`  ${table.padEnd(13)} ${plan.counts[table]}`);
  log(`  ${'bytes'.padEnd(13)} ${plan.bytes}`);

  // Refuse a mis-pointed production config *before* touching disk or the network.
  const remoteConfig = opts.remote ? (opts.configPath ?? 'wrangler.jsonc') : undefined;
  if (remoteConfig) assertRemoteReady(webConfigPath(remoteConfig));

  if (!opts.dryRun) {
    const written = writePublishFiles(plan.chunks, outBase);
    for (const path of written) log(`  wrote ${path}`);
  }
  if (opts.remote && !opts.dryRun && remoteConfig)
    pushRemotely(files, { configPath: remoteConfig, ...(opts.exec ? { exec: opts.exec } : {}), log });

  return { counts: plan.counts, bytes: plan.bytes, files: opts.dryRun ? [] : files, dryRun: !!opts.dryRun };
}
