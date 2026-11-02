<script lang="ts">
  import type { LeaderRow } from './api.ts';
  import { eloLabel, modelHref, shortName, type Tier } from './leaderboard-model.ts';

  let { tiers, lo = 0, hi = 1000, open = 5 }: { tiers: Tier[]; lo?: number; hi?: number; open?: number } = $props();

  // How many rows of each tier are shown. Tier 1 starts with a few; the others start closed.
  let shown = $state<Record<number, number>>({});
  const count = (t: Tier) => Math.min(t.rows.length, shown[t.n] ?? (t.n === 1 ? open : 0));
  const pos = (v: number) => `${(Math.min(Math.max(v, lo), hi) - lo) / (hi - lo) * 100}%`;
  const heading = (t: Tier) =>
    t.n === 1
      ? `Statistically tied with the best: ${t.rows.length} of ${tiers.reduce((s, x) => s + x.rows.length, 0)} arms`
      : `${t.rows.length} ${t.rows.length === 1 ? 'arm' : 'arms'}, ${Math.round(t.bottom)} to ${Math.round(t.top)} Elo`;
  const cell = (r: LeaderRow) => shortName(r.model);
</script>

<div class="tiers">
  {#each tiers as t (t.n)}
    <section class="tier" aria-labelledby="tier-{t.n}">
      <header>
        <h3 id="tier-{t.n}"><span class="badge">Tier {t.n}</span> <span class="what">{heading(t)}</span></h3>
      </header>
      {#if count(t) > 0}
        <ul>
          {#each t.rows.slice(0, count(t)) as r (r.arm_id)}
            <li>
              <span class="who"><a href={modelHref(r.model)}>{cell(r)}</a> <span class="arm-chip {r.arm}">{r.arm}</span></span>
              <span class="bar" aria-hidden="true">
                <i class="iv {r.arm}" style:left={pos(r.elo.lo)} style:width="calc({pos(r.elo.hi)} - {pos(r.elo.lo)})"></i>
                <i class="dot {r.arm}" style:left={pos(r.elo.mean)}></i>
              </span>
              <span class="elo mono">{eloLabel(r)}</span>
            </li>
          {/each}
        </ul>
      {/if}
      {#if count(t) < t.rows.length}
        <button type="button" onclick={() => (shown[t.n] = t.rows.length)}>
          {count(t) === 0 ? `Show ${t.rows.length} ${t.rows.length === 1 ? 'arm' : 'arms'}` : `Show all ${t.rows.length}`}
        </button>
      {:else if t.rows.length > (t.n === 1 ? open : 0)}
        <button type="button" onclick={() => (shown[t.n] = t.n === 1 ? open : 0)}>Show fewer</button>
      {/if}
    </section>
  {/each}
</div>

<style>
  .tiers { display: flex; flex-direction: column; gap: var(--s2); }
  .tier { background: var(--panel); border-radius: var(--radius); padding: var(--s3) var(--s4); }
  h3 { font-size: var(--t-sm); font-weight: 500; display: flex; flex-wrap: wrap; gap: 2px var(--s2); align-items: baseline; }
  .badge { font-size: var(--t-xs); font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: var(--fg); }
  .what { color: var(--mute); }
  ul { list-style: none; margin: var(--s2) 0 0; padding: 0; }
  li {
    display: grid; grid-template-columns: minmax(0, 1fr) 96px 84px; gap: var(--s3); align-items: center;
    min-height: 40px; border-top: 1px solid var(--line-soft);
  }
  .who { display: flex; flex-wrap: wrap; gap: 0 var(--s2); align-items: baseline; min-width: 0; font-size: var(--t-md); }
  .who a { color: var(--fg); font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
  .elo { text-align: right; font-size: var(--t-sm); white-space: nowrap; }
  .bar { position: relative; height: 14px; }
  .bar::before { content: ''; position: absolute; left: 0; right: 0; top: 6px; height: 2px; background: var(--line-soft); }
  .iv { position: absolute; top: 5px; height: 4px; border-radius: 2px; opacity: 0.45; }
  .dot { position: absolute; top: 2px; width: 10px; height: 10px; margin-left: -5px; border-radius: 50%; box-sizing: border-box; }
  .iv.clean { background: var(--clean); } .iv.hinted { background: var(--hinted); }
  .dot.clean { border: 2px solid var(--clean); background: var(--panel); }
  .dot.hinted { background: var(--hinted); }
  button {
    margin-top: var(--s2); min-height: 36px; background: none; color: var(--accent); border: 0; padding: 0;
    font-size: var(--t-sm);
  }
  button:hover { text-decoration: underline; text-underline-offset: 3px; }
  @media (min-width: 720px) {
    li { grid-template-columns: 240px minmax(0, 1fr) 110px; gap: var(--s4); }
    .bar { height: 16px; }
    .bar::before { top: 7px; }
    .iv { top: 6px; }
    .dot { top: 3px; }
  }
</style>
