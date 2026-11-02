<script lang="ts">
  import type { LeaderRow } from './api.ts';
  import { eloLabel, modelHref, shortName } from './leaderboard-model.ts';

  let { rows }: { rows: LeaderRow[] } = $props();

  const best = (arm: string) => rows.filter((r) => r.arm === arm).sort((a, b) => b.elo.mean - a.elo.mean)[0];
  const picks = $derived(([['hinted', best('hinted')], ['clean', best('clean')]] as const).filter(([, r]) => r !== undefined) as Array<['hinted' | 'clean', LeaderRow]>);
</script>

{#if picks.length}
  <ul class="champs" aria-label="Best arm in each condition">
    {#each picks as [arm, r] (arm)}
      <li>
        <span class="arm-chip {arm}">Best {arm}</span>
        <a class="name" href={modelHref(r.model)}>{shortName(r.model)}</a>
        <span class="elo mono">{eloLabel(r)}</span>
        <span class="sub mono">{r.games} games · {r.w}-{r.d}-{r.l}</span>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .champs { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: 1fr 1fr; gap: var(--s2); }
  li {
    background: var(--panel); border-radius: var(--radius); padding: var(--s3);
    display: grid; gap: 2px; min-width: 0; align-content: start;
  }
  .name { color: var(--fg); font-weight: 650; font-size: var(--t-md); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 2px; }
  .elo { font-size: var(--t-xl); line-height: 1.15; }
  .sub { font-size: var(--t-xs); color: var(--mute); }
  @media (min-width: 720px) {
    .champs { max-width: 760px; }
    li { padding: var(--s4); }
    .elo { font-size: var(--t-2xl); }
  }
</style>
