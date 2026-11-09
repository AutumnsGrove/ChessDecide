<script lang="ts">
  import { goto } from '$app/navigation';
  import type { LeaderRow } from '#lib/api.ts';
  import {
    armLabel, comparisonSentence, compareHref, differenceLabel, eloLabel, MAX_COMPARE, modelHref, money, num1, pairAsCompare, pct0,
    shortName, tiers as tiersOf,
  } from '#lib/leaderboard-model.ts';

  let { data } = $props();
  const rows = $derived<LeaderRow[]>(data.board?.rows ?? []);
  const byId = $derived(new Map(rows.map((r) => [r.arm_id, r])));
  const tierOf = $derived(new Map(tiersOf(rows).flatMap((t) => t.rows.map((r) => [r.arm_id, t.n] as const))));
  const top = $derived(Math.max(100, Math.ceil(Math.max(0, ...rows.map((r) => r.elo.hi)) / 100) * 100));
  const pos = (v: number) => `${(Math.min(Math.max(v, 0), top) / top) * 100}%`;

  // The selection lives in local state, so two quick changes never read a stale URL.
  // svelte-ignore state_referenced_locally
  let sel = $state<string[]>(data.ids);
  $effect(() => { sel = data.ids; });
  const go = () => void goto(sel.length ? compareHref(sel) : '/compare', { replace: true });
  const add = (id: string) => { if (id && !sel.includes(id) && sel.length < MAX_COMPARE) { sel = [...sel, id]; go(); } };
  const remove = (id: string) => { sel = sel.filter((x) => x !== id); go(); };
  const addable = $derived(rows.filter((r) => !sel.includes(r.arm_id)));

  const picked = $derived(data.ids.map((id) => byId.get(id)).filter((r): r is LeaderRow => !!r));
  const pairs = $derived(data.many ? data.many.pairs.map((p) => pairAsCompare(p, data.many!.arms)).filter((c) => c !== null) : []);
  const two = $derived(pairs.length === 1);
  const stats = (r: LeaderRow) => [
    ['Elo ± 95 %', eloLabel(r)], ['Tier', `${tierOf.get(r.arm_id) ?? ''}`], ['Games', `${r.games}`], ['W-D-L', `${r.w}-${r.d}-${r.l}`],
    ['ACPL', num1(r.acpl)], ['Blunders', pct0(r.blunder_rate)], ['$ / game', money(r.cost_per_game)],
  ];
</script>

<svelte:head><title>Compare arms · ChessDecide</title></svelte:head>

<h1>Compare arms</h1>

