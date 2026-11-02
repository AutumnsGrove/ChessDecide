<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { app, openNewGame } from '#lib/stores.svelte.ts';
  import GameRow from '#lib/GameRow.svelte';
  import { EMPTY_FILTERS, isFiltered, OUTCOMES, pageRange, queryOf, SORTS, type GameFilters } from '#lib/games-model.ts';
  import { shortName } from '#lib/leaderboard-model.ts';

  let { data } = $props();
  const f = $derived<GameFilters>(data.filters);
  // Phones start with the filters folded away so the first game is on screen; desktop shows them.
  // svelte-ignore state_referenced_locally
  let open = $state(typeof matchMedia !== 'undefined' && matchMedia('(min-width: 900px)').matches);
  const active = $derived([f.model, f.arm, f.level, f.outcome].filter(Boolean).length + (f.sort !== 'notable' ? 1 : 0));
  const res = $derived(data.result);
  const range = $derived(res ? pageRange(res.total, res.page, res.per) : { from: 0, to: 0, pages: 1 });
  const filtered = $derived(isFiltered(f));
  const decided = $derived(res ? res.tally.w + res.tally.d + res.tally.l : 0);
  const score = $derived(res && decided ? (res.tally.w + 0.5 * res.tally.d) / decided : 0);

  const href = (patch: Partial<GameFilters>, keepPage = false) => `/games${queryOf({ ...f, page: keepPage ? f.page : 1, ...patch })}`;
  const go = (patch: Partial<GameFilters>) => void goto(href(patch));
  const pick = (e: Event, key: keyof GameFilters) => go({ [key]: (e.currentTarget as HTMLSelectElement).value } as Partial<GameFilters>);

  // Only a running game changes the list; a settled list is not polled.
  const live = $derived(res?.items.some((g) => g.status === 'running') ?? false);
  $effect(() => {
    if (!live) return;
    const t = setInterval(() => void invalidateAll(), 5000);
    return () => clearInterval(t);
  });
</script>

<svelte:head><title>Games · ChessDecide</title></svelte:head>

