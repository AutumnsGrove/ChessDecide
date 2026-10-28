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
  .card { display: flex; flex-direction: column; gap: 6px; background: var(--panel); border-radius: 8px; padding: 12px 14px; color: var(--fg); }
  .card:hover { background: var(--panel-2); }
  .top { display: flex; gap: 8px; justify-content: space-between; align-items: baseline; }
  .name { font-size: 14px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mid, .bottom { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
  .arm { font: 600 11px var(--mono); background: var(--panel-2); border: 1px solid var(--line); border-radius: 4px; padding: 1px 6px; }
  .elo { font-size: 20px; color: var(--fg); }
  .bottom { justify-content: space-between; }
  .chip { font: 600 11px var(--sans); padding: 2px 8px; border-radius: 999px; background: var(--panel-2); color: var(--mute); white-space: nowrap; }
  .chip.good { background: #2b3a26; color: var(--good); }
  .chip.live { background: #24303b; color: var(--accent); }
  .chip.warn { background: #3d3418; color: var(--warn); }
  .chip.bad { background: #44221e; color: var(--bad); }
  .notsep { font-size: 11px; color: var(--warn); }
</style>
