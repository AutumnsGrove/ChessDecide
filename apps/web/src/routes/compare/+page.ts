import { armIdsFrom } from '#lib/leaderboard-model.ts';
import type { CompareMany, Leaderboard } from '#lib/api.ts';

export const load = async ({ fetch, url }) => {
  const r = await fetch('/api/leaderboard');
  const board = r.ok ? (await r.json()) as Leaderboard : null;
  const ids = armIdsFrom(url.searchParams);
  let many: CompareMany | null = null;
  let error = '';
  if (board && ids.length >= 2) {
    const c = await fetch(`/api/leaderboard/compare-many?arms=${ids.map(encodeURIComponent).join(',')}`);
    if (c.ok) many = (await c.json()) as CompareMany; else error = 'Some of those arms are not on the board.';
  }
  return { board, ids, many, error };
};
