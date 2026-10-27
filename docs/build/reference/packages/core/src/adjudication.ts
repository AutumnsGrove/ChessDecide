/** METRICS.md B1: award the game when |eval| >= 900 cp for 6 consecutive plies (same sign) from ply 30. */
export const ADJ_MIN_PLY = 30;
export const ADJ_CP = 900;
export const ADJ_RUN = 6;

/** `evals` = White-POV cp after each ply so far (index 0 = ply 1). Returns the winner or null. */
export function adjudicate(evals: readonly number[]): 'white' | 'black' | null {
  const ply = evals.length;
  if (ply < ADJ_MIN_PLY || ply < ADJ_RUN) return null;
  const tail = evals.slice(-ADJ_RUN);
  if (tail.every((v) => v >= ADJ_CP)) return 'white';
  if (tail.every((v) => v <= -ADJ_CP)) return 'black';
  return null;
}
