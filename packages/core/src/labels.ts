/** Human labels for player descriptions. Shared by the Viewer, PGN tags and CSV exports. */
import type { PlayerDesc } from './types.ts';

export function playerLabel(p: PlayerDesc): string {
  if (p.type === 'model') return p.model;
  if (p.type === 'ladder') return p.level === 'random' ? 'Random mover' : `Ladder ${p.level}`;
  return `Stockfish ${p.elo}`;
}
