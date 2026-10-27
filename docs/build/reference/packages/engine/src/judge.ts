import { applyMove, legalMoves, outcomeOf, sha256Hex, type JudgePort, type Oracle, type OracleRow } from '@chessdecide/core';
import { lineCp } from './uci-parse.ts';
import type { Engine } from './engine.ts';

export interface OracleCache { get(key: string): Promise<Oracle | undefined>; set(key: string, o: Oracle): Promise<void> }
export class MemoryOracleCache implements OracleCache {
  private m = new Map<string, Oracle>();
  async get(k: string) { return this.m.get(k); }
  async set(k: string, o: Oracle) { this.m.set(k, o); }
}

const JUDGE_OPTIONS = { UCI_LimitStrength: false, Threads: 1, Hash: 64, UCI_ShowWDL: true, MultiPV: 1 } as const;
const fenKey = (fen: string) => fen.split(' ').slice(0, 4).join(' ');   // placement, side, castling, ep

export class EngineJudge implements JudgePort {
  searches = 0;                                           // counts real engine searches (for tests)
  private rr = 0;
  constructor(private engines: Engine[], private sfVersion: string, private cache: OracleCache = new MemoryOracleCache()) {}

  static async create(engines: Engine[], cache?: OracleCache) {
    return new EngineJudge(engines, await engines[0]!.version(), cache);
  }

  private async searchChild(fen: string, depth: number, e: Engine) {
    this.searches++;
    const r = await e.search({ fen, depth, options: JUDGE_OPTIONS });
    const l = r.lines[0];
    if (!l) throw new Error('engine returned no score');
    return l;
  }

  async evalPosition(fen: string, depth: number) {
    const e = this.engines[this.rr++ % this.engines.length]!;
    const l = await this.searchChild(fen, depth, e);
    return { cp_stm: lineCp(l), wdl_stm: (l.wdl ?? wdlFromCp(lineCp(l))) as [number, number, number] };
  }

  async oracle(fen: string, depth: number): Promise<Oracle> {
    const key = await sha256Hex(`${fenKey(fen)}|${this.sfVersion}|${depth}|64|1`);
    const hit = await this.cache.get(key);
    if (hit) return hit;
    const moves = legalMoves(fen);                        // ascending UCI
    const rows: OracleRow[] = new Array(moves.length);
    let next = 0;
    const worker = async (e: Engine) => {
      for (;;) {
        const i = next++;
        if (i >= moves.length) return;
        const m = moves[i]!;
        const { fen: child } = applyMove(fen, m.uci);
        const oc = outcomeOf(child, []);
        if (oc === 'checkmate') rows[i] = { uci: m.uci, san: m.san, cp: 1000, wp: 100, wdl: [1000, 0, 0], mate_in: 0 };
        else if (oc === 'stalemate' || oc === 'insufficient') rows[i] = { uci: m.uci, san: m.san, cp: 0, wp: 50, wdl: [0, 1000, 0], mate_in: null };
        else {
          const l = await this.searchChild(child, depth, e);
          const [cw, cd, cl] = (l.wdl ?? wdlFromCp(lineCp(l))) as [number, number, number];   // child side-to-move POV
          const mate = l.mate !== undefined ? -l.mate : null;                                   // mover POV
          rows[i] = {
            uci: m.uci, san: m.san, cp: -lineCp(l), wp: (100 * (cl + cd / 2)) / 1000,
            wdl: [cl, cd, cw], mate_in: mate,
          };
        }
      }
    };
    await Promise.all(this.engines.map(worker));
    const o: Oracle = { depth, sf_version: this.sfVersion, rows };
    await this.cache.set(key, o);
    return o;
  }
}

/** Fallback when an engine does not report WDL: logistic from centipawns (Stockfish's rough model). */
export function wdlFromCp(cp: number): [number, number, number] {
  const w = Math.round(1000 / (1 + Math.exp(-cp / 111)));
  const l = Math.round(1000 / (1 + Math.exp(cp / 111)));
  return [w, 1000 - w - l, l];
}
