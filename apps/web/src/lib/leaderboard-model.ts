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

/** A probability is never printed as exactly 0 or 100 %: the posterior is never that certain. */
export const probLabel = (p: number): string => {
  const v = Math.round(p * 100);
  return v <= 0 ? '< 1 %' : v >= 100 ? '> 99 %' : `${v} %`;
};

export const comparisonSentence = (c: CompareResult): string =>
  `P(${armLabel(c.a)} stronger) = ${probLabel(c.p_a_gt_b)}`;

export const differenceLabel = (c: CompareResult): string =>
  `${c.diff_mean >= 0 ? '+' : ''}${Math.round(c.diff_mean)} Elo (${Math.round(c.diff_lo)} to ${Math.round(c.diff_hi)}, 95 %)`;

// ---- redesign: tiers, models, hint effect. Pure; the page only renders these. ----

/** `mammoth-1` from `baseten/mammoth-1`. */
export const shortName = (model: string): string => model.split('/').pop() ?? model;
/** Provider prefix, used as the "model family" filter: `baseten`. */
export const family = (model: string): string => (model.includes('/') ? model.split('/')[0]! : model);
export const modelHref = (model: string): string => `/models/${model}`;

export interface Tier { n: number; leader: LeaderRow; rows: LeaderRow[]; top: number; bottom: number }

/**
 * Group arms whose 95 % interval overlaps the tier leader's. The leader is the best arm not yet placed,
 * so a tier reads "statistically tied with its best". Rank inside a tier is deliberately not shown.
 */
export function tiers(rows: readonly LeaderRow[]): Tier[] {
  const left = [...rows].sort((a, b) => b.elo.mean - a.elo.mean);
  const out: Tier[] = [];
  while (left.length > 0) {
    const leader = left[0]!;
    const members = left.filter((r) => r.elo.hi >= leader.elo.lo);
    for (const m of members) left.splice(left.indexOf(m), 1);
    out.push({ n: out.length + 1, leader, rows: members, top: members[0]!.elo.mean, bottom: members[members.length - 1]!.elo.mean });
  }
  return out;
}

export interface ModelEntry {
  model: string; name: string; family: string;
  clean: LeaderRow | null; hinted: LeaderRow | null;
  /** hinted minus clean, in Elo, with the half-width of that difference (intervals add in quadrature). */
  delta: number | null; deltaHw: number | null;
  best: number;
}

/** One entry per model, sorted by its best arm. */
export function modelsOf(rows: readonly LeaderRow[]): ModelEntry[] {
  const by = new Map<string, ModelEntry>();
  for (const r of rows) {
    const e = by.get(r.model) ?? { model: r.model, name: shortName(r.model), family: family(r.model), clean: null, hinted: null, delta: null, deltaHw: null, best: 0 };
    if (r.arm === 'clean') e.clean = r; else if (r.arm === 'hinted') e.hinted = r;
    by.set(r.model, e);
  }
  const list = [...by.values()];
  for (const e of list) {
    if (e.clean && e.hinted) {
      e.delta = e.hinted.elo.mean - e.clean.elo.mean;
      e.deltaHw = Math.hypot(e.hinted.elo.half_width, e.clean.elo.half_width);
    }
    e.best = Math.max(e.clean?.elo.mean ?? -Infinity, e.hinted?.elo.mean ?? -Infinity);
  }
  return list.sort((a, b) => b.best - a.best);
}

export interface HintSummary { models: number; improved: number; clear: number; median: number; min: number; max: number }

/** How much hints change the rating, over models that have both arms. `clear` = gap larger than its own 95 % band. */
export function hintSummary(models: readonly ModelEntry[]): HintSummary | null {
  const both = models.filter((m) => m.delta !== null);
  if (both.length === 0) return null;
  const d = both.map((m) => m.delta!).sort((a, b) => a - b);
  const mid = d.length >> 1;
  return {
    models: both.length,
    improved: both.filter((m) => m.delta! > 0).length,
    clear: both.filter((m) => m.delta! > m.deltaHw!).length,
    median: d.length % 2 ? d[mid]! : (d[mid - 1]! + d[mid]!) / 2,
    min: d[0]!, max: d[d.length - 1]!,
  };
}

export const signed = (v: number): string => `${v >= 0 ? '+' : '−'}${Math.abs(Math.round(v))}`;
export const eloLabel = (r: Pick<LeaderRow, 'elo'>): string => `${Math.round(r.elo.mean)} ± ${Math.round(r.elo.half_width)}`;
