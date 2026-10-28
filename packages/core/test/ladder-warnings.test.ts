import { describe, expect, it } from 'vitest';
import type { LadderLevel } from '../src/ladder.ts';
import { ladderWarnings } from '../src/ladder-warnings.ts';

const level = (id: string, kind: LadderLevel['kind'], elo: number): LadderLevel => ({ id, kind, label: id, elo });
const nominal = { uci1320: 1320, uci1500: 1500, uci1700: 1700, uci1900: 1900 };

describe('ladderWarnings', () => {
  it('is silent when measured gaps match nominal gaps', () => {
    const levels = [level('uci1320', 'uci', 1320), level('uci1500', 'uci', 1500), level('uci1700', 'uci', 1690)];
    expect(ladderWarnings(levels, nominal)).toEqual([]);
  });

  it('warns when a uci gap differs by more than 100 Elo', () => {
    const levels = [level('uci1320', 'uci', 1320), level('uci1500', 'uci', 1620)];
    const w = ladderWarnings(levels, nominal);
    expect(w).toHaveLength(1);
    expect(w[0]).toContain('uci1320→uci1500');
    expect(w[0]).toContain('measured 300');
    expect(w[0]).toContain('nominal 180');
  });

  it('ignores gaps between non-uci levels', () => {
    const levels = [level('eps15', 'eps', 1150), level('uci1320', 'uci', 1320)];
    expect(ladderWarnings(levels, nominal)).toEqual([]);
  });

  it('warns when measured Elo is not strictly increasing in nominal order', () => {
    const levels = [level('uci1320', 'uci', 1320), level('uci1500', 'uci', 1500), level('uci1700', 'uci', 1450)];
    const w = ladderWarnings(levels, nominal);
    expect(w.some((x) => x.includes('not below'))).toBe(true);
  });
});
