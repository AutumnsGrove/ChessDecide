import { error } from '@sveltejs/kit';
import type { Leaderboard } from '#lib/api.ts';
import type { Series } from '@chessdecide/core';

export const load = async ({ fetch, params }) => {
  const r = await fetch('/api/leaderboard');
  if (!r.ok) error(503, 'The leaderboard is not available.');
  const board = (await r.json()) as Leaderboard;
  const rows = board.rows.filter((x) => x.model === params.slug);
  if (rows.length === 0) error(404, `No rated arm for ${params.slug}.`);
  const series = await Promise.all(rows.map(async (row) => {
    const s = await fetch(`/api/series/${encodeURIComponent(row.series_id)}`);
    return s.ok ? ((await s.json()) as Series) : null;
  }));
  return { board, model: params.slug, rows, series: series.filter((s): s is Series => s !== null) };
};
