<script lang="ts">
  import type { LadderLevel } from '@chessdecide/core';
  import type { Series } from '@chessdecide/core';
  import { eloChartPoints } from './series-model.ts';

  let { series, levels }: { series: Series; levels: LadderLevel[] } = $props();
  const W = 600, H = 220;
  const g = $derived(eloChartPoints(series.elo_history, W, H));
  const currentLevel = $derived(series.blocks.length ? series.blocks[series.blocks.length - 1]!.level_elo : null);
</script>

<svg viewBox="0 0 {W} {H}" role="img" aria-label="Elo over games with the 95 % interval">
  {#each levels as l (l.id)}
    <line x1="0" x2={W} y1={g.y(l.elo)} y2={g.y(l.elo)} stroke="#3a3733" stroke-dasharray="2 4" vector-effect="non-scaling-stroke" />
    <text x="4" y={g.y(l.elo) - 3} font-size="9" fill="#9b978e">{l.id}</text>
  {/each}
  {#if currentLevel !== null}
    <line x1="0" x2={W} y1={g.y(currentLevel)} y2={g.y(currentLevel)} stroke="var(--warn)" stroke-width="1.5" vector-effect="non-scaling-stroke" />
  {/if}
  {#if g.band}
    <polygon points={g.band} fill="color-mix(in srgb, var(--accent) 20%, transparent)" />
    <polyline points={g.line} fill="none" stroke="var(--accent)" stroke-width="2" vector-effect="non-scaling-stroke" />
    {#each g.points as p}
      <circle cx={p.x} cy={p.y} r="2.5" fill="var(--accent)" />
    {/each}
  {/if}
</svg>

<style>
  svg { display: block; width: 100%; height: auto; background: var(--panel-2); border-radius: 6px; }
</style>
