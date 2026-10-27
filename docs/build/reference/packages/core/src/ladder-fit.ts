/** Fit one Elo per ladder level from engine-vs-engine games. Spec: docs/METRICS.md B2 "Calibration". */
export interface CalibGame { a: string; b: string; scoreA: 0 | 0.5 | 1 }   // result of level `a` against level `b`
export interface FitResult { elo: Record<string, number>; se: Record<string, number>; games: Record<string, number>; iterations: number }

const clamp = (e: number) => Math.min(1 - 1e-12, Math.max(1e-12, e));
const expected = (ra: number, rb: number) => 1 / (1 + 10 ** ((rb - ra) / 400));

/**
 * Coordinate ascent on the quasi-likelihood sum s*ln(e) + (1-s)*ln(1-e), integer Elo grid 0..3500,
 * the `anchor` level held fixed. Levels with no games stay at `start`. Stops when no level moves by >= 0.5.
 */
export function fitLadder(
  games: readonly CalibGame[], levelIds: readonly string[], anchor: { level: string; elo: number },
  start: Record<string, number> = {}, maxIter = 200,
): FitResult {
  const elo: Record<string, number> = {};
  for (const id of levelIds) elo[id] = id === anchor.level ? anchor.elo : (start[id] ?? 1200);
  // aggregate to (level, opponent) -> {n games, s total score of `level`}: the likelihood only needs sums
  type Agg = { opp: string; n: number; s: number };
  const agg = new Map<string, Map<string, Agg>>();
  const bump = (id: string, opp: string, s: number) => {
    let m = agg.get(id); if (!m) agg.set(id, (m = new Map()));
    const x = m.get(opp) ?? { opp, n: 0, s: 0 }; x.n++; x.s += s; m.set(opp, x);
  };
  for (const g of games) { bump(g.a, g.b, g.scoreA); bump(g.b, g.a, 1 - g.scoreA); }
  let iterations = 0;
  for (; iterations < maxIter; iterations++) {
    let maxMove = 0;
    for (const id of levelIds) {
      if (id === anchor.level) continue;
      const rows = [...(agg.get(id)?.values() ?? [])];
      if (!rows.length) continue;
      let bestR = elo[id]!, bestL = -Infinity;
      for (let r = 0; r <= 3500; r++) {
        let l = 0;
        for (const x of rows) { const e = clamp(expected(r, elo[x.opp]!)); l += x.s * Math.log(e) + (x.n - x.s) * Math.log(1 - e); }
        if (l > bestL) { bestL = l; bestR = r; }
      }
      maxMove = Math.max(maxMove, Math.abs(bestR - elo[id]!));
      elo[id] = bestR;
    }
    if (maxMove < 0.5) break;
  }
  // standard error from the observed information: 1 / sqrt(sum k^2 e(1-e)), k = ln(10)/400
  const k = Math.LN10 / 400, se: Record<string, number> = {}, n: Record<string, number> = {};
  for (const id of levelIds) {
    const rows = [...(agg.get(id)?.values() ?? [])];
    n[id] = rows.reduce((s, x) => s + x.n, 0);
    let info = 0;
    for (const x of rows) { const e = expected(elo[id]!, elo[x.opp]!); info += x.n * k * k * e * (1 - e); }
    se[id] = id === anchor.level || info === 0 ? 0 : 1 / Math.sqrt(info);
  }
  return { elo, se, games: n, iterations };
}

/** Pairs to play (METRICS.md B2): each level vs its two neighbours on the ordered list, plus uci1320-uci1700 and random-eps50. */
export function calibrationPairs(orderedIds: readonly string[]): Array<[string, string]> {
  const out = new Map<string, [string, string]>();
  const add = (a: string, b: string) => { if (a !== b) out.set([a, b].sort().join('|'), [a, b]); };
  for (let i = 0; i < orderedIds.length - 1; i++) add(orderedIds[i]!, orderedIds[i + 1]!);
  for (let i = 0; i < orderedIds.length - 2; i++) add(orderedIds[i]!, orderedIds[i + 2]!);
  if (orderedIds.includes('uci1320') && orderedIds.includes('uci1700')) add('uci1320', 'uci1700');
  if (orderedIds.includes('random') && orderedIds.includes('eps50')) add('random', 'eps50');
  return [...out.values()];
}
