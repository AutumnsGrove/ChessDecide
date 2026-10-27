import { describe, expect, it } from 'vitest';
import { adjudicate } from '../src/adjudication.ts';
import { classify, decisionMetrics, derive, judgePlayed, type Oracle } from '../src/oracle.ts';

// METRICS.md §5 worked example
const row = (uci: string, san: string, cp: number, wp: number) => ({ uci, san, cp, wp, wdl: [0, 0, 0] as [number, number, number] });
const o: Oracle = {
  depth: 14, sf_version: 'test',
  rows: [row('e1e1', 'Re1', 23, 52.4), row('h2h3', 'h3', 20, 52.1), row('b2b4', 'b4', 19, 52.0),
         row('f3g5', 'Ng5', -14, 49.9), row('d2d4', 'd4', -42, 46.6), row('c4f7', 'Bxf7+', -647, 0.9)],
};
const probs = { c4f7: 0.48, d2d4: 0.2, e1e1: 0.12, h2h3: 0.1, b2b4: 0.06, f3g5: 0.04 };

describe('oracle maths', () => {
  it('cpl, wl, sets', () => {
    const d = derive(o);
    expect(d.best.san).toBe('Re1');
    expect(d.cpl['c4f7']).toBe(670);
    expect(d.wl['c4f7']).toBeCloseTo(51.5, 9);
    expect([...d.bestSet].sort()).toEqual(['b2b4', 'e1e1', 'h2h3']);
    expect([...d.acceptable].sort()).toEqual(['b2b4', 'e1e1', 'h2h3']);
  });
  it('classification thresholds', () => {
    expect([4.99, 5, 9.99, 10, 19.99, 20].map(classify)).toEqual(['ok', 'inaccuracy', 'inaccuracy', 'mistake', 'mistake', 'blunder']);
  });
  it('worked example: blunder, P_acceptable 0.28, E_wl 26.03, entropy 0.81, uniform 0.5 / 10.08', () => {
    const j = judgePlayed(o, 'c4f7', probs);
    expect(j.class).toBe('blunder'); expect(j.acceptable).toBe(false);
    expect(j.p_acceptable).toBeCloseTo(0.28, 9);
    expect(j.e_win_loss).toBeCloseTo(26.03, 2);
    const m = decisionMetrics(o, probs, 'c4f7');
    expect(m.entropy).toBeCloseTo(0.81, 2);
    expect(m.uniform.pAcceptable).toBeCloseTo(0.5, 9);
    expect(m.uniform.eWl).toBeCloseTo(10.08, 2);
    expect(m.rankOfPick).toBe(6);
  });
});

describe('adjudication', () => {
  it('needs ply >= 30 and six consecutive plies beyond 900 cp', () => {
    const run = (n: number, v: number) => Array(n).fill(v);
    expect(adjudicate(run(29, 1000))).toBeNull();
    expect(adjudicate(run(30, 1000))).toBe('white');
    expect(adjudicate(run(30, -950))).toBe('black');
    expect(adjudicate([...run(24, 0), ...run(5, 1000), 800])).toBeNull();
    expect(adjudicate([...run(24, 0), ...run(5, 1000), 900])).toBe('white'); // 900 is inclusive
    expect(adjudicate([...run(25, 0), ...run(5, 1000)])).toBeNull();          // only 5 in a row
  });
});
