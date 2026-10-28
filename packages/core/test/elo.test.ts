import { describe, expect, it } from 'vitest';
import { estimate, posterior, probABeatsB, type RatedGame } from '../src/elo.ts';
import { DEFAULT_LADDER, nearestLevel } from '../src/ladder.ts';

const g = (opp: number, scores: (0 | 0.5 | 1)[]): RatedGame[] => scores.map((s) => ({ opponentElo: opp, score: s }));
const near = (a: number, b: number, tol = 1) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);

describe('elo posterior (METRICS.md B3 worked example)', () => {
  it('prior only: 1233 [196, 2381]', () => {
    const e = estimate([]);
    near(e.mean, 1233); near(e.lo, 196); near(e.hi, 2381);
  });
  it('block 1 vs eps15 (1150): 751 [220, 1150]', () => {
    const e = estimate(g(1150, [0, 0, 0.5, 0, 0]));
    near(e.mean, 751); near(e.lo, 220); near(e.hi, 1150);
  });
  it('block 2 vs eps50 (790): 681 [368, 949]', () => {
    const e = estimate([...g(1150, [0, 0, 0.5, 0, 0]), ...g(790, [0, 0.5, 0, 1, 0])]);
    near(e.mean, 681); near(e.lo, 368); near(e.hi, 949);
  });
  it('block 3 vs eps50 (790): 733 [518, 933]', () => {
    const e = estimate([...g(1150, [0, 0, 0.5, 0, 0]), ...g(790, [0, 0.5, 0, 1, 0]), ...g(790, [1, 0, 0.5, 0, 1])]);
    near(e.mean, 733); near(e.lo, 518); near(e.hi, 933);
    expect([e.w, e.d, e.l]).toEqual([3, 3, 9]);
  });
  it('0-5 and 5-0 stay finite; posterior sums to 1', () => {
    for (const s of [0, 1] as const) {
      const e = estimate(g(1200, [s, s, s, s, s]));
      expect(Number.isFinite(e.mean)).toBe(true);
      const p = posterior(g(1200, [s, s, s, s, s]));
      near(p.reduce((a, b) => a + b, 0), 1, 1e-9);
    }
  });
  it('more consistent data never widens the interval', () => {
    const a = estimate(g(1000, [1, 0, 1, 0, 1, 0, 1, 0, 1, 0]));
    const b = estimate(g(1000, Array.from({ length: 30 }, (_, i) => (i % 2 ? 0 : 1) as 0 | 1)));
    expect(b.half_width).toBeLessThan(a.half_width);
  });
  it('P(A>B) is 0.5 for identical posteriors and high when A is clearly better', () => {
    const p = posterior(g(1000, [1, 0, 1, 0]));
    near(probABeatsB(p, p), 0.5, 1e-9);
    expect(probABeatsB(posterior(g(1000, Array(20).fill(1))), posterior(g(1000, Array(20).fill(0))))).toBeGreaterThan(0.99);
  });
});

describe('ladder helpers', () => {
  it('nearestLevel picks the closest, ties to the lower Elo', () => {
    expect(nearestLevel(DEFAULT_LADDER.levels, 1200).id).toBe('eps15');   // 1150 vs 1320: 50 < 120
    expect(nearestLevel(DEFAULT_LADDER.levels, 751).id).toBe('eps50');    // 790
    expect(nearestLevel(DEFAULT_LADDER.levels, 681).id).toBe('eps50');
    expect(nearestLevel(DEFAULT_LADDER.levels, 0).id).toBe('random');
    expect(nearestLevel(DEFAULT_LADDER.levels, 5000).id).toBe('uci2800');
  });
});
