<script lang="ts">
  import { goto } from '$app/navigation';
  import type { LeaderRow } from '#lib/api.ts';
  import { armLabel, comparisonSentence, differenceLabel, eloLabel, modelHref, money, num1, pct0, shortName, tiers as tiersOf } from '#lib/leaderboard-model.ts';

  let { data } = $props();
  const rows = $derived<LeaderRow[]>(data.board?.rows ?? []);
  const byId = $derived(new Map(rows.map((r) => [r.arm_id, r])));
  const A = $derived(data.a ? byId.get(data.a) : undefined);
  const B = $derived(data.b ? byId.get(data.b) : undefined);
  const tierOf = $derived(new Map(tiersOf(rows).flatMap((t) => t.rows.map((r) => [r.arm_id, t.n] as const))));
  const top = $derived(Math.max(100, Math.ceil(Math.max(0, ...rows.map((r) => r.elo.hi)) / 100) * 100));
  const pos = (v: number) => `${(Math.min(Math.max(v, 0), top) / top) * 100}%`;

  // Selection lives in local state so two quick changes (swapping the pair) never read a stale URL.
  // svelte-ignore state_referenced_locally
  let selA = $state(data.a ?? '');
  // svelte-ignore state_referenced_locally
  let selB = $state(data.b ?? '');
  $effect(() => { selA = data.a ?? ''; selB = data.b ?? ''; });

  function pick(which: 'a' | 'b', id: string) {
    if (which === 'a') selA = id; else selB = id;
    void goto(`/compare?a=${encodeURIComponent(selA)}&b=${encodeURIComponent(selB)}`, { replace: true });
  }
  const stats = (r: LeaderRow) => [
    ['Elo ± 95 %', eloLabel(r)], ['Tier', `${tierOf.get(r.arm_id) ?? ''}`], ['Games', `${r.games}`], ['W-D-L', `${r.w}-${r.d}-${r.l}`],
    ['ACPL', num1(r.acpl)], ['Blunders', pct0(r.blunder_rate)], ['$ / game', money(r.cost_per_game)],
  ];
</script>

<svelte:head><title>Compare arms · ChessDecide</title></svelte:head>

<h1>Compare two arms</h1>

{#if data.board === null}
  <div class="notice" role="status">The leaderboard is not available: the API did not answer.</div>
{:else}
  <div class="picks">
    <label>Arm A
      <select value={selA} onchange={(e) => pick('a', e.currentTarget.value)}>
        <option value="" disabled>Choose an arm</option>
        {#each rows as r (r.arm_id)}<option value={r.arm_id}>{armLabel(r)}</option>{/each}
      </select>
    </label>
    <label>Arm B
      <select value={selB} onchange={(e) => pick('b', e.currentTarget.value)}>
        <option value="" disabled>Choose an arm</option>
        {#each rows as r (r.arm_id)}<option value={r.arm_id}>{armLabel(r)}</option>{/each}
      </select>
    </label>
  </div>

  {#if data.error}
    <p class="notice" role="status">{data.error}</p>
  {:else if data.a && data.a === data.b}
    <p class="note">Pick two different arms.</p>
  {:else if data.compare && A && B}
    {@const c = data.compare}
    <section class="verdict" aria-label="Result">
      <p class="sentence">{comparisonSentence(c)}</p>
      <p class="gap mono">{differenceLabel(c)}</p>
      <p class="note">The gap is A minus B, with its own 95 % interval, so it can be judged without reading two rows and subtracting.</p>
    </section>

    <div class="axis" role="img" aria-label="Interval of each arm on the Elo axis">
      {#each [A, B] as r, i}
        <div class="line">
          <span class="who">{i === 0 ? 'A' : 'B'} · {shortName(r.model)} <span class="arm-chip {r.arm}">{r.arm}</span></span>
          <span class="track">
            <i class="iv {r.arm}" style:left={pos(r.elo.lo)} style:width="calc({pos(r.elo.hi)} - {pos(r.elo.lo)})"></i>
            <i class="dot {r.arm}" style:left={pos(r.elo.mean)}></i>
          </span>
        </div>
      {/each}
    </div>

    <div class="cards">
      {#each [A, B] as r}
        <section class="card">
          <h2><a href={modelHref(r.model)}>{shortName(r.model)}</a> <span class="arm-chip {r.arm}">{r.arm}</span></h2>
          <dl>
            {#each stats(r) as [k, v]}<div><dt>{k}</dt><dd class="mono">{v}</dd></div>{/each}
          </dl>
          <p class="links"><a href="/series/{r.series_id}">Series and games</a></p>
        </section>
      {/each}
    </div>
  {:else}
    <p class="note">Choose two arms, or tick two rows on the <a href="/">leaderboard</a>.</p>
  {/if}
{/if}

<style>
  h1 { font-size: var(--t-xl); }
  .picks { display: grid; grid-template-columns: 1fr; gap: var(--s3); }
  @media (min-width: 720px) { .picks { grid-template-columns: 1fr 1fr; } h1 { font-size: var(--t-2xl); } }
  label { display: grid; gap: 4px; font-size: var(--t-xs); color: var(--mute); }
  select { min-height: 44px; background: var(--panel); color: var(--fg); border: 1px solid var(--line); border-radius: var(--radius); padding: 0 var(--s3); font: inherit; font-size: var(--t-md); }
  .verdict { display: grid; gap: var(--s1); }
  .sentence { font-size: var(--t-lg); font-weight: 650; }
  .gap { font-size: var(--t-md); color: var(--hinted); }
  .axis { display: grid; gap: var(--s2); background: var(--panel); border-radius: var(--radius); padding: var(--s3) var(--s4); }
  .line { display: grid; gap: 4px; }
  .who { font-size: var(--t-sm); }
  .track { position: relative; height: 16px; display: block; }
  .track::before { content: ''; position: absolute; left: 0; right: 0; top: 7px; height: 2px; background: var(--line-soft); }
  .iv { position: absolute; top: 6px; height: 4px; border-radius: 2px; opacity: 0.5; }
  .dot { position: absolute; top: 3px; width: 10px; height: 10px; margin-left: -5px; border-radius: 50%; box-sizing: border-box; }
  .iv.clean { background: var(--clean); } .iv.hinted { background: var(--hinted); }
  .dot.clean { border: 2px solid var(--clean); background: var(--panel); } .dot.hinted { background: var(--hinted); }
  .cards { display: grid; grid-template-columns: 1fr; gap: var(--s3); }
  @media (min-width: 720px) { .cards { grid-template-columns: 1fr 1fr; } }
  h2 { font-size: var(--t-lg); display: flex; flex-wrap: wrap; gap: var(--s2); align-items: baseline; margin-bottom: var(--s2); }
  h2 a { color: var(--fg); }
  dl { margin: 0; display: grid; }
  dl div { display: flex; justify-content: space-between; padding: 6px 0; border-top: 1px solid var(--line-soft); font-size: var(--t-sm); }
  dt { color: var(--mute); } dd { margin: 0; }
  .links { margin-top: var(--s3); font-size: var(--t-sm); }
  .notice { background: color-mix(in oklch, var(--warn) 16%, var(--bg)); color: var(--warn); border-radius: var(--radius); padding: var(--s2) var(--s3); font-size: var(--t-sm); }
</style>
