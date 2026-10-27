import { describe, expect, it } from 'vitest';
import { calibrationPairs, fitLadder, type CalibGame } from '../src/ladder-fit.ts';
import { mulberry32 } from '../src/rng.ts';
import { DEFAULT_LADDER } from '../src/ladder.ts';

describe('ladder fit', () => {
  const truth: Record<string, number> = { random: 250, eps75: 600, eps50: 800, eps30: 1000, eps15: 1150, uci1320: 1320, uci1500: 1550 };
  const ids = Object.keys(truth);
  function simulate(perPair: number, seed: number): CalibGame[] {
    const rng = mulberry32(seed); const out: CalibGame[] = [];
    for (const [a, b] of calibrationPairs(ids))
      for (let i = 0; i < perPair; i++) out.push({ a, b, scoreA: rng() < 1 / (1 + 10 ** ((truth[b]! - truth[a]!) / 400)) ? 1 : 0 });
    return out;
  }
  it('recovers known Elos within tolerance with the anchor fixed', () => {
    const r = fitLadder(simulate(400, 7), ids, { level: 'uci1320', elo: 1320 });
    for (const id of ids) expect(Math.abs(r.elo[id]! - truth[id]!)).toBeLessThan(60);
    expect(r.elo.uci1320).toBe(1320); expect(r.se.uci1320).toBe(0); expect(r.se.eps50).toBeGreaterThan(0);
  });
  it('pairs: neighbours, skip-one, and the weak/strong ties; no duplicates', () => {
    const p = calibrationPairs(DEFAULT_LADDER.levels.map((l) => l.id));
    const keys = p.map(([a, b]) => [a, b].sort().join('|'));
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain('eps50|random'); expect(keys).toContain('uci1320|uci1700');
    expect(p.length).toBeGreaterThanOrEqual(DEFAULT_LADDER.levels.length - 1);
  });
});
