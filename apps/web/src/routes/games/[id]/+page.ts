import { error } from '@sveltejs/kit';
import type { Game } from '@chessdecide/core';

export const load = async ({ fetch, params }) => {
  const r = await fetch(`/api/games/${params.id}`);
  if (!r.ok) error(r.status, 'Game not found');
  return { game: (await r.json()) as Game };
};
