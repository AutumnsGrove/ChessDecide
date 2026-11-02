import type { CompareResult, Leaderboard } from '#lib/api.ts';

export const load = async ({ fetch, url }) => {
  const r = await fetch('/api/leaderboard');
  const board = r.ok ? (await r.json()) as Leaderboard : null;
  const a = url.searchParams.get('a'), b = url.searchParams.get('b');
  let compare: CompareResult | null = null;
  let error = '';
  if (board && a && b && a !== b) {
    const c = await fetch(`/api/leaderboard/compare?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`);
    if (c.ok) compare = (await c.json()) as CompareResult; else error = 'Those two arms are not both on the board.';
  }
  return { board, a, b, compare, error };
};
