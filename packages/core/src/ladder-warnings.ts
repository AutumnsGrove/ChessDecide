/** Sanity warnings for a calibrated ladder. Spec: docs/build/tasks/T05 §1.9. Pure. */
import type { LadderLevel } from './ladder.ts';

/**
 * `levels` are the calibrated levels in nominal order; `nominal` maps id → nominal Elo.
 * Warns when two adjacent `uci*` levels moved by more than 100 Elo relative to their nominal gap,
 * and when measured Elo is not strictly increasing in the nominal order.
 */
export function ladderWarnings(levels: readonly LadderLevel[], nominal: Readonly<Record<string, number>>): string[] {
  const out: string[] = [];
  for (let i = 1; i < levels.length; i++) {
    const a = levels[i - 1]!, b = levels[i]!;
    if (b.elo <= a.elo) {
      out.push(`${a.id} (${Math.round(a.elo)}) is not below ${b.id} (${Math.round(b.elo)}) in nominal order`);
    }
  }
  for (let i = 1; i < levels.length; i++) {
    const a = levels[i - 1]!, b = levels[i]!;
    if (a.kind !== 'uci' || b.kind !== 'uci') continue;
    const na = nominal[a.id], nb = nominal[b.id];
    if (na === undefined || nb === undefined) continue;
    const measured = b.elo - a.elo, expected = nb - na;
    const diff = measured - expected;
    if (Math.abs(diff) > 100) {
      out.push(`Gap ${a.id}→${b.id}: measured ${Math.round(measured)} vs nominal ${Math.round(expected)} (${diff > 0 ? '+' : ''}${Math.round(diff)})`);
    }
  }
  return out;
}
