<script lang="ts">
  import type { EloEstimate } from '@chessdecide/core';
  import { intervalLabel } from './series-model.ts';

  let { series, levels }: {
    series: Array<{ id: string; label: string; elo: EloEstimate }>;
    levels: Array<{ id: string; label: string; elo: number }>;
  } = $props();
</script>

<div class="axis" role="img" aria-label="Series Elo on the ladder axis">
  {#if series.length === 0}
    <p class="note">No rated series yet.</p>
  {:else}
    {#each series as s (s.id)}
      <div class="row">
        <span class="bar" style:left="{(s.elo.lo / 3000) * 100}%" style:width="{((s.elo.hi - s.elo.lo) / 3000) * 100}%"></span>
        <span class="mean" style:left="{(s.elo.mean / 3000) * 100}%"></span>
        <span class="tag" style:left="{(s.elo.mean / 3000) * 100}%">{s.label}</span>
      </div>
    {/each}
  {/if}
  <div class="scale">
    {#each levels as l, i (l.id)}
      <span class="tick" style:left="{(l.elo / 3000) * 100}%" title="{l.label} · {Math.round(l.elo)}"></span>
      {#if i % 2 === 0}<span class="num" style:left="{(l.elo / 3000) * 100}%">{Math.round(l.elo)}</span>{/if}
    {/each}
  </div>
</div>

{#if series.length > 0}
  <ul class="legend">
    {#each series as s (s.id)}
      <li><span class="dot"></span><b>{s.label}</b><span class="mono">{intervalLabel(s.elo)}</span></li>
    {/each}
  </ul>
{/if}

<style>
  .axis { position: relative; padding: 6px 0 22px; }
  .row { position: relative; height: 20px; margin: 2px 0; }
  .bar {
    position: absolute; top: 8px; height: 5px; border-radius: 999px;
    background: color-mix(in srgb, var(--accent) 45%, transparent);
  }
  .mean { position: absolute; top: 5px; width: 2px; height: 11px; background: var(--fg); transform: translateX(-1px); }
  .tag {
    position: absolute; top: -6px; transform: translateX(-50%); font-size: 10px; color: var(--fg);
    white-space: nowrap; max-width: 190px; overflow: hidden; text-overflow: ellipsis;
  }
  .scale { position: absolute; left: 0; right: 0; bottom: 2px; height: 18px; border-top: 1px solid var(--line); }
  .tick { position: absolute; top: -3px; width: 1px; height: 6px; background: var(--line); }
  .num { position: absolute; top: 5px; transform: translateX(-50%); font: 9px var(--mono); color: var(--mute); }
  .legend { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
  .legend li { display: flex; gap: 8px; align-items: baseline; font-size: 12px; color: var(--mute); }
  .legend b { color: var(--fg); font-weight: 500; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); flex: none; }
  .legend .mono { margin-left: auto; color: var(--fg); }
</style>
