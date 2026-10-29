import { describe, expect, it } from 'vitest';
import type { LeaderRow } from '../src/lib/api.ts';
import {
  armLabel, comparisonSentence, differenceLabel, money, notSeparableCopy, num1, overlapLines, overlapPairs,
  overlapsWith, pct0, separationLabel,
} from '../src/lib/leaderboard-model.ts';

const row = (over: Partial<LeaderRow> & { arm_id: string }): LeaderRow => ({
  model: 'typesafe/jev-1.14', arm: 'clean', series_id: `s-${over.arm_id}`, status: 'finished',
  games: 25, elo: { mean: 900, lo: 800, hi: 1000, half_width: 100, games: 25, w: 10, d: 5, l: 10, score_pct: 0.5 },
  w: 10, d: 5, l: 10, score_pct: 0.5, acpl: 120, acceptable_rate: 0.8, blunder_rate: 0.1,
  cost_usd: 0.02, cost_per_game: 0.0008, separated_from: [], ...over,
});

const elo = (mean: number, hw = 100) => ({ mean, lo: mean - hw, hi: mean + hw, half_width: hw, games: 25, w: 10, d: 5, l: 10, score_pct: 0.5 });

describe('leaderboard model', () => {
  it('labels an arm with the short model name and the arm', () => {
    expect(armLabel(row({ arm_id: 'a' }))).toBe('jev-1.14 · clean');
    expect(armLabel(row({ arm_id: 'b', model: 'liquid/d1-ultra', arm: 'hinted' }))).toBe('d1-ultra · hinted');
  });

  it('formats cells', () => {
    expect(money(0.01234)).toBe('$0.0123');
    expect(money(null)).toBe('—');
    expect(pct0(0.763)).toBe('76 %');
    expect(pct0(null)).toBe('—');
    expect(num1(231.49)).toBe('231.5');
    expect(num1(null)).toBe('—');
  });

  it('lists overlapping pairs widest first with the shared Elo', () => {
    const pairs = overlapPairs([
      row({ arm_id: 'a', elo: elo(900) }),
      row({ arm_id: 'b', elo: elo(950) }),
      row({ arm_id: 'c', elo: elo(1400) }),
    ]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({ a: 'a', b: 'b', overlap: 150 });
    expect(pairs[0]!.labelA).toBe('jev-1.14 · clean');
  });

  it('treats touching intervals as overlapping and separated ones as not', () => {
    expect(overlapPairs([row({ arm_id: 'a', elo: elo(900) }), row({ arm_id: 'b', elo: elo(1100) })])).toHaveLength(1);
    expect(overlapPairs([row({ arm_id: 'a', elo: elo(900) }), row({ arm_id: 'b', elo: elo(1200) })])).toHaveLength(0);
  });

  it('writes the "not separable yet" heading and one line per overlapping pair', () => {
    const pairs = [{ a: 'a', b: 'b', labelA: 'Jev · clean', labelB: 'D1 Ultra · clean', overlap: 86 }];
    expect(notSeparableCopy([])).toBe('');
    expect(overlapLines([])).toEqual([]);
    expect(notSeparableCopy(pairs)).toContain('Not separable yet');
    expect(overlapLines(pairs)).toEqual(['Jev · clean ≈ D1 Ultra · clean (86 Elo)']);
  });

  it('names who a row overlaps (for the ≈ tooltip)', () => {
    const rows = [row({ arm_id: 'a', separated_from: ['c'] }), row({ arm_id: 'b' }), row({ arm_id: 'c' })];
    expect(overlapsWith(rows[0]!, rows)).toEqual(['jev-1.14 · clean']);
    expect(overlapsWith(row({ arm_id: 'solo', separated_from: ['x'] }), [row({ arm_id: 'x' })])).toEqual([]);
  });

  it('names who a row is separated from', () => {
    const labels = new Map([['b', 'D1 Ultra · clean']]);
    expect(separationLabel(row({ arm_id: 'a', separated_from: ['b'] }), labels)).toBe('D1 Ultra · clean');
    expect(separationLabel(row({ arm_id: 'a', separated_from: [] }), labels)).toBe('—');
    expect(separationLabel(row({ arm_id: 'a', separated_from: ['zz'] }), labels)).toBe('zz');
  });

  it('says probability and the difference interval in plain words', () => {
    const c = {
      a: { arm_id: 'a#clean', model: 'liquid/d1-ultra', arm: 'clean', series_id: 's', games: 25 },
      b: { arm_id: 'b#hinted', model: 'liquid/d1-ultra', arm: 'hinted', series_id: 't', games: 25 },
      p_a_gt_b: 0.826, diff_mean: 243.4, diff_lo: -12.2, diff_hi: 498.6,
    };
    expect(comparisonSentence(c)).toBe('P(d1-ultra · clean stronger) = 83 %');
    expect(differenceLabel(c)).toBe('+243 Elo (-12 to 499, 95 %)');
    expect(differenceLabel({ ...c, p_a_gt_b: 0.4, diff_mean: -60.5, diff_lo: -300, diff_hi: 180 })).toBe('-60 Elo (-300 to 180, 95 %)');
  });
});
