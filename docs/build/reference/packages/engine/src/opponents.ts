import { legalMoves, type EngineInfo, type LadderLevel } from '@chessdecide/core';
import type { Engine } from './engine.ts';

export interface OpponentMove { uci: string; info: EngineInfo }
export interface Opponent {
  move(fen: string): Promise<OpponentMove>;
  close(): Promise<void>;
}

/** Stockfish (or any UCI engine) limited to `elo` with a fixed movetime. */
export class StockfishOpponent implements Opponent {
  constructor(private engine: Engine, private o: { levelId: string; elo: number; movetimeMs: number; levelElo: number }) {}
  async move(fen: string): Promise<OpponentMove> {
    const r = await this.engine.search({
      fen, movetimeMs: this.o.movetimeMs,
      options: { UCI_LimitStrength: true, UCI_Elo: this.o.elo, Threads: 1, Hash: 32 },
    });
    return { uci: r.bestUci, info: { engine_id: this.engine.id, level_id: this.o.levelId, elo: this.o.levelElo, time_ms: this.o.movetimeMs, random: false } };
  }
  close() { return this.engine.close(); }
}

export class RandomOpponent implements Opponent {
  constructor(private rng: () => number, private o: { levelId: string; levelElo: number } = { levelId: 'random', levelElo: 250 }) {}
  async move(fen: string): Promise<OpponentMove> {
    const m = legalMoves(fen);
    return { uci: m[Math.floor(this.rng() * m.length)]!.uci, info: { engine_id: 'random', level_id: this.o.levelId, elo: this.o.levelElo, time_ms: 0, random: true } };
  }
  async close() {}
}

/** With probability eps play a uniformly random legal move, else defer to `inner`. */
export class EpsOpponent implements Opponent {
  constructor(private inner: Opponent, private eps: number, private rng: () => number, private o: { levelId: string; levelElo: number }) {}
  async move(fen: string): Promise<OpponentMove> {
    if (this.rng() < this.eps) {
      const m = legalMoves(fen);
      return { uci: m[Math.floor(this.rng() * m.length)]!.uci, info: { engine_id: 'eps', level_id: this.o.levelId, elo: this.o.levelElo, time_ms: 0, random: true } };
    }
    const r = await this.inner.move(fen);
    return { uci: r.uci, info: { ...r.info, level_id: this.o.levelId, elo: this.o.levelElo } };
  }
  close() { return this.inner.close(); }
}

/** Build the opponent for a ladder level. `makeEngine` is called for levels that need an engine. */
export async function makeOpponent(level: LadderLevel, makeEngine: () => Promise<Engine>, rng: () => number, movetimeMs: number): Promise<Opponent> {
  if (level.kind === 'random') return new RandomOpponent(rng, { levelId: level.id, levelElo: level.elo });
  const sf = new StockfishOpponent(await makeEngine(), { levelId: level.id, elo: level.uci_elo ?? 1320, movetimeMs, levelElo: level.elo });
  if (level.kind === 'uci') return sf;
  return new EpsOpponent(sf, level.eps ?? 0, rng, { levelId: level.id, levelElo: level.elo });
}
