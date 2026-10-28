<script lang="ts">
  import { onMount } from 'svelte';
  import type { EloEstimate, LadderFile, SeriesSummary } from '@chessdecide/core';
  import { app, openNewSeries } from '#lib/stores.svelte.ts';
  import { listSeries } from '#lib/api.ts';
  import { overlap } from '#lib/series-model.ts';
  import LadderAxis from '#lib/LadderAxis.svelte';
  import SeriesCard from '#lib/SeriesCard.svelte';

  let { data } = $props();
  // svelte-ignore state_referenced_locally
  // svelte-ignore state_referenced_locally
  let series = $state<SeriesSummary[]>(data.series as SeriesSummary[]);
  // svelte-ignore state_referenced_locally
  let ladder = $state<LadderFile>(data.ladder as LadderFile);

  onMount(() => {
    const tick = async () => {
      try { series = await listSeries(); } catch { /* keep the last list */ }
    };
    void tick();
    const t = setInterval(() => void tick(), 5000);
    return () => clearInterval(t);
  });

  const rated = $derived(series.filter((s): s is SeriesSummary & { elo: EloEstimate } => s.elo !== null));
  const axis = $derived(rated.map((s) => ({ id: s.id, label: `${s.model.split('/').pop()} · ${s.arm}`, elo: s.elo })));
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

<section class="card">
  <h2 class="sub">Where the models sit</h2>
  <LadderAxis series={axis} levels={ladder.levels} />
</section>

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
  .head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .h { font-size: 18px; margin: 0; }
  .sub { font-size: 12px; letter-spacing: 0.04em; text-transform: uppercase; color: var(--mute); margin: 0 0 6px; }
  .new, .primary { background: var(--panel-2); color: var(--fg); border: 1px solid var(--line); border-radius: var(--radius); padding: 7px 12px; font-size: 14px; }
  .primary { background: var(--accent); color: #0d1620; border-color: var(--accent); font-weight: 700; }
  .notice { background: #3d3418; color: var(--warn); border-radius: var(--radius); padding: 9px 12px; font-size: 13px; }
  .empty { display: flex; flex-direction: column; gap: 10px; align-items: flex-start; }
  .cards { display: flex; flex-direction: column; gap: 8px; }
</style>
