import { error } from '@sveltejs/kit';
import { DEFAULT_LADDER, type LadderFile, type Series } from '@chessdecide/core';

export const load = async ({ fetch, params }) => {
  const [s, l] = await Promise.all([fetch(`/api/series/${params.id}`), fetch('/api/ladder')]);
  if (!s.ok) error(s.status, 'Series not found');
  return {
    series: (await s.json()) as Series,
    ladder: l.ok ? (await l.json()) as LadderFile : DEFAULT_LADDER,
  };
};
