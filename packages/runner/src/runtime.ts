import { ulid } from 'ulid';
import {
  ARM_PRESETS, DEFAULT_LADDER, START_FEN, legalMoves, lastFen, mulberry32,
  type BudgetPort, type Color, type Game, type GameConfig, type JudgePort, type LadderFile, type LadderLevel, type Player, type Ports, type PlayerDesc,
} from '@chessdecide/core';
import { EngineJudge, NativeUciEngine, makeOpponent, type Opponent } from '@chessdecide/engine';
import {
  DecisionsClient, IMAGE_EXTRA_TOKENS, MockPlayer, ModelPlayer, createCatalog, estimateCallUsd,
  type Catalog,
} from '@chessdecide/providers';
import { boardDataUrl } from '@chessdecide/render';
import { d1AttemptSink, d1GameStore, meanInputTokens, type Db } from '@chessdecide/db';
import { ApiError } from '@chessdecide/api';
import { findStockfish, judgeWorkers, openRouterKey } from './config.ts';

export interface Runtime { judge: JudgePort; close(): Promise<void>; engines: NativeUciEngine[] }

export async function createRuntime(): Promise<Runtime> {
  const path = findStockfish();
  const engines = await Promise.all(Array.from({ length: judgeWorkers() }, () => NativeUciEngine.start({ path, options: { Threads: 1, Hash: 64, UCI_ShowWDL: true } })));
  const judge = await EngineJudge.create(engines);
  return { judge, engines, close: async () => { await Promise.all(engines.map((e) => e.close())); } };
}

/** One catalog (1 h cache) and one Decisions client per process, so per-model limits are shared. */
const catalog = createCatalog();
export const getCatalog = (): Catalog => catalog;

let sharedClient: DecisionsClient | undefined;
export const clientFor = (key: string): DecisionsClient => (sharedClient ??= new DecisionsClient({ apiKey: key }));

function engineAsPlayer(opp: Opponent): Player {
  return { kind: 'engine', async move(ctx) { const m = await opp.move(ctx.fen); return { uci: m.uci, engine_info: m.info }; } };
}

export function newGame(config: GameConfig, startFen = START_FEN): Game {
  return { id: ulid(), status: 'ready', config, start_fen: startFen, adjudicated: false, plies: [], result: '*', termination: '', cost_usd: 0, created_at: new Date().toISOString() };
}

export async function buildPorts(rt: Runtime, db: Db, game: Game, opts: {
  mock: boolean; events?: Ports['events'];
  judge?: JudgePort;                                            // tests / series fake judge
  ladder?: LadderFile;                                          // the ruler in force; default DEFAULT_LADDER
  makeOpponentFor?: (level: LadderLevel, rng: () => number) => Promise<Opponent>;  // tests
}): Promise<Ports & { closePlayers(): Promise<void> }> {
  const players = new Map<Color, Player>();
  const opponents: Opponent[] = [];
  const rng = mulberry32(game.config.seed);
  /** Per model side: what one call may cost. The single budget port sums both sides. */
  const modelSides: Array<{ price: number; variant: 'slim' | 'full'; mean?: number; extraTokens: number }> = [];

  const mk = async (side: Color, desc: PlayerDesc): Promise<Player> => {
    if (desc.type === 'model') {
      const arm = typeof desc.arm === 'string' ? ARM_PRESETS[desc.arm] : desc.arm;
      const armId = typeof desc.arm === 'string' ? desc.arm : 'custom';
      const image = arm.interface === 'image';
      const seed = game.config.seed + (side === 'white' ? 1 : 2);
      if (opts.mock) return new MockPlayer({ seed });
      const info = (await catalog.list()).find((m) => m.slug === desc.model);
      if (!info) throw new ApiError('invalid_config', `unknown model ${desc.model}`, 400);
      const key = openRouterKey();
      if (!key) throw new ApiError('no_api_key', 'OPENROUTER_API_KEY is not set', 424);
      const mean = await meanInputTokens(db, desc.model, armId);
      modelSides.push({
        price: info.price_in_per_m, variant: arm.state_variant, extraTokens: image ? IMAGE_EXTRA_TOKENS : 0,
        ...(mean !== undefined ? { mean } : {}),
      });
      return new ModelPlayer({
        client: clientFor(key), sink: d1AttemptSink(db), model: desc.model, arm: desc.arm, seed,
        ...(image ? { renderImage: async (fen: string) => boardDataUrl(fen) } : {}),
      });
    }
    const ladder = opts.ladder ?? DEFAULT_LADDER;
    const levelId = desc.type === 'ladder' ? desc.level : 'uci1500';
    const level = ladder.levels.find((l) => l.id === levelId);
    if (!level) throw new ApiError('invalid_config', `unknown ladder level ${levelId}`, 400);
    const opp = opts.makeOpponentFor
      ? await opts.makeOpponentFor(level, rng)
      : await makeOpponent(level, () => NativeUciEngine.start({ path: findStockfish() }), rng, ladder.movetime_ms);
    opponents.push(opp);
    return engineAsPlayer(opp);
  };

  for (const side of ['white', 'black'] as const) players.set(side, await mk(side, game.config[side]));

  const budget: BudgetPort = modelSides.length === 0 ? { check: () => ({ ok: true }) } : {
    check(g: Game) {
      const n = legalMoves(lastFen(g)).length;
      const est = modelSides.reduce((sum, m) => sum + estimateCallUsd(n, m.price, m.variant, m.mean, m.extraTokens), 0);
      const ok = g.cost_usd + est <= g.config.budget_usd + 1e-12;
      return ok ? { ok } : { ok, reason: `budget: spent ${g.cost_usd.toFixed(6)} + est ${est.toFixed(6)} > cap ${g.config.budget_usd}` };
    },
  };

  return {
    player: (side) => players.get(side)!,
    judge: opts.judge ?? rt.judge, store: d1GameStore(db), events: opts.events ?? { emit() {} },
    budget, now: () => new Date().toISOString(),
    closePlayers: async () => { await Promise.all(opponents.map((o) => o.close())); },
  };
}
