<script lang="ts">
  import { onMount } from 'svelte';
  import type { EloEstimate, LadderFile, SeriesSummary } from '@chessdecide/core';
  import { app, openNewSeries } from '#lib/stores.svelte.ts';
  import { listSeries } from '#lib/api.ts';
  import { overlap } from '#lib/series-model.ts';
  import SeriesCard from '#lib/SeriesCard.svelte';

  let { data } = $props();
  // svelte-ignore state_referenced_locally
  // svelte-ignore state_referenced_locally
  let series = $state<SeriesSummary[]>(data.series as SeriesSummary[]);
  // svelte-ignore state_referenced_locally
  let ladder = $state<LadderFile>(data.ladder as LadderFile);

  const tick = async () => {
    try { series = await listSeries(); } catch { /* keep the last list */ }
  };
  // Poll only while something is running; a settled list is refreshed when the tab regains focus.
  const live = $derived(series.some((s) => s.status === 'running'));
  $effect(() => {
    if (!live) return;
    const t = setInterval(() => void tick(), 5000);
    return () => clearInterval(t);
  });
  onMount(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') void tick(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  });

  const rated = $derived(series.filter((s): s is SeriesSummary & { elo: EloEstimate } => s.elo !== null));
  const overlapping = $derived.by(() => {
    const ids = new Set<string>();
    for (let i = 0; i < rated.length; i++)
      for (let j = i + 1; j < rated.length; j++)
        if (overlap(rated[i]!.elo, rated[j]!.elo)) { ids.add(rated[i]!.id); ids.add(rated[j]!.id); }
    return ids;
  });
</script>

<div class="head">
  <h1 class="h">Series</h1>
  {#if app.health?.control}<button class="new" onclick={openNewSeries}>New series</button>{/if}
</div>

{#if !ladder.calibrated}
  <div class="notice" role="status">Ladder uncalibrated: opponent ratings are nominal until a calibration run finishes.</div>
{/if}

{#if series.length === 0}
  <div class="empty card">
    <p class="note">No series yet. A Quick series is 25 games and costs a few cents.</p>
    {#if app.health?.control}<button class="primary" onclick={openNewSeries}>Start a series</button>{/if}
  </div>
{:else}
  <div class="cards">
    {#each series as s (s.id)}
      <SeriesCard series={s} overlaps={overlapping.has(s.id)} />
    {/each}
  </div>
{/if}

<style>
  .head { display: flex; align-items: center; justify-content: space-between; gap: var(--s3); }
  .h { font-size: var(--t-xl); }
  .new, .primary { background: var(--panel-2); color: var(--fg); border: 1px solid var(--line); border-radius: var(--radius); padding: 0 var(--s3); min-height: 40px; font-size: var(--t-sm); }
  .primary { background: var(--accent); color: var(--accent-ink); border-color: var(--accent); font-weight: 700; }
  .notice { background: color-mix(in oklch, var(--warn) 16%, var(--bg)); color: var(--warn); border-radius: var(--radius); padding: var(--s2) var(--s3); font-size: var(--t-sm); }
  .empty { display: flex; flex-direction: column; gap: var(--s3); align-items: flex-start; }
  .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: var(--s2); }
  @media (min-width: 720px) { .h { font-size: var(--t-2xl); } }
</style>
