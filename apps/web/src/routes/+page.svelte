<script lang="ts">
  import { onMount } from 'svelte';
  import type { Leaderboard } from '#lib/api.ts';
  import { getLeaderboard } from '#lib/api.ts';
  import { app, openNewSeries } from '#lib/stores.svelte.ts';
  import { armLabel, notSeparableCopy, overlapLines, overlapPairs } from '#lib/leaderboard-model.ts';
  import CompareBox from '#lib/CompareBox.svelte';
  import LadderAxis from '#lib/LadderAxis.svelte';
  import LeaderboardTable from '#lib/LeaderboardTable.svelte';

  let { data } = $props();
  // svelte-ignore state_referenced_locally
  let board = $state<Leaderboard | null>(data.board as Leaderboard | null);

  onMount(() => {
    const tick = async () => {
      try { board = await getLeaderboard(); } catch { /* keep the last board */ }
    };
    const t = setInterval(() => void tick(), 10_000);
    return () => clearInterval(t);
  });

  const rows = $derived(board?.rows ?? []);
  const reference = $derived(board?.reference ?? []);
  const pairs = $derived(overlapPairs(rows));
  const axis = $derived(rows.map((r) => ({ id: r.arm_id, label: armLabel(r), elo: r.elo })));
  const uncalibrated = $derived(board ? !board.ladder.calibrated : false);
</script>

<div class="head">
  <h1 class="h">Leaderboard</h1>
  {#if app.health?.control}<button class="new" onclick={openNewSeries}>New series</button>{/if}
</div>
<p class="note">Elo on the ChessDecide ladder. Every number carries its 95 % interval; arms are only ranked apart when those intervals do not overlap.</p>

{#if board === null}
  <div class="notice" role="status">The leaderboard is not available: the API did not answer. Showing nothing rather than guessing.</div>
{:else}
  {#if uncalibrated}
    <div class="notice" role="status">Ladder uncalibrated: opponent ratings are nominal until a calibration run finishes.</div>
  {/if}

  <section class="card">
    <h2 class="sub">Where the models sit</h2>
    <LadderAxis series={axis} levels={reference} />
  </section>

  {#if rows.length === 0}
    <div class="empty card">
      <p class="note">No finished series yet. A Quick series is 25 games and costs a few cents.</p>
      {#if app.health?.control}<button class="primary" onclick={openNewSeries}>Start a series</button>{/if}
    </div>
  {:else}
    <section class="card">
      <h2 class="sub">Arms</h2>
      <LeaderboardTable {rows} />
      {#if pairs.length}
        <div class="notsep">
          <p class="notsep-h">{notSeparableCopy(pairs)}</p>
          <ul>{#each overlapLines(pairs) as line}<li class="mono">{line}</li>{/each}</ul>
        </div>
      {/if}
    </section>

    {#if rows.length > 1}
      <section class="card">
        <h2 class="sub">Compare two arms</h2>
        <CompareBox {rows} />
      </section>
    {/if}
  {/if}
{/if}

<style>
  .head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .h { font-size: 18px; margin: 0; }
  .sub { font-size: 12px; letter-spacing: 0.04em; text-transform: uppercase; color: var(--mute); margin: 0 0 8px; }
  .new, .primary { background: var(--panel-2); color: var(--fg); border: 1px solid var(--line); border-radius: var(--radius); padding: 7px 12px; font-size: 14px; }
  .primary { background: var(--accent); color: #0d1620; border-color: var(--accent); font-weight: 700; }
  .notice { background: #3d3418; color: var(--warn); border-radius: var(--radius); padding: 9px 12px; font-size: 13px; }
  .empty { display: flex; flex-direction: column; gap: 10px; align-items: flex-start; }
  .notsep { margin: 12px 0 0; font-size: 12px; color: var(--warn); }
  .notsep-h { margin: 0 0 3px; }
  .notsep ul { margin: 0; padding-left: 14px; display: flex; flex-direction: column; gap: 1px; }
</style>
