import { redirect } from '@sveltejs/kit';

/** The method summary now lives on the paper page. */
export const load = () => redirect(308, '/paper#method');
