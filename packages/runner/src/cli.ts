#!/usr/bin/env -S pnpm exec tsx
import { parseArgs } from 'node:util';
import { eq } from 'drizzle-orm';
import {
  ARM_PRESETS, START_FEN, legalMoves, playToEnd, sideToMove,
  type ArmName, type Game, type GameConfig, type MoveContext,
} from '@chessdecide/core';
import { games, loadGame } from '@chessdecide/db';
import { NativeUciEngine } from '@chessdecide/engine';
import { DecisionsClient, ModelPlayer, type AttemptRow, type AttemptSink } from '@chessdecide/providers';
import { openLocalDb } from './d1.ts';
import { buildPorts, createRuntime, newGame } from './runtime.ts';
import { calibrate } from './ladder.ts';
import { runPublish } from './publish.ts';
import { dataDir, findStockfish, isMock, loadEnv, openRouterKey } from './config.ts';

const [cmd, ...rest] = process.argv.slice(2);
loadEnv();

async function game() {
  const { values: v } = parseArgs({ args: rest, options: {
    white: { type: 'string', default: 'mock' }, black: { type: 'string', default: 'random' },
    'max-plies': { type: 'string', default: '200' }, seed: { type: 'string', default: '1' }, depth: { type: 'string', default: '14' },
  } });
  const parse = (s: string): GameConfig['white'] => (s === 'mock' ? { type: 'model', model: 'mock/heuristic', arm: 'clean' } : { type: 'ladder', level: s });
  const config: GameConfig = { white: parse(v.white!), black: parse(v.black!), opening: { type: 'startpos' }, pace_ms: 0, budget_usd: 1, judge_depth: Number(v.depth), max_plies: Number(v['max-plies']), adjudicate: true, seed: Number(v.seed) };
  const { db, close } = await openLocalDb();
  const rt = await createRuntime();
  const g0 = newGame(config);
  const ports = await buildPorts(rt, db, g0, { mock: true });
  const t0 = Date.now();
  const g = await playToEnd(g0, ports);
  console.log(`${g.id} ${g.result} ${g.termination} plies=${g.plies.length} cost=$${g.cost_usd.toFixed(6)} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  const back = await loadGame(db, g.id);
  console.log('reloaded from D1:', back?.plies.length, 'plies');
  await ports.closePlayers(); await rt.close(); await close();
}

/** One real Decisions call, no DB: what the daemon will send and what it costs. */
async function probe() {
  const { values: v } = parseArgs({ args: rest, options: {
    model: { type: 'string', default: 'typesafe/jev-1.14' },
    arm: { type: 'string', default: 'clean' },
    fen: { type: 'string' },
  } });
  const model = v.model!;
  const armName = v.arm as ArmName;
  if (!(armName in ARM_PRESETS) || armName === 'image') {
    console.error(`unknown or unsupported arm "${v.arm}" (use clean or hinted; image arrives in T12)`);
    process.exit(2);
  }
  const key = openRouterKey();
  if (!key) {
    console.error('OPENROUTER_API_KEY is not set. Add it to .env or the environment.');
    process.exit(2);
  }
  const fen = v.fen ?? START_FEN;
  const legal = legalMoves(fen);
  const rows: AttemptRow[] = [];
  const sink: AttemptSink = {
    async record(row) { rows.push(row); return rows.length; },
    async findCached() { return undefined; },
  };
  const config: GameConfig = {
    white: { type: 'model', model, arm: armName }, black: { type: 'ladder', level: 'random' },
    opening: { type: 'startpos' }, pace_ms: 0, budget_usd: 1, judge_depth: 14, max_plies: 200, adjudicate: true, seed: 1,
  };
  const game: Game = { id: 'probe', status: 'running', config, start_fen: fen, adjudicated: false, plies: [], result: '*', termination: '', cost_usd: 0, created_at: new Date().toISOString() };
  const player = new ModelPlayer({ client: new DecisionsClient({ apiKey: key }), sink, model, arm: armName, seed: 1 });
  const ctx: MoveContext = { game, fen, historySan: [], legal, ply: 1, side: sideToMove(fen) };
  const t0 = Date.now();
  const m = await player.move(ctx);
  const d = m.decision!;
  const san = legal.find((x) => x.uci === m.uci)?.san ?? m.uci;
  const lastOk = rows.filter((r) => r.status === 'ok').at(-1);
  console.log(`model    ${model}  arm ${armName}`);
  console.log(`fen      ${fen}`);
  console.log(`pick     ${san} (${m.uci})  p_pick=${d.p_pick !== undefined ? d.p_pick.toFixed(4) : 'n/a'}`);
  console.log(`latency  ${d.latency_ms} ms (wall ${Date.now() - t0} ms)  retries ${d.retries}  cached ${d.cache_hit ? 'yes' : 'no'}`);
  console.log(`usage    input ${d.usage.input_tokens} tok  output ${d.usage.output_tokens} tok  cost $${(d.usage.cost_usd ?? 0).toFixed(6)}`);
  console.log(`request  ${lastOk?.request_bytes ?? '?'} bytes  attempts ${rows.length}`);
}

/** CPU-only ladder calibration. No model calls, no spend. */
async function ladder() {
  if (rest[0] !== 'calibrate') {
    console.error('usage: chessdecide ladder calibrate [--games-per-pair N] [--workers N] [--movetime MS] [--seed N] [--resume]');
    process.exit(2);
  }
  const { values: v } = parseArgs({ args: rest.slice(1), options: {
    'games-per-pair': { type: 'string', default: '200' },
    workers: { type: 'string', default: '4' },
    movetime: { type: 'string', default: '50' },
    seed: { type: 'string', default: '1' },
    resume: { type: 'boolean', default: false },
    version: { type: 'string' },
  } });
  const { db, close } = await openLocalDb();
  try {
    const running = await db.select({ id: games.id }).from(games).where(eq(games.status, 'running')).limit(1);
    if (running.length) {
      console.error('refusing to calibrate while a game is running (pause or stop it first)');
      process.exitCode = 2;
      return;
    }
    const path = findStockfish();
    const res = await calibrate({
      db, dataDir: dataDir(),
      gamesPerPair: Number(v['games-per-pair']), workers: Number(v.workers), movetimeMs: Number(v.movetime), seed: Number(v.seed),
      resume: v.resume, ...(v.version ? { version: Number(v.version) } : {}),
      makeEngine: () => NativeUciEngine.start({ path }),
    });
    console.log(`calibrated ladder v${res.file.version}: ${res.path} · ${res.games} games · ${(res.wallMs / 1000).toFixed(0)}s`);
  } finally {
    await close();
  }
}

/** Publish finished series/games as SQL for a remote D1 (read-only site). Spec: T10. */
async function publish() {
  const { values: v } = parseArgs({ args: rest, options: {
    out: { type: 'string' },
    series: { type: 'string', multiple: true },
    'all-games': { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
    remote: { type: 'boolean', default: false },
    config: { type: 'string', default: 'wrangler.jsonc' },
  } });
  if (v.remote && v['dry-run']) {
    console.error('publish: --remote and --dry-run cannot be combined');
    process.exit(2);
  }
  const { db, close } = await openLocalDb();
  try {
    await runPublish({
      db,
      ...(v.out ? { outBase: v.out } : {}),
      ...(v.series?.length ? { seriesIds: v.series } : {}),
      allGames: !!v['all-games'], dryRun: !!v['dry-run'], remote: !!v.remote,
      ...(v.remote && v.config ? { configPath: v.config } : {}),
    });
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exitCode = 2;
  } finally {
    await close();
  }
}

if (cmd === 'game') await game();
else if (cmd === 'probe') await probe();
else if (cmd === 'ladder') await ladder();
else if (cmd === 'serve') { loadEnv(); const { startDaemon } = await import('./serve.ts'); await startDaemon({ mock: isMock() }); }
else if (cmd === 'publish') await publish();
else { console.error('usage: chessdecide serve | game [--white mock|<level>] [--black <level>] [--max-plies N] [--seed N] [--depth N] | probe [--model slug] [--arm clean|hinted] [--fen "<fen>"] | ladder calibrate [--games-per-pair N] [--workers N] [--movetime MS] [--seed N] [--resume] | publish [--out FILE] [--series ID...] [--all-games] [--dry-run] [--remote] [--config FILE]'); process.exit(2); }
