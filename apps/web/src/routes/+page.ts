import type { Leaderboard } from '#lib/api.ts';

export const load = async ({ fetch }) => {
  const r = await fetch('/api/leaderboard');
  const board = r.ok ? (await r.json()) as Leaderboard : null;
  return { board };
};
