export const load = async ({ fetch }) => ({ games: (await (await fetch('/api/games')).json()) as any[] });
