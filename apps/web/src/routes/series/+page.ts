import { DEFAULT_LADDER, type LadderFile, type SeriesSummary } from '@chessdecide/core';

export const load = async ({ fetch }) => {
  const [s, l] = await Promise.all([fetch('/api/series'), fetch('/api/ladder')]);
  const ladder = l.ok ? (await l.json()) as LadderFile : DEFAULT_LADDER;
  return { series: (await s.json()) as SeriesSummary[], ladder };
};
