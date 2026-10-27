import { ulid } from 'ulid';
import {
  DEFAULT_LADDER, START_FEN, mulberry32, type Color, type Game, type GameConfig, type Player, type Ports, type PlayerDesc,
} from '@chessdecide/core';
import { EngineJudge, NativeUciEngine, makeOpponent, type Opponent } from '@chessdecide/engine';
import { MockPlayer } from '@chessdecide/providers';
import { d1GameStore, type Db } from '@chessdecide/db';
import { findStockfish, judgeWorkers } from './config.ts';

export interface Runtime { judge: EngineJudge; close(): Promise<void>; engines: NativeUciEngine[] }

export async function createRuntime(): Promise<Runtime> {
  const path = findStockfish();
  const engines = await Promise.all(Array.from({ length: judgeWorkers() }, () => NativeUciEngine.start({ path, options: { Threads: 1, Hash: 64, UCI_ShowWDL: true } })));
  const judge = await EngineJudge.create(engines);
  return { judge, engines, close: async () => { await Promise.all(engines.map((e) => e.close())); } };
}

function engineAsPlayer(opp: Opponent): Player {
  return { kind: 'engine', async move(ctx) { const m = await opp.move(ctx.fen); return { uci: m.uci, engine_info: m.info }; } };
}

export function newGame(config: GameConfig, startFen = START_FEN): Game {
  return { id: ulid(), status: 'ready', config, start_fen: startFen, adjudicated: false, plies: [], result: '*', termination: '', cost_usd: 0, created_at: new Date().toISOString() };
}

export async function buildPorts(rt: Runtime, db: Db, game: Game, opts: { mock: boolean; events?: Ports['events'] }): Promise<Ports & { closePlayers(): Promise<void> }> {
  const players = new Map<Color, Player>();
  const opponents: Opponent[] = [];
  const rng = mulberry32(game.config.seed);
  const mk = async (side: Color, desc: PlayerDesc): Promise<Player> => {
    if (desc.type === 'model') {
      if (!opts.mock) throw new Error('real model players are added in task T14');
      return new MockPlayer({ seed: game.config.seed + (side === 'white' ? 1 : 2) });
    }
    const level = DEFAULT_LADDER.levels.find((l) => l.id === (desc.type === 'ladder' ? desc.level : 'uci1500'))!;
    const opp = await makeOpponent(level, () => NativeUciEngine.start({ path: findStockfish() }), rng, 50);
    opponents.push(opp);
    return engineAsPlayer(opp);
  };
  for (const side of ['white', 'black'] as const) players.set(side, await mk(side, game.config[side]));
  return {
    player: (side) => players.get(side)!,
    judge: rt.judge, store: d1GameStore(db), events: opts.events ?? { emit() {} },
    budget: { check: () => ({ ok: true }) }, now: () => new Date().toISOString(),
    closePlayers: async () => { await Promise.all(opponents.map((o) => o.close())); },
  };
}
