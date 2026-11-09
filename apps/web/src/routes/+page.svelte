<script lang="ts">
  import { onMount } from 'svelte';
  import type { Leaderboard } from '#lib/api.ts';
  import { getLeaderboard } from '#lib/api.ts';
  import { app, openNewSeries } from '#lib/stores.svelte.ts';
  import { hintSummary, modelsOf, signed, tiers as tiersOf } from '#lib/leaderboard-model.ts';
  import BoardTable from '#lib/BoardTable.svelte';
  import Champions from '#lib/Champions.svelte';
  import HintChart from '#lib/HintChart.svelte';
  import TierList from '#lib/TierList.svelte';

  let { data } = $props();
  // svelte-ignore state_referenced_locally
  let board = $state<Leaderboard | null>(data.board as Leaderboard | null);

  const refresh = async () => {
    try { board = await getLeaderboard(); } catch { /* keep the last board */ }
  };

  // The board only moves while a series is running. A settled board is revalidated on focus instead of
  // polled, so an idle visitor costs the server nothing (and the HTTP cache absorbs the rest).
  const live = $derived(board?.rows.some((r) => r.status === 'running') ?? false);
  $effect(() => {
    if (!live) return;
    const t = setInterval(() => void refresh(), 10_000);
    return () => clearInterval(t);
  });
  onMount(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  });

  const rows = $derived(board?.rows ?? []);
  const reference = $derived(board?.reference ?? []);
  const models = $derived(modelsOf(rows));
  const tiers = $derived(tiersOf(rows));
  const hint = $derived(hintSummary(models));
  const uncalibrated = $derived(board ? !board.ladder.calibrated : false);
  // Axis ends on a round number just above the highest interval, so the bars use the width.
  const top = $derived(Math.max(100, Math.ceil(Math.max(0, ...rows.map((r) => r.elo.hi)) / 100) * 100));
  const gamesPer = $derived.by(() => {
    const g = rows.map((r) => r.games);
    if (g.length === 0) return '';
    const lo = Math.min(...g), hi = Math.max(...g);
    return lo === hi ? `${lo}` : `${lo} to ${hi}`;
  });
</script>

<svelte:head><title>ChessDecide: AI models rated at chess</title></svelte:head>

<header class="head">
  <div class="titles">
    <h1>Leaderboard</h1>
    {#if rows.length > 0}
      <p class="lede">
        {models.length} AI decision {models.length === 1 ? 'model' : 'models'}, {rows.length} arms, {gamesPer} games each against a calibrated Stockfish ladder.
        Elo is shown with its 95 % interval; arms whose intervals overlap are grouped, not ranked.
      </p>
    {:else}
      <p class="lede">Elo on the ChessDecide ladder. Every number carries its 95 % interval.</p>
    {/if}
  </div>
  {#if app.health?.control}<button class="new" onclick={openNewSeries}>New series</button>{/if}
</header>

{#if board === null}
  <div class="notice" role="status">The leaderboard is not available: the API did not answer. Showing nothing rather than guessing.</div>
{:else}
  {#if uncalibrated}
    <div class="notice" role="status">Ladder uncalibrated: opponent ratings are nominal until a calibration run finishes.</div>
  {/if}

  {#if rows.length === 0}
    <div class="empty card">
      <p class="note">No finished series yet. A Quick series is 25 games and costs a few cents.</p>
      {#if app.health?.control}<button class="primary" onclick={openNewSeries}>Start a series</button>{/if}
    </div>
  {:else}
    <section aria-labelledby="top-h">
      <h2 id="top-h" class="sr-only">Best arms</h2>
      <Champions {rows} />
      {#if hint}
        <p class="finding">
          Hints raised <b class="mono">{hint.improved} of {hint.models}</b> models, by <b class="mono">{signed(hint.median)}</b> Elo at the median
          (<span class="mono">{signed(hint.min)}</span> to <span class="mono">{signed(hint.max)}</span>).
          The gap is larger than its own 95 % interval for <b class="mono">{hint.clear}</b>.
        </p>
      {/if}
    </section>

    <section aria-labelledby="tiers-h">
      <div class="sechead">
        <h2 id="tiers-h" class="h2">Tiers</h2>
        <p class="note">Each tier starts at the best arm left and holds every arm whose interval overlaps it.</p>
      </div>
      <TierList {tiers} hi={top} />
    </section>

    {#if models.some((m) => m.delta !== null)}
      <section aria-labelledby="hints-h">
        <div class="sechead">
          <h2 id="hints-h" class="h2">Clean vs hinted</h2>
          <p class="note">One row per model, sorted by its best arm.</p>
        </div>
        <HintChart {models} {reference} max={top} />
      </section>
    {/if}

    <section aria-labelledby="all-h">
      <div class="sechead">
        <h2 id="all-h" class="h2">All arms</h2>
        <p class="note">Tick up to six rows to compare them. <a class="dl" href="/api/leaderboard/export.csv" download>Download CSV</a></p>
      </div>
      <BoardTable {rows} />
    </section>
  {/if}
{/if}

<style>
  .head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--s3); }
  .titles { display: grid; gap: var(--s2); max-width: 68ch; }
  h1 { font-size: var(--t-xl); }
  .lede { color: var(--mute); font-size: var(--t-sm); }
  .finding { margin-top: var(--s3); font-size: var(--t-sm); color: var(--mute); max-width: 68ch; }
  .finding b { color: var(--fg); font-weight: 600; }
  .sechead { display: grid; gap: 2px; margin-bottom: var(--s3); }
  .sechead .note { max-width: 68ch; }
  .dl { margin-left: var(--s2); white-space: nowrap; }
  .new, .primary { background: var(--panel-2); color: var(--fg); border: 1px solid var(--line); border-radius: var(--radius); padding: 0 var(--s3); min-height: 40px; font-size: var(--t-sm); }
  .primary { background: var(--accent); color: var(--accent-ink); border-color: var(--accent); font-weight: 700; }
  .notice { background: color-mix(in oklch, var(--warn) 16%, var(--bg)); color: var(--warn); border-radius: var(--radius); padding: var(--s2) var(--s3); font-size: var(--t-sm); }
  .empty { display: flex; flex-direction: column; gap: var(--s3); align-items: flex-start; }
  @media (min-width: 720px) {
    h1 { font-size: var(--t-2xl); }
    .lede { font-size: var(--t-md); }
    .finding { font-size: var(--t-md); }
  }
</style>
