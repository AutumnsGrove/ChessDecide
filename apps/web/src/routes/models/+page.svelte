<script lang="ts">
  import { eloLabel, modelHref, modelsOf, money, signed } from '#lib/leaderboard-model.ts';

  let { data } = $props();
  const models = $derived(modelsOf(data.board?.rows ?? []));
  let q = $state('');
  const shown = $derived(models.filter((m) => m.model.toLowerCase().includes(q.trim().toLowerCase())));
</script>

<svelte:head><title>Models · ChessDecide</title></svelte:head>

<header class="head">
  <h1>Models</h1>
  <p class="note">Each model, with both arms side by side. Open one for its series, games and downloads.</p>
</header>

{#if data.board === null}
  <p class="note" role="status">The leaderboard is not available: the API did not answer.</p>
{:else}
  <label class="search"><span class="sr-only">Search models</span>
    <input type="search" placeholder="Search models" bind:value={q} />
  </label>
  <table>
    <caption class="sr-only">Models with clean and hinted ratings</caption>
    <thead><tr>
      <th scope="col">Model</th><th scope="col" class="num">Clean</th><th scope="col" class="num">Hinted</th>
      <th scope="col" class="num">Hints</th><th scope="col" class="num">$ / game</th>
    </tr></thead>
    <tbody>
      {#each shown as m (m.model)}
        <tr>
          <th scope="row"><a href={modelHref(m.model)}>{m.name}</a> <span class="fam">{m.family}</span></th>
          <td class="num mono" data-label="Clean">{m.clean ? eloLabel(m.clean) : 'none'}</td>
          <td class="num mono" data-label="Hinted">{m.hinted ? eloLabel(m.hinted) : 'none'}</td>
          <td class="num mono gain" data-label="Hints">{m.delta === null ? '' : signed(m.delta)}</td>
          <td class="num mono" data-label="$ / game">{m.hinted ? money(m.hinted.cost_per_game) : m.clean ? money(m.clean.cost_per_game) : ''}</td>
        </tr>
      {:else}
        <tr><td colspan="5" class="note">No models match.</td></tr>
      {/each}
    </tbody>
  </table>
{/if}

<style>
  .head { display: grid; gap: var(--s1); }
  h1 { font-size: var(--t-xl); }
  .search input { min-height: 40px; width: 100%; max-width: 360px; background: var(--panel); color: var(--fg); border: 1px solid var(--line); border-radius: var(--radius); padding: 0 var(--s3); font: inherit; font-size: var(--t-sm); }
  table { width: 100%; border-collapse: collapse; font-size: var(--t-sm); }
  th, td { text-align: left; padding: 0 var(--s2); height: 44px; font-weight: 400; }
  thead th { height: auto; padding-bottom: var(--s2); font-size: var(--t-xs); letter-spacing: 0.04em; text-transform: uppercase; color: var(--mute); border-bottom: 1px solid var(--line); font-weight: 600; }
  tbody tr { border-bottom: 1px solid var(--line-soft); }
  tbody tr:hover { background: color-mix(in oklch, var(--panel) 70%, transparent); }
  tbody th a { color: var(--fg); font-weight: 600; font-size: var(--t-md); }
  .fam { color: var(--faint); font-size: var(--t-xs); margin-left: var(--s2); }
  .num { text-align: right; white-space: nowrap; }
  .gain { color: var(--hinted); }
  @media (min-width: 720px) { h1 { font-size: var(--t-2xl); } }
  @media (max-width: 719px) {
    thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
    table, tbody { display: block; }
    tbody tr { display: grid; grid-template-columns: 1fr 1fr; padding: var(--s2) 0; }
    tbody th { grid-column: 1 / -1; height: 32px; padding: 0; }
    td { height: auto; padding: 2px 0; text-align: left; }
    td[data-label]::before { content: attr(data-label) ' '; color: var(--faint); font-family: var(--sans); font-size: var(--t-xs); display: block; }
  }
</style>
