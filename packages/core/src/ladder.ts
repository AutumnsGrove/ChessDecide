/** Ladder level recipes and helpers, METRICS.md B2. */
export type LevelKind = 'random' | 'eps' | 'uci';
export interface LadderLevel {
  id: string; kind: LevelKind; label: string;
  elo: number;            // calibrated Elo (nominal until calibrated)
  se?: number; games?: number;
  eps?: number;           // kind 'eps': probability of a random move
  uci_elo?: number;       // kind 'uci' (and the inner engine of 'eps'): UCI_Elo
}
export interface LadderFile {
  version: number; calibrated: boolean; movetime_ms: number; sf_version: string;
  calibrated_at?: string; anchor: { level: string; elo: number }; levels: LadderLevel[];
}

/** Nominal, uncalibrated ladder. Real values come from `ladder calibrate`. */
export const DEFAULT_LADDER: LadderFile = {
  version: 0, calibrated: false, movetime_ms: 50, sf_version: 'unknown',
  anchor: { level: 'uci1320', elo: 1320 },
  levels: [
    { id: 'random', kind: 'random', label: 'Random mover', elo: 250 },
    { id: 'eps75', kind: 'eps', label: 'Stockfish 1320, 75% random', elo: 560, eps: 0.75, uci_elo: 1320 },
    { id: 'eps50', kind: 'eps', label: 'Stockfish 1320, 50% random', elo: 790, eps: 0.5, uci_elo: 1320 },
    { id: 'eps30', kind: 'eps', label: 'Stockfish 1320, 30% random', elo: 980, eps: 0.3, uci_elo: 1320 },
    { id: 'eps15', kind: 'eps', label: 'Stockfish 1320, 15% random', elo: 1150, eps: 0.15, uci_elo: 1320 },
    { id: 'uci1320', kind: 'uci', label: 'Stockfish 1320', elo: 1320, uci_elo: 1320 },
    { id: 'uci1500', kind: 'uci', label: 'Stockfish 1500', elo: 1500, uci_elo: 1500 },
    { id: 'uci1700', kind: 'uci', label: 'Stockfish 1700', elo: 1700, uci_elo: 1700 },
    { id: 'uci1900', kind: 'uci', label: 'Stockfish 1900', elo: 1900, uci_elo: 1900 },
    { id: 'uci2100', kind: 'uci', label: 'Stockfish 2100', elo: 2100, uci_elo: 2100 },
    { id: 'uci2400', kind: 'uci', label: 'Stockfish 2400', elo: 2400, uci_elo: 2400 },
    { id: 'uci2800', kind: 'uci', label: 'Stockfish 2800', elo: 2800, uci_elo: 2800 },
  ],
};

/** The level whose Elo is closest to `target`; ties go to the lower Elo. */
export function nearestLevel(levels: readonly LadderLevel[], target: number): LadderLevel {
  let best = levels[0]!;
  for (const l of levels) {
    const d = Math.abs(l.elo - target), bd = Math.abs(best.elo - target);
    if (d < bd || (d === bd && l.elo < best.elo)) best = l;
  }
  return best;
}
