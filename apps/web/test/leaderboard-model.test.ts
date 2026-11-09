import { describe, expect, it } from 'vitest';
import type { LeaderRow } from '../src/lib/api.ts';
import {
  armLabel, comparisonSentence, differenceLabel, money, notSeparableCopy, num1, overlapLines, overlapPairs,
  overlapsWith, pct0, separationLabel, armIdsFrom, compareHref, MAX_COMPARE, pairAsCompare, family, hintSummary, modelsOf, shortName, signed, tiers,
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
    expect(comparisonSentence({ ...c, p_a_gt_b: 0.001 })).toBe('P(d1-ultra · clean stronger) < 1 %');
    expect(comparisonSentence({ ...c, p_a_gt_b: 0.999 })).toBe('P(d1-ultra · clean stronger) > 99 %');
    expect(differenceLabel(c)).toBe('+243 Elo (-12 to 499, 95 %)');
    expect(differenceLabel({ ...c, p_a_gt_b: 0.4, diff_mean: -60.5, diff_lo: -300, diff_hi: 180 })).toBe('-60 Elo (-300 to 180, 95 %)');
  });
});

describe('tiers', () => {
  const arms = [
    row({ arm_id: 'a', elo: elo(900) }), row({ arm_id: 'b', elo: elo(850) }), row({ arm_id: 'c', elo: elo(780) }),
    row({ arm_id: 'd', elo: elo(500) }), row({ arm_id: 'e', elo: elo(450) }), row({ arm_id: 'f', elo: elo(100) }),
  ];

  it('groups arms whose interval overlaps the leader, then restarts at the best arm left', () => {
    const t = tiers(arms);
    expect(t.map((x) => x.rows.map((r) => r.arm_id))).toEqual([['a', 'b', 'c'], ['d', 'e'], ['f']]);
    expect(t.map((x) => x.n)).toEqual([1, 2, 3]);
    expect(t[0]).toMatchObject({ top: 900, bottom: 780 });
  });

  it('judges overlap against the leader, not the neighbour (no chaining)', () => {
    // c overlaps b and b overlaps a, but c (lo 580..hi 780... lead a lo 800) does not overlap a.
    const t = tiers([row({ arm_id: 'a', elo: elo(900, 100) }), row({ arm_id: 'b', elo: elo(780, 100) }), row({ arm_id: 'c', elo: elo(660, 100) })]);
    expect(t.map((x) => x.rows.map((r) => r.arm_id))).toEqual([['a', 'b'], ['c']]);
  });

  it('sorts by mean whatever the input order, and handles empty input', () => {
    expect(tiers([...arms].reverse())[0]!.leader.arm_id).toBe('a');
    expect(tiers([])).toEqual([]);
  });
});

describe('models and the hint effect', () => {
  const m = (model: string, arm: string, mean: number, hw = 100) => row({ arm_id: `${model}#${arm}`, model, arm, elo: elo(mean, hw) });
  const rows = [m('x/alpha', 'clean', 400), m('x/alpha', 'hinted', 700), m('y/beta', 'clean', 600), m('y/beta', 'hinted', 560), m('z/gamma', 'hinted', 300)];

  it('pairs the two arms of a model and computes the gap with its own band', () => {
    const models = modelsOf(rows);
    expect(models.map((x) => x.name)).toEqual(['alpha', 'beta', 'gamma']);
    const alpha = models[0]!;
    expect(alpha.delta).toBe(300);
    expect(alpha.deltaHw).toBeCloseTo(Math.hypot(100, 100));
    expect(models[2]!.delta).toBeNull();
  });

  it('summarises how many models hints help, and how many gaps clear their band', () => {
    const s = hintSummary(modelsOf(rows))!;
    expect(s).toMatchObject({ models: 2, improved: 1, clear: 1, min: -40, max: 300 });
    expect(s.median).toBe(130);
    expect(hintSummary(modelsOf([m('z/gamma', 'hinted', 300)]))).toBeNull();
  });

  it('names and signs things for display', () => {
    expect(shortName('baseten/mammoth-1')).toBe('mammoth-1');
    expect(family('baseten/mammoth-1')).toBe('baseten');
    expect(signed(56.4)).toBe('+56');
    expect(signed(-12)).toBe('−12');
  });
});

describe('comparing several arms', () => {
  it('builds a link that survives arm ids with # and /', () => {
    const href = compareHref(['x/alpha#hinted', 'y/beta#clean', 'z/gamma#clean']);
    expect(href).toBe('/compare?arms=x%2Falpha%23hinted,y%2Fbeta%23clean,z%2Fgamma%23clean');
    expect(armIdsFrom(new URL(href, 'http://x').searchParams)).toEqual(['x/alpha#hinted', 'y/beta#clean', 'z/gamma#clean']);
  });

  it('still reads the older two-arm links, and ignores blanks and duplicates', () => {
    expect(armIdsFrom(new URLSearchParams('a=p%23q&b=r%23s'))).toEqual(['p#q', 'r#s']);
    expect(armIdsFrom(new URLSearchParams('arms=a,,a, b ,'))).toEqual(['a', 'b']);
    expect(armIdsFrom(new URLSearchParams(''))).toEqual([]);
  });

  it('caps the list at the server limit', () => {
    const many = Array.from({ length: 10 }, (_, i) => `m${i}#clean`).join(',');
    expect(armIdsFrom(new URLSearchParams({ arms: many }))).toHaveLength(MAX_COMPARE);
    expect(MAX_COMPARE).toBe(6);
  });

  it('turns a pair back into the two-arm shape so the wording is shared', () => {
    const arms = [{ arm_id: 'x/alpha#hinted', model: 'x/alpha', arm: 'hinted' }, { arm_id: 'y/beta#clean', model: 'y/beta', arm: 'clean' }];
    const c = pairAsCompare({ a: 'x/alpha#hinted', b: 'y/beta#clean', p_a_gt_b: 0.97, diff_mean: 251, diff_lo: 104, diff_hi: 398 }, arms)!;
    expect(comparisonSentence(c)).toBe('P(alpha · hinted stronger) = 97 %');
    expect(differenceLabel(c)).toBe('+251 Elo (104 to 398, 95 %)');
    expect(pairAsCompare({ a: 'nope', b: 'y/beta#clean', p_a_gt_b: 0.5, diff_mean: 0, diff_lo: 0, diff_hi: 0 }, arms)).toBeNull();
  });
});
