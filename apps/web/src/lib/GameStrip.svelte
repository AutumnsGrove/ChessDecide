<script lang="ts">
  import type { SeriesGame } from '@chessdecide/core';
  import { gameChip } from './series-model.ts';

  let { games }: { games: SeriesGame[] } = $props();
</script>

<div class="strip" aria-label="Games in play order">
  {#each games as g (g.game_id)}
    <a
      href="/games/{g.game_id}"
      class="cell {gameChip(g)}"
      title="Game {g.index + 1} · {g.model_color} vs {g.level_id} · {g.status}{g.termination ? ` · ${g.termination}` : ''}"
    ></a>
  {/each}
</div>

<style>
  .strip { display: flex; flex-wrap: wrap; gap: 4px; }
  .cell { width: 16px; height: 16px; border-radius: 3px; background: var(--panel-2); border: 1px solid var(--line); }
  .cell.won { background: var(--good); border-color: var(--good); }
  .cell.lost { background: var(--bad); border-color: var(--bad); }
  .cell.draw { background: var(--mute); border-color: var(--mute); }
  .cell.running { background: #24303b; border-color: var(--accent); animation: pulse 1.2s ease-in-out infinite; }
  .cell.aborted {
    background: repeating-linear-gradient(45deg, #44221e, #44221e 3px, var(--panel-2) 3px, var(--panel-2) 6px);
    border-color: var(--bad);
  }
  @keyframes pulse { 50% { opacity: 0.45; } }
</style>
