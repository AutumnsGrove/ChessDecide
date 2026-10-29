/** Pure helpers for the leaderboard screen. Fixed labels over stored numbers, no commentary. */
import type { CompareResult, LeaderRow } from './api.ts';

/** `Jev · clean` — the model's short name and its arm. */
export function armLabel(row: Pick<LeaderRow, 'model' | 'arm'>): string {
  return `${row.model.split('/').pop()} · ${row.arm}`;
}

export const money = (v: number | null): string => (v === null ? '—' : `$${v.toFixed(4)}`);
export const pct0 = (v: number | null): string => (v === null ? '—' : `${Math.round(v * 100)} %`);
export const num1 = (v: number | null): string => (v === null ? '—' : v.toFixed(1));

export interface OverlapPair { a: string; b: string; labelA: string; labelB: string; overlap: number }

/** Pairs whose 95 % intervals overlap, with the shared width in Elo (sort: widest overlap first). */
export function overlapPairs(rows: readonly LeaderRow[]): OverlapPair[] {
  const out: OverlapPair[] = [];
  for (let i = 0; i < rows.length; i++)
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i]!, b = rows[j]!;
      const lo = Math.max(a.elo.lo, b.elo.lo), hi = Math.min(a.elo.hi, b.elo.hi);
      if (lo <= hi) out.push({ a: a.arm_id, b: b.arm_id, labelA: armLabel(a), labelB: armLabel(b), overlap: Math.round(hi - lo) });
    }
  return out.sort((x, y) => y.overlap - x.overlap);
}

/** One line per overlapping pair: `A ≈ B (86 Elo)`. Empty when every pair is separated. */
export const overlapLines = (pairs: readonly OverlapPair[]): string[] =>
  pairs.map((p) => `${p.labelA} ≈ ${p.labelB} (${p.overlap} Elo)`);

/** The summary sentence above the list: "" when every pair is separated. */
export const notSeparableCopy = (pairs: readonly OverlapPair[]): string =>
  pairs.length === 0 ? '' : 'Not separable yet on this many games:';

/** The table's separation cell: arms this row does not overlap, or `—` (overlaps all of them). */
export function separationLabel(row: LeaderRow, labels: ReadonlyMap<string, string>): string {
  return row.separated_from.length ? row.separated_from.map((id) => labels.get(id) ?? id).join(', ') : '—';
}

/** Arms this row overlaps, as labels — the `≈` tooltip. */
export function overlapsWith(row: LeaderRow, rows: readonly LeaderRow[]): string[] {
  const set = new Set(row.separated_from);
  return rows.filter((o) => o.arm_id !== row.arm_id && !set.has(o.arm_id)).map(armLabel);
}

export const comparisonSentence = (c: CompareResult): string =>
  `P(${armLabel(c.a)} stronger) = ${Math.round(c.p_a_gt_b * 100)} %`;

export const differenceLabel = (c: CompareResult): string =>
  `${c.diff_mean >= 0 ? '+' : ''}${Math.round(c.diff_mean)} Elo (${Math.round(c.diff_lo)} to ${Math.round(c.diff_hi)}, 95 %)`;
