/** Pure oracle maths, METRICS.md §3–§5. The engine produces OracleRow[]; this derives the rest. */
import type { Judge, MoveClass, OptionProb, PositionEval, Uci } from './types.ts';

export interface OracleRow {
  uci: Uci; san: string;
  cp: number;                             // mover POV, clamped [-1000, 1000]
  wp: number;                             // mover win probability, percentage points 0..100 (draw = half)
  wdl: [number, number, number];          // [W, D, L] per mille, MOVER POV
  mate_in?: number | null;
}
export interface Oracle { depth: number; sf_version: string; rows: OracleRow[] }

export const ACCEPTABLE_WL = 2.0;
export const BEST_SET_WL = 0.5;

export function classify(wl: number): MoveClass {
  if (wl >= 20) return 'blunder';
  if (wl >= 10) return 'mistake';
  if (wl >= 5) return 'inaccuracy';
  return 'ok';
}

export interface Derived {
  best: OracleRow;
  bestCp: number; bestWp: number;
  cpl: Record<Uci, number>; wl: Record<Uci, number>;
  bestSet: Set<Uci>; acceptable: Set<Uci>;
}

export function derive(o: Oracle): Derived {
  if (o.rows.length === 0) throw new Error('oracle has no rows');
  const bestCp = Math.max(...o.rows.map((r) => r.cp));
  const bestWp = Math.max(...o.rows.map((r) => r.wp));
  // best = argmax wp; tie-break higher cp, then lower UCI
  const best = [...o.rows].sort((a, b) => b.wp - a.wp || b.cp - a.cp || (a.uci < b.uci ? -1 : 1))[0]!;
  const cpl: Record<Uci, number> = {}, wl: Record<Uci, number> = {};
  const bestSet = new Set<Uci>(), acceptable = new Set<Uci>();
  for (const r of o.rows) {
    cpl[r.uci] = bestCp - r.cp;
    wl[r.uci] = bestWp - r.wp;
    if (wl[r.uci]! <= BEST_SET_WL) bestSet.add(r.uci);
    if (wl[r.uci]! <= ACCEPTABLE_WL) acceptable.add(r.uci);
  }
  return { best, bestCp, bestWp, cpl, wl, bestSet, acceptable };
}

export interface DecisionMetrics {
  pAcceptable: number; pBestSet: number; eWl: number; eCpl: number;
  entropy: number;                        // normalised to [0, 1]
  rankOfPick: number;
  uniform: { pAcceptable: number; eWl: number };
}

/** `probs` must be renormalised and keyed by UCI. */
export function decisionMetrics(o: Oracle, probs: Record<Uci, number>, pick: Uci): DecisionMetrics {
  const d = derive(o);
  let pAcc = 0, pBest = 0, eWl = 0, eCpl = 0, h = 0;
  for (const r of o.rows) {
    const p = probs[r.uci] ?? 0;
    if (d.acceptable.has(r.uci)) pAcc += p;
    if (d.bestSet.has(r.uci)) pBest += p;
    eWl += p * d.wl[r.uci]!;
    eCpl += p * d.cpl[r.uci]!;
    if (p > 0) h -= p * Math.log(p);
  }
  const n = o.rows.length;
  const pickWp = o.rows.find((r) => r.uci === pick)?.wp ?? 0;
  return {
    pAcceptable: pAcc, pBestSet: pBest, eWl, eCpl,
    entropy: n > 1 ? h / Math.log(n) : 0,
    rankOfPick: 1 + o.rows.filter((r) => r.wp > pickWp).length,
    uniform: {
      pAcceptable: d.acceptable.size / n,
      eWl: Object.values(d.wl).reduce((s, v) => s + v, 0) / n,
    },
  };
}

export function judgePlayed(o: Oracle, played: Uci, probs?: Record<Uci, number>): Judge {
  const d = derive(o);
  const row = o.rows.find((r) => r.uci === played);
  if (!row) throw new Error(`played move ${played} not in oracle`);
  const wl = d.wl[played]!;
  const m = probs ? decisionMetrics(o, probs, played) : undefined;
  return {
    depth: o.depth, best_uci: d.best.uci, best_san: d.best.san, best_cp: d.bestCp, played_cp: row.cp,
    cpl: d.cpl[played]!, win_loss: wl, class: classify(wl), acceptable: wl <= ACCEPTABLE_WL,
    ...(m ? { p_acceptable: m.pAcceptable, e_win_loss: m.eWl } : {}),
  };
}

/** Position evaluation after `played`, White POV, from the oracle row (no extra search). */
export function evalAfterFromOracle(o: Oracle, played: Uci, moverIsWhite: boolean): PositionEval {
  const row = o.rows.find((r) => r.uci === played);
  if (!row) throw new Error(`played move ${played} not in oracle`);
  const [w, dr, l] = row.wdl;
  return {
    depth: o.depth,
    white_eval_cp: moverIsWhite ? row.cp : -row.cp,
    wdl: moverIsWhite ? [w, dr, l] : [l, dr, w],
  };
}

/** Convert a search of the position AFTER a ply (side to move = opponent of the mover) to White POV. */
export function evalFromSideToMove(depth: number, cpStm: number, wdlStm: [number, number, number], whiteToMove: boolean): PositionEval {
  const cp = Math.max(-1000, Math.min(1000, cpStm));
  const [w, dr, l] = wdlStm;
  return { depth, white_eval_cp: whiteToMove ? cp : -cp, wdl: whiteToMove ? [w, dr, l] : [l, dr, w] };
}

/** Terminal positions need no search. `winner` is the colour that delivered mate, or null for a draw. */
export function evalTerminal(depth: number, winner: 'white' | 'black' | null): PositionEval {
  if (winner === 'white') return { depth, white_eval_cp: 1000, wdl: [1000, 0, 0] };
  if (winner === 'black') return { depth, white_eval_cp: -1000, wdl: [0, 0, 1000] };
  return { depth, white_eval_cp: 0, wdl: [0, 1000, 0] };
}

/** Fill cp/cpl/win_loss on a decision's options; append SF's best if it is not listed. */
export function annotateOptions(options: OptionProb[], o: Oracle, san: (uci: Uci) => string): OptionProb[] {
  const d = derive(o);
  const out = options.map((x) => ({ ...x, cp: o.rows.find((r) => r.uci === x.uci)?.cp, cpl: d.cpl[x.uci], win_loss: d.wl[x.uci] }));
  if (!out.some((x) => x.uci === d.best.uci)) {
    out.push({ uci: d.best.uci, san: san(d.best.uci), p: 0, cp: d.best.cp, cpl: d.cpl[d.best.uci]!, win_loss: d.wl[d.best.uci]! });
  }
  return out;
}
