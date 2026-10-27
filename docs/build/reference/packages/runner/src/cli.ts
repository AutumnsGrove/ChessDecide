#!/usr/bin/env -S pnpm exec tsx
import { parseArgs } from 'node:util';
import { playToEnd, type GameConfig } from '@chessdecide/core';
import { loadGame } from '@chessdecide/db';
import { openLocalDb } from './d1.ts';
import { buildPorts, createRuntime, newGame } from './runtime.ts';

const [cmd, ...rest] = process.argv.slice(2);

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

if (cmd === 'game') await game();
else if (cmd === 'serve') { const { startDaemon } = await import('./serve.ts'); await startDaemon({ mock: process.env.CHESSDECIDE_MOCK === '1' }); }
else { console.error('usage: chessdecide serve | game [--white mock|<level>] [--black <level>] [--max-plies N] [--seed N] [--depth N]'); process.exit(2); }
