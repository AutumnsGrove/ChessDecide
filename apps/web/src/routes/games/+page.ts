import { filtersFrom, queryOf } from '#lib/games-model.ts';
import type { BrowseResult, Leaderboard } from '#lib/api.ts';

export const load = async ({ fetch, url }) => {
  const filters = filtersFrom(url.searchParams);
  const [r, lb] = await Promise.all([fetch(`/api/games/browse${queryOf(filters)}`), fetch('/api/leaderboard')]);
  const board = lb.ok ? ((await lb.json()) as Leaderboard) : null;
  return {
    filters,
    result: r.ok ? ((await r.json()) as BrowseResult) : null,
    models: [...new Set((board?.rows ?? []).map((x) => x.model))].sort(),
    reference: board?.reference ?? [],
  };
};