<header>
  <div class="titles">
    <h1>Games</h1>
    <p class="lede">
      {#if res}
        {#if filtered}<b class="mono">{res.total.toLocaleString()}</b> {res.total === 1 ? 'game matches' : 'games match'}.{:else}<b class="mono">{res.total.toLocaleString()}</b> games played by AI models against a Stockfish ladder.{/if}
        Open any game to replay it move by move, with the model's probabilities and Stockfish's judgement for each move.
      {:else}Every game replays move by move.{/if}
    </p>
  </div>
</header>

{#if res === null}
  <div class="notice" role="status">The games list is not available: the API did not answer.</div>
{:else}
  <details class="fbox" bind:open>
    <summary>Filters{#if active} <span class="count">{active}</span>{/if} <span class="note">{SORTS[f.sort]}</span></summary>
  <form class="filters" role="search" aria-label="Filter games" onsubmit={(e) => e.preventDefault()}>
    {#if data.models.length}
      <label class="field"><span class="lab">Model</span>
        <select value={f.model} onchange={(e) => pick(e, 'model')}>
          <option value="">All models</option>
          {#each data.models as m}<option value={m}>{shortName(m)} ({m.split('/')[0]})</option>{/each}
        </select>
      </label>
    {/if}
    <div class="field"><span class="lab" id="arm-l">Arm</span>
      <div class="seg" role="group" aria-labelledby="arm-l">
        {#each [['', 'All'], ['clean', 'Clean'], ['hinted', 'Hinted']] as [v, l]}
          <a href={href({ arm: v })} aria-current={f.arm === v ? 'true' : undefined} class:on={f.arm === v}>{l}</a>
        {/each}
      </div>
    </div>
    {#if data.reference.length}
      <label class="field"><span class="lab">Opponent</span>
        <select value={f.level} onchange={(e) => pick(e, 'level')}>
          <option value="">Any opponent</option>
          {#each data.reference as l (l.id)}<option value={l.id}>{l.label} ({Math.round(l.elo)})</option>{/each}
        </select>
      </label>
    {/if}
    <div class="field"><span class="lab" id="res-l">Result</span>
      <div class="seg" role="group" aria-labelledby="res-l">
        <a href={href({ outcome: '' })} aria-current={f.outcome === '' ? 'true' : undefined} class:on={f.outcome === ''}>All</a>
        {#each OUTCOMES as o}
          <a href={href({ outcome: o })} aria-current={f.outcome === o ? 'true' : undefined} class:on={f.outcome === o}>{o[0]!.toUpperCase() + o.slice(1)}</a>
        {/each}
      </div>
    </div>
    <label class="field"><span class="lab">Sort</span>
      <select value={f.sort} onchange={(e) => pick(e, 'sort')}>
        {#each Object.entries(SORTS) as [k, l]}<option value={k}>{l}</option>{/each}
      </select>
    </label>
  </form>
  </details>

  {#if filtered || decided > 0}
    <section class="tally" aria-label="The model's record in these games">
      {#if decided > 0}
        <div class="bar" role="img" aria-label="{res.tally.w} won, {res.tally.d} drawn, {res.tally.l} lost">
          <i class="w" style:flex={res.tally.w}></i><i class="d" style:flex={res.tally.d}></i><i class="l" style:flex={res.tally.l}></i>
        </div>
        <p class="note mono">
          <span class="k w">{res.tally.w} won</span> <span class="k d">{res.tally.d} drawn</span> <span class="k l">{res.tally.l} lost</span>
          · score {Math.round(score * 100)} %
        </p>
      {/if}
      {#if filtered}<a class="clear" href="/games">Clear filters</a>{/if}
    </section>
  {/if}

  {#if res.items.length === 0}
    <div class="empty card">
      <p class="note">{filtered ? 'No games match these filters.' : 'No games yet.'}</p>
      {#if filtered}<a href="/games">Clear filters</a>{:else if app.health?.control}<button class="primary" onclick={openNewGame}>Start a game</button>{/if}
    </div>
  {:else}
    <ul class="list">
      {#each res.items as g (g.id)}<li><GameRow {g} reference={data.reference} /></li>{/each}
    </ul>
    <nav class="pager" aria-label="Pages">
      {#if res.page > 1}<a rel="prev" href={href({ page: res.page - 1 }, true)}>Previous</a>{:else}<span class="off">Previous</span>{/if}
      <span class="note mono">{range.from.toLocaleString()} to {range.to.toLocaleString()} of {res.total.toLocaleString()} · page {res.page} of {range.pages.toLocaleString()}</span>
      {#if res.page < range.pages}<a rel="next" href={href({ page: res.page + 1 }, true)}>Next</a>{:else}<span class="off">Next</span>{/if}
    </nav>
  {/if}
{/if}

<style>
  .titles { display: grid; gap: var(--s2); max-width: 68ch; }
  h1 { font-size: var(--t-xl); }
  .lede { color: var(--mute); font-size: var(--t-sm); }
  .lede b { color: var(--fg); font-weight: 600; }
  .primary { background: var(--accent); color: var(--accent-ink); border: 1px solid var(--accent); border-radius: var(--radius); padding: 0 var(--s3); min-height: 40px; font-size: var(--t-sm); font-weight: 700; }
  .notice { background: color-mix(in oklch, var(--warn) 16%, var(--bg)); color: var(--warn); border-radius: var(--radius); padding: var(--s2) var(--s3); font-size: var(--t-sm); }

  .fbox summary { display: flex; align-items: center; gap: var(--s2); min-height: 44px; padding: 0 var(--s3); background: var(--panel); border-radius: var(--radius); cursor: pointer; font-size: var(--t-sm); list-style: none; }
  .fbox summary::-webkit-details-marker { display: none; }
  .fbox summary::after { content: '+'; margin-left: auto; color: var(--mute); font-size: var(--t-lg); }
  .fbox[open] summary::after { content: '\2212'; }
  .fbox summary .note { margin-left: var(--s2); }
  .count { background: var(--accent); color: var(--accent-ink); font: 700 var(--t-xs) var(--sans); border-radius: 999px; padding: 1px 8px; }
  .fbox .filters { margin-top: var(--s3); }
  .filters { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s3); }
  .field { display: grid; gap: 4px; min-width: 0; align-content: start; }
  .lab { font-size: var(--t-xs); color: var(--mute); }
  select { min-height: 40px; width: 100%; background: var(--panel); color: var(--fg); border: 1px solid var(--line); border-radius: var(--radius); padding: 0 var(--s3); font: inherit; font-size: var(--t-sm); }
  .seg { display: flex; background: var(--panel); border-radius: var(--radius); padding: 2px; }
  .seg a { flex: 1; min-height: 36px; display: inline-flex; align-items: center; justify-content: center; padding: 0 var(--s2); font-size: var(--t-sm); color: var(--mute); border-radius: 4px; }
  .seg a:hover { text-decoration: none; color: var(--fg); }
  .seg a.on { background: var(--panel-2); color: var(--fg); }
  @media (min-width: 900px) { .fbox summary { display: none; } .filters { grid-template-columns: repeat(5, auto); align-items: end; } .field:has(select) { min-width: 180px; } }

  .tally { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s2) var(--s4); }
  .bar { display: flex; width: min(100%, 320px); height: 8px; border-radius: 4px; overflow: hidden; background: var(--panel-2); gap: 2px; }
  .bar i { display: block; min-width: 0; }
  .bar .w { background: var(--good); } .bar .d { background: var(--faint); } .bar .l { background: var(--bad); }
  .k.w { color: var(--good); } .k.d { color: var(--mute); } .k.l { color: var(--bad); }
  .clear { font-size: var(--t-sm); margin-left: auto; }

  .list { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: 1fr; gap: var(--s2); }
  @media (min-width: 720px) { .list { grid-template-columns: 1fr 1fr; } h1 { font-size: var(--t-2xl); } .lede { font-size: var(--t-md); } }
  @media (min-width: 1040px) { .list { grid-template-columns: repeat(3, 1fr); } }
  .empty { display: flex; flex-direction: column; gap: var(--s3); align-items: flex-start; }

  .pager { display: flex; justify-content: space-between; align-items: center; gap: var(--s3); flex-wrap: wrap; padding-top: var(--s2); }
  .pager a, .pager .off { min-height: 40px; display: inline-flex; align-items: center; padding: 0 var(--s4); border: 1px solid var(--line); border-radius: var(--radius); font-size: var(--t-sm); }
  .pager .off { color: var(--faint); border-color: var(--line-soft); }
  .pager .note { order: 3; flex: 1 1 100%; text-align: center; }
  @media (min-width: 720px) { .pager .note { order: 0; flex: 1; } }
</style>
