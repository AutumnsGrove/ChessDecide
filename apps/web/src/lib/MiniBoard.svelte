<script lang="ts">
  import { onMount } from 'svelte';
  import { START_FEN, type Game, type Ply } from '@chessdecide/core';
  import { getGame } from './api.ts';
  import { board } from './chessground.ts';

  let { gameId, base }: { gameId: string; base: string } = $props();
  let fen = $state(START_FEN);
  let plies = $state(0);

  onMount(() => {
    let es: EventSource | undefined;
    let closed = false;
    (async () => {
      try {
        const g = await getGame(gameId);
        if (closed) return;
        fen = g.plies.at(-1)?.fen_after ?? g.start_fen;
        plies = g.plies.length;
        es = new EventSource(`/api/games/${gameId}/events`);
        es.addEventListener('snapshot', (e) => {
          const s = JSON.parse((e as MessageEvent).data) as Game;
          fen = s.plies.at(-1)?.fen_after ?? s.start_fen;
          plies = s.plies.length;
        });
        es.addEventListener('ply', (e) => {
          const p = JSON.parse((e as MessageEvent).data) as Ply;
          fen = p.fen_after;
          plies = p.ply;
        });
        es.addEventListener('status', (e) => {
          const d = JSON.parse((e as MessageEvent).data) as { status: string };
          if (d.status === 'finished' || d.status === 'aborted') es?.close();
        });
      } catch { /* keep the empty board */ }
    })();
    return () => { closed = true; es?.close(); };
  });
</script>

<a class="mini" href="/games/{gameId}" title="{base} · tap to open the viewer">
  <div class="b"><div use:board={{ fen }}></div></div>
  <span>{base} · ply {plies}</span>
</a>

<style>
  .mini { display: flex; flex-direction: column; gap: 3px; color: var(--mute); font-size: 11px; min-width: 0; }
  .b { width: 100%; aspect-ratio: 1; border-radius: 4px; overflow: hidden; }
  .b > div { width: 100%; height: 100%; }
  .mini span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>
