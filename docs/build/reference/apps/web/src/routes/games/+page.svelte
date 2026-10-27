<script lang="ts">
  let { data } = $props();
</script>

<h1 class="h">Games</h1>
{#if data.games.length === 0}
  <p class="note">No games yet. Run one with <code>pnpm cli game</code>.</p>
{:else}
  <ul class="list">
    {#each data.games as g (g.id)}
      <li><a href="/games/{g.id}"><span class="mono">{g.id.slice(-6)}</span> <span>{g.result === '*' ? g.status : g.result}</span> <span class="note">{g.termination}</span></a></li>
    {/each}
  </ul>
{/if}

<style>
  .h { font-size: 18px; margin: 0; }
  .list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
  .list a { display: flex; gap: 12px; align-items: baseline; background: var(--panel); border-radius: var(--radius); padding: 12px 14px; color: var(--fg); }
</style>