{#if data.board === null}
  <div class="notice" role="status">The leaderboard is not available: the API did not answer.</div>
{:else}
  <section class="picker" aria-label="Arms being compared">
    {#if sel.length}
      <ul class="chips">
        {#each sel as id (id)}
          {@const r = byId.get(id)}
          <li><span class="chip">{r ? shortName(r.model) : id} {#if r}<span class="arm-chip {r.arm}">{r.arm}</span>{/if}
            <button type="button" onclick={() => remove(id)} aria-label="Remove {r ? armLabel(r) : id}">×</button></span></li>
        {/each}
      </ul>
    {/if}
    <label class="add">
      <span class="lab">{sel.length >= MAX_COMPARE ? `The most is ${MAX_COMPARE} arms: remove one to add another` : sel.length < 2 ? 'Add an arm (choose at least two)' : 'Add an arm'}</span>
      <select value="" disabled={sel.length >= MAX_COMPARE || addable.length === 0} onchange={(e) => { add(e.currentTarget.value); e.currentTarget.value = ''; }}>
        <option value="" disabled>Choose an arm</option>
        {#each addable as r (r.arm_id)}<option value={r.arm_id}>{armLabel(r)}</option>{/each}
      </select>
    </label>
  </section>

  {#if data.error}
    <p class="notice" role="status">{data.error}</p>
  {:else if data.many && picked.length >= 2}
    <section aria-labelledby="h2h-h" class="verdicts">
      <h2 id="h2h-h" class="h2">{two ? 'Result' : 'Head to head'}</h2>
      <ul class="pairs" class:two>
        {#each pairs as c (c.a.arm_id + c.b.arm_id)}
          <li>
            {#if !two}<span class="vs">{armLabel(c.a)} vs {armLabel(c.b)}</span>{/if}
            <p class="sentence">{comparisonSentence(c)}</p>
            <p class="gap mono">{differenceLabel(c)}</p>
          </li>
        {/each}
      </ul>
      <p class="note">Each gap is the first arm minus the second, with its own 95 % interval, so it can be judged without reading two rows and subtracting.</p>
    </section>

    <section class="axis" aria-label="Interval of each arm on the Elo axis">
      {#each picked as r (r.arm_id)}
        <div class="line">
          <span class="who">{shortName(r.model)} <span class="arm-chip {r.arm}">{r.arm}</span></span>
          <span class="track" aria-hidden="true">
            <i class="iv {r.arm}" style:left={pos(r.elo.lo)} style:width="calc({pos(r.elo.hi)} - {pos(r.elo.lo)})"></i>
            <i class="dot {r.arm}" style:left={pos(r.elo.mean)}></i>
          </span>
        </div>
      {/each}
    </section>

    <div class="cards">
      {#each picked as r (r.arm_id)}
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
    <p class="note">Choose two or more arms (up to {MAX_COMPARE}), or tick rows on the <a href="/">leaderboard</a>.</p>
  {/if}
{/if}

<style>
  h1 { font-size: var(--t-xl); }
  .h2 { font-size: var(--t-lg); margin-bottom: var(--s2); }
  @media (min-width: 720px) { h1 { font-size: var(--t-2xl); } }
  .picker { display: grid; gap: var(--s3); }
  .chips { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: var(--s2); }
  .chip { display: inline-flex; align-items: center; gap: var(--s2); background: var(--panel); border: 1px solid var(--line); border-radius: 999px; padding: 0 4px 0 var(--s3); min-height: 40px; font-size: var(--t-sm); font-weight: 600; }
  .chip button { width: 32px; height: 32px; border-radius: 50%; border: 0; background: none; color: var(--mute); font-size: var(--t-lg); line-height: 1; }
  .chip button:hover { background: var(--panel-2); color: var(--fg); }
  .add { display: grid; gap: 4px; max-width: 420px; }
  .lab { font-size: var(--t-xs); color: var(--mute); }
  select { min-height: 44px; background: var(--panel); color: var(--fg); border: 1px solid var(--line); border-radius: var(--radius); padding: 0 var(--s3); font: inherit; font-size: var(--t-md); }
  select:disabled { opacity: 0.55; }

  .verdicts { display: grid; gap: var(--s2); }
  .pairs { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--s2); }
  .pairs li { background: var(--panel); border-radius: var(--radius); padding: var(--s3) var(--s4); display: grid; gap: 2px; }
  .pairs.two li { background: none; padding: 0; }
  .vs { font-size: var(--t-xs); letter-spacing: 0.03em; color: var(--mute); }
  .sentence { font-size: var(--t-md); font-weight: 650; }
  .pairs.two .sentence { font-size: var(--t-lg); }
  .gap { font-size: var(--t-sm); color: var(--hinted); }
  @media (min-width: 900px) { .pairs:not(.two) { grid-template-columns: 1fr 1fr; } }

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
  @media (min-width: 1040px) { .cards { grid-template-columns: repeat(3, 1fr); } }
  .card h2 { font-size: var(--t-lg); display: flex; flex-wrap: wrap; gap: var(--s2); align-items: baseline; margin-bottom: var(--s2); }
  .card h2 a { color: var(--fg); }
  dl { margin: 0; display: grid; }
  dl div { display: flex; justify-content: space-between; padding: 6px 0; border-top: 1px solid var(--line-soft); font-size: var(--t-sm); }
  dt { color: var(--mute); } dd { margin: 0; }
  .links { margin-top: var(--s3); font-size: var(--t-sm); }
  .notice { background: color-mix(in oklch, var(--warn) 16%, var(--bg)); color: var(--warn); border-radius: var(--radius); padding: var(--s2) var(--s3); font-size: var(--t-sm); }
</style>
