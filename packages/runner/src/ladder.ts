/**
 * Ladder calibration: engine-vs-engine games between ladder levels, then one Elo fit.
 * Spec: docs/build/tasks/T05, METRICS.md B2. CPU only, no model calls.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  DEFAULT_LADDER, applyMove, calibrationPairs, fitLadder, ladderWarnings, mulberry32, outcomeOf,
  positionKey, randomOpening, sideToMove, subSeed,
  type LadderFile, type LadderLevel, type Opening,
} from '@chessdecide/core';
import { makeOpponent, type Engine } from '@chessdecide/engine';
import {
  addLadderGame, clearLadderGames, ladderGameIndexes, loadCalibrationGames, saveLadderLevels, type Db,
} from '@chessdecide/db';

const MAX_PLIES = 200;
const OPENING_COUNT = 100;
const ANCHOR = { level: 'uci1320', elo: 1320 };

export interface CalibrateOptions {
  db: Db;
  dataDir: string;
  makeEngine: () => Promise<Engine>;
  gamesPerPair?: number;                 // default 200
  workers?: number;                      // default 4
  movetimeMs?: number;                   // default 50
  seed?: number;                         // default 1
  resume?: boolean;
  version?: number;                      // tests / explicit rerun; default highest file + 1
  levels?: readonly LadderLevel[];       // tests; default DEFAULT_LADDER levels
  pairs?: ReadonlyArray<readonly [string, string]>;  // tests; default calibrationPairs
  openings?: readonly Opening[];         // tests; default 100 generated openings
  evalCp?: (fen: string) => Promise<number>;         // tests; default depth-10 search
  log?: (line: string) => void;
  now?: () => Date;
}

export interface CalibrateResult {
  file: LadderFile;
  path: string;
  games: number;
  wallMs: number;
  warnings: string[];
}

const ladderDir = (dataDir: string) => join(dataDir, 'ladder');

/** Highest-numbered valid ladder file, else DEFAULT_LADDER. Corrupt files are skipped with a warning. */
export function loadLadder(dataDir: string, warn: (message: string) => void = console.warn): LadderFile {
  const dir = ladderDir(dataDir);
  if (!existsSync(dir)) return DEFAULT_LADDER;
  const files = readdirSync(dir)
    .map((f) => { const m = /^ladder-v(\d+)\.json$/.exec(f); return m ? { file: f, version: Number(m[1]) } : null; })
    .filter((x): x is { file: string; version: number } => x !== null)
    .sort((a, b) => b.version - a.version);
  for (const { file } of files) {
    try {
      const parsed = JSON.parse(readFileSync(join(dir, file), 'utf8'));
      if (isLadderFile(parsed)) return parsed;
      warn(`ignoring invalid ladder file ${file}`);
    } catch (e) {
      warn(`ignoring corrupt ladder file ${file}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return DEFAULT_LADDER;
}

function isLadderFile(v: unknown): v is LadderFile {
  const f = v as Partial<LadderFile> | null;
  return !!f && typeof f.version === 'number' && typeof f.calibrated === 'boolean' && Array.isArray(f.levels)
    && f.levels.every((l) => !!l && typeof l.id === 'string' && typeof l.label === 'string' && typeof l.elo === 'number'
      && (l.kind === 'random' || l.kind === 'eps' || l.kind === 'uci'));
}

/** Next version number = highest existing `ladder-vN.json` + 1. */
export function nextLadderVersion(dataDir: string): number {
  const dir = ladderDir(dataDir);
  if (!existsSync(dir)) return 1;
  let max = 0;
  for (const f of readdirSync(dir)) {
    const m = /^ladder-v(\d+)\.json$/.exec(f);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max + 1;
}

interface Task { a: string; b: string; g: number }

/** Deterministic 32-bit hash for (pair, game index); only used to seed the game RNG. */
function pairHash(a: string, b: string, g: number): number {
  let h = 2166136261;
  for (const c of `${a}|${b}|${g}`) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

async function runPool<T>(items: readonly T[], workers: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      await fn(items[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(workers, items.length)) }, worker));
}

function fmtDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

/** 100 seeded 4-ply openings, each within ±100 cp of level (depth 10, full-strength engine). */
async function generateOpenings(opts: CalibrateOptions, seed: number): Promise<Opening[]> {
  if (opts.openings) return [...opts.openings];
  const engine = await opts.makeEngine();
  const evalCp = opts.evalCp ?? (async (fen: string) => {
    const r = await engine.search({ fen, depth: 10, options: { UCI_LimitStrength: false, Threads: 1, Hash: 64, UCI_ShowWDL: true } });
    return r.lines[0]?.cp ?? 0;
  });
  try {
    const out: Opening[] = [];
    for (let i = 0; i < OPENING_COUNT; i++) out.push(await randomOpening(subSeed(seed, i), evalCp));
    return out;
  } finally {
    await engine.close();
  }
}

interface PlayContext {
  levels: readonly LadderLevel[];
  openings: readonly Opening[];
  movetimeMs: number;
  seed: number;
  makeEngine: () => Promise<Engine>;
}

async function playGame(task: Task, ctx: PlayContext) {
  const levelA = ctx.levels.find((l) => l.id === task.a)!;
  const levelB = ctx.levels.find((l) => l.id === task.b)!;
  const opening = ctx.openings[Math.floor(task.g / 2) % ctx.openings.length]!;
  const aColor = task.g % 2 === 0 ? 'white' : 'black';
  const rng = mulberry32(subSeed(ctx.seed, pairHash(task.a, task.b, task.g)));
  const oppA = await makeOpponent(levelA, ctx.makeEngine, rng, ctx.movetimeMs);
  const oppB = await makeOpponent(levelB, ctx.makeEngine, rng, ctx.movetimeMs);
  try {
    let fen = opening.fen;
    let plies = 0;
    const previous = [positionKey(fen)];
    for (;;) {
      const side = sideToMove(fen);
      const aToMove = (side === 'white') === (aColor === 'white');
      const { uci } = await (aToMove ? oppA : oppB).move(fen);
      const applied = applyMove(fen, uci);
      fen = applied.fen;
      plies++;
      const outcome = outcomeOf(fen, previous);
      previous.push(positionKey(fen));
      if (outcome === 'checkmate') {
        return { result: side === 'white' ? '1-0' : '0-1', plies };
      }
      if (outcome !== 'none' || plies >= MAX_PLIES) return { result: '1/2-1/2', plies };
    }
  } finally {
    await Promise.all([oppA.close(), oppB.close()]);
  }
}

export async function calibrate(opts: CalibrateOptions): Promise<CalibrateResult> {
  const log = opts.log ?? console.log;
  const levels = [...(opts.levels ?? DEFAULT_LADDER.levels)].sort((a, b) => a.elo - b.elo);
  const ids = levels.map((l) => l.id);
  const pairs = (opts.pairs ?? calibrationPairs(ids)).map(([a, b]) => [a, b] as [string, string]);
  const gamesPerPair = opts.gamesPerPair ?? 200;
  const workers = Math.max(1, opts.workers ?? 4);
  const movetimeMs = opts.movetimeMs ?? 50;
  const seed = opts.seed ?? 1;
  const version = opts.version ?? nextLadderVersion(opts.dataDir);

  if (!opts.resume) await clearLadderGames(opts.db, version);

  const openings = await generateOpenings(opts, seed);
  const tasks: Task[] = [];
  for (const [a, b] of pairs) {
    const existing = opts.resume ? new Set(await ladderGameIndexes(opts.db, version, a, b)) : new Set<number>();
    for (let g = 0; g < gamesPerPair; g++) if (!existing.has(g)) tasks.push({ a, b, g });
  }
  const total = tasks.length;
  log(`calibration v${version}: ${pairs.length} pairs × ${gamesPerPair} games · ${total} to play · ${workers} workers · movetime ${movetimeMs} ms`);

  const started = Date.now();
  let done = 0;
  await runPool(tasks, workers, async (task) => {
    const { result, plies } = await playGame(task, { levels, openings, movetimeMs, seed, makeEngine: opts.makeEngine });
    await addLadderGame(opts.db, {
      ladder_version: version, level_a: task.a, level_b: task.b, game_index: task.g,
      opening_seed: openings[Math.floor(task.g / 2) % openings.length]!.seed,
      a_color: task.g % 2 === 0 ? 'white' : 'black', result, plies,
    });
    done++;
    if (done === 20 || done % 100 === 0 || done === total) {
      const elapsed = (Date.now() - started) / 1000;
      log(`${done}/${total} games · ${(elapsed / done).toFixed(2)} s/game · ETA ${fmtDuration((elapsed / done) * (total - done))}`);
    }
  });

  const games = await loadCalibrationGames(opts.db, version);
  const nominal: Record<string, number> = {};
  for (const l of levels) nominal[l.id] = l.elo;
  const fit = fitLadder(games, ids, ANCHOR, nominal);
  const calibrated = levels.map((l): LadderLevel => ({
    ...l,
    elo: Math.round(fit.elo[l.id]!),
    se: Math.round((fit.se[l.id] ?? 0) * 10) / 10,
    games: fit.games[l.id] ?? 0,
  }));
  const warnings = ladderWarnings(calibrated, nominal);

  const probe = await opts.makeEngine();
  let sfVersion = 'unknown';
  try { sfVersion = await probe.version(); } finally { await probe.close(); }

  const file: LadderFile = {
    version, calibrated: true, movetime_ms: movetimeMs, sf_version: sfVersion,
    calibrated_at: (opts.now?.() ?? new Date()).toISOString(),
    anchor: { ...ANCHOR }, levels: calibrated,
  };
  const path = join(ladderDir(opts.dataDir), `ladder-v${version}.json`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(file, null, 2) + '\n');
  await saveLadderLevels(opts.db, file);

  log('id                  nominal  measured ± se   games');
  for (const l of calibrated) {
    log(`${l.id.padEnd(18)} ${String(nominal[l.id] ?? '?').padStart(6)}  ${String(l.elo).padStart(7)} ± ${String(l.se ?? 0).padStart(4)}  ${String(l.games ?? 0).padStart(5)}`);
  }
  for (const w of warnings) log(`warning: ${w}`);
  log(`wrote ${path} · ${games.length} games · ${fmtDuration((Date.now() - started) / 1000)}`);

  return { file, path, games: games.length, wallMs: Date.now() - started, warnings };
}
