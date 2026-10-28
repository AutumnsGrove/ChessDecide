/** mulberry32: small seeded PRNG. Returns floats in [0, 1). Pinned by tests: do not change. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates shuffle, in place on a copy. */
export function shuffled<T>(items: readonly T[], rng: () => number): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Derive a sub-seed deterministically from a base seed and an integer index. */
export function subSeed(base: number, index: number): number {
  const r = mulberry32((base ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0);
  return Math.floor(r() * 4294967296);
}
