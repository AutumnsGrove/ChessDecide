/** Elo grid posterior, METRICS.md B3. Pure and deterministic. */
export interface RatedGame { opponentElo: number; score: 0 | 0.5 | 1 }
export interface EloEstimate {
  mean: number; lo: number; hi: number; half_width: number;
  games: number; w: number; d: number; l: number; score_pct: number;
}
export const GRID_MIN = 0;
export const GRID_MAX = 3500;
export const PRIOR_MEAN = 1200;
export const PRIOR_SD = 600;

const clamp = (e: number) => Math.min(1 - 1e-12, Math.max(1e-12, e));

/** Normalised posterior over the integer grid 0..3500 (length 3501). */
export function posterior(games: readonly RatedGame[]): Float64Array {
  const n = GRID_MAX - GRID_MIN + 1;
  const logp = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const r = GRID_MIN + i;
    let lp = -0.5 * ((r - PRIOR_MEAN) / PRIOR_SD) ** 2;
    for (const g of games) {
      const e = clamp(1 / (1 + 10 ** ((g.opponentElo - r) / 400)));
      lp += g.score * Math.log(e) + (1 - g.score) * Math.log(1 - e);
    }
    logp[i] = lp;
  }
  let max = -Infinity;
  for (const v of logp) if (v > max) max = v;
  let sum = 0;
  for (let i = 0; i < n; i++) { logp[i] = Math.exp(logp[i]! - max); sum += logp[i]!; }
  for (let i = 0; i < n; i++) logp[i] = logp[i]! / sum;
  return logp;
}

/** Smallest grid value whose cumulative probability reaches q. */
export function quantile(post: Float64Array, q: number): number {
  let c = 0;
  for (let i = 0; i < post.length; i++) {
    c += post[i]!;
    if (c >= q) return GRID_MIN + i;
  }
  return GRID_MAX;
}

export function estimate(games: readonly RatedGame[]): EloEstimate {
  const post = posterior(games);
  let mean = 0;
  for (let i = 0; i < post.length; i++) mean += (GRID_MIN + i) * post[i]!;
  const lo = quantile(post, 0.025);
  const hi = quantile(post, 0.975);
  const w = games.filter((g) => g.score === 1).length;
  const d = games.filter((g) => g.score === 0.5).length;
  const l = games.filter((g) => g.score === 0).length;
  const total = games.reduce((s, g) => s + g.score, 0);
  return {
    mean, lo, hi, half_width: (hi - lo) / 2,
    games: games.length, w, d, l,
    score_pct: games.length ? total / games.length : 0,
  };
}

/** P(A > B) for two independent grid posteriors (ties count half). */
export function probABeatsB(a: Float64Array, b: Float64Array): number {
  let p = 0, cumB = 0;
  for (let i = 0; i < a.length; i++) {
    p += a[i]! * (cumB + 0.5 * b[i]!);
    cumB += b[i]!;
  }
  return p;
}
