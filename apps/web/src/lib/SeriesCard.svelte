<script lang="ts">
  import type { SeriesSummary } from '@chessdecide/core';
  import { intervalLabel, targetGames } from './series-model.ts';

  let { series, overlaps }: { series: SeriesSummary; overlaps: boolean } = $props();
  const target = $derived(targetGames(series.size));
  const statusClass = $derived(
    series.status === 'finished' ? 'good'
      : series.status === 'running' ? 'live'
      : series.status === 'paused' || series.status === 'stopped_budget' ? 'warn'
      : series.status === 'aborted' || series.status === 'stopped_error' ? 'bad' : 'mute',
  );
</script>

<a class="card" href="/series/{series.id}">
  <div class="top">
    <b class="name">{series.name}</b>
    <span class="chip {statusClass}">{series.status.replace('_', ' ')}</span>
  </div>
  <div class="mid">
    <span class="arm">{series.arm}</span>
    <span class="note">{series.games_done} / {target ?? '~' + (series.size.preset === 'completion' ? series.size.max_games ?? 200 : 200)} games</span>
    {#if overlaps}<span class="notsep">not separable yet</span>{/if}
  </div>
  <div class="bottom">
    <span class="elo mono">{intervalLabel(series.elo)}</span>
    <span class="note mono">${(series.cost_usd ?? 0).toFixed(4)}</span>
  </div>
</a>

<style>
  .card { display: flex; flex-direction: column; gap: 6px; background: var(--panel); border-radius: var(--radius); padding: var(--s3) var(--s4); color: var(--fg); }
  .card:hover { background: var(--panel-2); }
  .top { display: flex; gap: 8px; justify-content: space-between; align-items: baseline; }
  .name { font-size: var(--t-sm); font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mid, .bottom { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
  .arm { font: 600 var(--t-xs) var(--mono); background: var(--panel-2); border: 1px solid var(--line); border-radius: 4px; padding: 1px 6px; }
  .elo { font-size: var(--t-lg); color: var(--fg); }
  .bottom { justify-content: space-between; }
  .chip { font: 600 var(--t-xs) var(--sans); padding: 2px 8px; border-radius: 999px; background: var(--panel-2); color: var(--mute); white-space: nowrap; }
  .chip.good { background: color-mix(in oklch, var(--good) 18%, var(--panel)); color: var(--good); }
  .chip.live { background: color-mix(in oklch, var(--accent) 18%, var(--panel)); color: var(--accent); }
  .chip.warn { background: color-mix(in oklch, var(--warn) 18%, var(--panel)); color: var(--warn); }
  .chip.bad { background: color-mix(in oklch, var(--bad) 18%, var(--panel)); color: var(--bad); }
  .notsep { font-size: var(--t-xs); color: var(--warn); }
</style>
