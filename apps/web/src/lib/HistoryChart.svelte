<script lang="ts">
  import type { EloPoint } from '@chessdecide/core';

  let { lines, reference = [] }: {
    lines: Array<{ arm: 'clean' | 'hinted'; history: EloPoint[] }>;
    reference?: Array<{ id: string; elo: number }>;
  } = $props();

  const W = 600, H = 220, L = 34, R = 8, T = 8, B = 22;
  const n = $derived(Math.max(1, ...lines.map((l) => l.history.length)));
  // Scale to the settled estimates: the first games have enormous intervals that would flatten the lines.
  // Anything above the axis is clipped by y(), which is the honest picture of "not yet known".
  const ymax = $derived(Math.max(200, Math.ceil((Math.max(0, ...lines.flatMap((l) => l.history.slice(4).map((p) => p.hi))) + 50) / 200) * 200));
  const x = (g: number) => L + ((g - 1) / Math.max(1, n - 1)) * (W - L - R);
  const y = (e: number) => T + (1 - Math.min(Math.max(e, 0), ymax) / ymax) * (H - T - B);
  const path = (h: EloPoint[], f: (p: EloPoint) => number) => h.map((p, i) => `${i ? 'L' : 'M'}${x(p.games).toFixed(1)},${y(f(p)).toFixed(1)}`).join('');
  const band = (h: EloPoint[]) => h.length ? `${path(h, (p) => p.hi)}${[...h].reverse().map((p) => `L${x(p.games).toFixed(1)},${y(p.lo).toFixed(1)}`).join('')}Z` : '';
  const ticks = $derived(Array.from({ length: ymax / 200 + 1 }, (_, i) => i * 200));
</script>

<svg viewBox="0 0 {W} {H}" role="img" aria-label="Elo estimate after each game, for each arm, with its 95 % interval">
  {#each ticks as t}
    <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--line-soft)" />
    <text x={L - 6} y={y(t) + 3} text-anchor="end" class="ax">{t}</text>
  {/each}
  <text x={L} y={H - 6} class="ax">game 1</text>
  <text x={W - R} y={H - 6} text-anchor="end" class="ax">game {n}</text>
  {#each lines as l}
    {#if l.history.length}
      <path d={band(l.history)} fill="var(--{l.arm})" opacity="0.14" />
      <path d={path(l.history, (p) => p.mean)} fill="none" stroke="var(--{l.arm})" stroke-width="2" vector-effect="non-scaling-stroke" />
    {/if}
  {/each}
</svg>

<style>
  svg { display: block; width: 100%; height: auto; background: var(--panel); border-radius: var(--radius); }
  .ax { font: 10px var(--mono); fill: var(--faint); }
</style>
