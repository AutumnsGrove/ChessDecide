<script lang="ts">
  import type { LeaderReference } from './api.ts';
  import { eloLabel, modelHref, signed, type ModelEntry } from './leaderboard-model.ts';

  let { models, reference = [], max = 1100 }: { models: ModelEntry[]; reference?: LeaderReference[]; max?: number } = $props();

  const x = (v: number) => `${(Math.min(Math.max(v, 0), max) / max) * 100}%`;
  const ticks = $derived(reference.filter((r) => r.elo <= max));
  const span = (lo: number, hi: number) => `calc(${x(hi)} - ${x(lo)})`;
  const read = (m: ModelEntry) =>
    [m.clean && `clean ${eloLabel(m.clean)}`, m.hinted && `hinted ${eloLabel(m.hinted)}`, m.delta !== null && `hints ${signed(m.delta)} Elo`]
      .filter(Boolean).join(', ');
</script>

<div class="chart">
  <div class="axis" aria-hidden="true">
    {#each ticks as t (t.id)}
      <span class="t" style:left={x(t.elo)}>{Math.round(t.elo)}</span>
    {/each}
  </div>
  <ol>
    {#each models as m (m.model)}
      <li>
        <a class="name" href={modelHref(m.model)} aria-label="{m.name}: {read(m)}">{m.name}</a>
        <span class="track" aria-hidden="true">
          {#each ticks as t (t.id)}<i class="grid" style:left={x(t.elo)}></i>{/each}
          {#if m.clean && m.hinted}
            <i class="join" style:left={x(Math.min(m.clean.elo.mean, m.hinted.elo.mean))} style:width={span(Math.min(m.clean.elo.mean, m.hinted.elo.mean), Math.max(m.clean.elo.mean, m.hinted.elo.mean))}></i>
          {/if}
          {#each [m.clean, m.hinted] as r}
            {#if r}
              <i class="iv {r.arm}" style:left={x(r.elo.lo)} style:width={span(r.elo.lo, r.elo.hi)}></i>
              <i class="dot {r.arm}" style:left={x(r.elo.mean)} title="{m.name} {r.arm}: {eloLabel(r)}"></i>
            {/if}
          {/each}
        </span>
        <span class="delta mono" class:neg={m.delta !== null && m.delta < 0}>{m.delta === null ? '' : signed(m.delta)}</span>
      </li>
    {/each}
  </ol>
  <p class="legend note">
    <span class="arm-chip clean">clean</span> <span class="arm-chip hinted">hinted</span>
    Dots are the rating, thin bars the 95 % interval, the number on the right is the change from hints.
    Faint lines are ladder opponents{#if ticks.length > 1}, from a random mover ({Math.round(ticks[0]!.elo)}) to {ticks[ticks.length - 1]!.label} ({Math.round(ticks[ticks.length - 1]!.elo)}){/if}.
  </p>
</div>

<style>
  .chart { --label: 0px; }
  ol { list-style: none; margin: 0; padding: 0; }
  li {
    display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: 'name delta' 'track track';
    column-gap: var(--s3); align-items: baseline; padding: 6px 0 2px; border-top: 1px solid var(--line-soft);
  }
  .name { grid-area: name; color: var(--fg); font-size: var(--t-sm); font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .delta { grid-area: delta; font-size: var(--t-xs); color: var(--hinted); }
  .delta.neg { color: var(--mute); }
  .track { grid-area: track; position: relative; height: 18px; display: block; }
  .axis { position: relative; height: 16px; margin-bottom: 2px; }
  .t { position: absolute; transform: translateX(-50%); font: var(--t-xs)/1 var(--mono); color: var(--faint); }
  .axis .t:first-child { transform: translateX(0); }
  .grid { position: absolute; top: 0; bottom: 0; width: 1px; background: var(--line-soft); }
  .join { position: absolute; top: 8px; height: 2px; background: var(--faint); }
  .iv { position: absolute; top: 7px; height: 4px; border-radius: 2px; opacity: 0.4; }
  .iv.clean { background: var(--clean); } .iv.hinted { background: var(--hinted); }
  .dot { position: absolute; top: 4px; width: 10px; height: 10px; margin-left: -5px; border-radius: 50%; box-sizing: border-box; }
  .dot.clean { border: 2px solid var(--clean); background: var(--bg); }
  .dot.hinted { background: var(--hinted); }
  .legend { margin-top: var(--s3); display: flex; flex-wrap: wrap; gap: 2px var(--s3); align-items: baseline; }
  .legend .arm-chip { color: var(--fg); }

  @media (min-width: 720px) {
    .axis, li { grid-template-columns: 190px minmax(0, 1fr) 56px; }
    li { grid-template-areas: 'name track delta'; align-items: center; padding: 3px 0; }
    .axis { display: grid; }
    .axis .t { position: absolute; }
    .axis { margin-left: calc(190px + var(--s3)); margin-right: calc(56px + var(--s3)); display: block; }
    .delta { text-align: right; font-size: var(--t-sm); }
  }
</style>
