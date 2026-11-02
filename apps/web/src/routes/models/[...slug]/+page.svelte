<script lang="ts">
  import type { LeaderRow } from '#lib/api.ts';
  import type { SeriesGame } from '@chessdecide/core';
  import { eloLabel, family, modelsOf, money, num1, pct0, shortName, signed, tiers as tiersOf } from '#lib/leaderboard-model.ts';
  import HistoryChart from '#lib/HistoryChart.svelte';

  let { data } = $props();
  const entry = $derived(modelsOf(data.rows)[0]!);
  const arms = $derived(([entry.clean, entry.hinted].filter(Boolean)) as LeaderRow[]);
  const tierOf = $derived(new Map(tiersOf(data.board.rows).flatMap((t) => t.rows.map((r) => [r.arm_id, t.n] as const))));
  const seriesOf = (r: LeaderRow) => data.series.find((s) => s.id === r.series_id);
  const lines = $derived(arms.map((r) => ({ arm: r.arm as 'clean' | 'hinted', history: seriesOf(r)?.elo_history ?? [] })));
  const compareHref = $derived(entry.clean && entry.hinted ? `/compare?a=${encodeURIComponent(entry.clean.arm_id)}&b=${encodeURIComponent(entry.hinted.arm_id)}` : '');
  let more = $state<Record<string, boolean>>({});
  const glyph = (g: SeriesGame) => (g.model_score === 1 ? 'Win' : g.model_score === 0.5 ? 'Draw' : g.model_score === 0 ? 'Loss' : '');
  const stats = (r: LeaderRow) => [
    ['Elo ± 95 %', eloLabel(r)], ['Tier', `${tierOf.get(r.arm_id) ?? ''}`], ['Games', `${r.games}`], ['W-D-L', `${r.w}-${r.d}-${r.l}`],
    ['Score', pct0(r.score_pct)], ['ACPL', num1(r.acpl)], ['Acceptable moves', pct0(r.acceptable_rate)], ['Blunders', pct0(r.blunder_rate)],
    ['$ / game', money(r.cost_per_game)], ['Series cost', money(r.cost_usd)],
  ];
</script>

<svelte:head><title>{shortName(data.model)} · ChessDecide</title></svelte:head>

<nav class="crumb" aria-label="Breadcrumb"><a href="/models">Models</a> <span aria-hidden="true">/</span> <span>{family(data.model)}</span></nav>
<header class="head">
  <h1>{shortName(data.model)}</h1>
  {#if entry.delta !== null}
    <p class="lede">Hints change its rating by <b class="mono">{signed(entry.delta)}</b> Elo (± <span class="mono">{Math.round(entry.deltaHw ?? 0)}</span>, 95 %).
      {#if compareHref}<a href={compareHref}>Compare the two arms</a>{/if}</p>
  {:else}
    <p class="lede">Only one arm is rated for this model, so there is no hint comparison.</p>
  {/if}
</header>

<div class="arms">
  {#each arms as r (r.arm_id)}
    {@const s = seriesOf(r)}
    <section class="card" aria-labelledby="h-{r.arm}">
      <h2 id="h-{r.arm}"><span class="arm-chip {r.arm}">{r.arm}</span></h2>
      <dl>
        {#each stats(r) as [k, v]}<div><dt>{k}</dt><dd class="mono">{v}</dd></div>{/each}
      </dl>
      <p class="links">
        <a href="/series/{r.series_id}">Series page</a>
        <a href="/api/series/{r.series_id}/export.csv" download>CSV</a>
        <a href="/api/series/{r.series_id}/export.json" download>JSON</a>
      </p>
    </section>
  {/each}
</div>

{#if lines.some((l) => l.history.length > 1)}
  <section aria-labelledby="hist-h">
    <h2 id="hist-h" class="h2">Rating after each game</h2>
    <p class="note">Line is the estimate, shaded band its 95 % interval. It settles as games accumulate.</p>
    <HistoryChart {lines} />
    <p class="legend note">{#each arms as r}<span class="arm-chip {r.arm}">{r.arm}</span>{/each}</p>
  </section>
{/if}

{#each arms as r (r.arm_id)}
  {@const s = seriesOf(r)}
  {#if s}
    <section aria-labelledby="g-{r.arm}">
      <h2 id="g-{r.arm}" class="h2">Games, <span class="arm-chip {r.arm}">{r.arm}</span></h2>
      <table>
        <caption class="sr-only">Games played by the {r.arm} arm</caption>
        <thead><tr><th scope="col">#</th><th scope="col">Result</th><th scope="col" class="num">Opponent</th><th scope="col" class="opt">Colour</th><th scope="col" class="num opt">Plies</th><th scope="col" class="num">ACPL</th><th scope="col"><span class="sr-only">Replay</span></th></tr></thead>
        <tbody>
          {#each (more[r.arm] ? s.games : s.games.slice(0, 10)) as g (g.game_id)}
            <tr>
              <td class="mono">{g.index + 1}</td>
              <td>{glyph(g)}{#if g.adjudicated}<span class="adj" title="Ended by adjudication">adj</span>{/if}</td>
              <td class="num mono">{Math.round(g.level_elo)}</td>
              <td class="opt">{g.model_color}</td>
              <td class="num mono opt">{g.plies}</td>
              <td class="num mono">{g.acpl_model === undefined ? 'none' : Math.round(g.acpl_model)}</td>
              <td><a href="/games/{g.game_id}">Replay</a></td>
            </tr>
          {/each}
        </tbody>
      </table>
      {#if !more[r.arm] && s.games.length > 10}
        <button type="button" onclick={() => (more[r.arm] = true)}>Show all {s.games.length} games</button>
      {/if}
    </section>
  {/if}
{/each}

<style>
  .crumb { font-size: var(--t-xs); color: var(--mute); display: flex; gap: var(--s2); }
  .head { display: grid; gap: var(--s1); }
  h1 { font-size: var(--t-xl); }
  .lede { color: var(--mute); font-size: var(--t-sm); } .lede b { color: var(--hinted); font-weight: 600; }
  .arms { display: grid; grid-template-columns: 1fr; gap: var(--s3); }
  h2 { font-size: var(--t-md); }
  .card h2 { margin-bottom: var(--s2); }
  dl { margin: 0; display: grid; }
  dl div { display: flex; justify-content: space-between; padding: 6px 0; border-top: 1px solid var(--line-soft); font-size: var(--t-sm); }
  dt { color: var(--mute); } dd { margin: 0; }
  .links { margin-top: var(--s3); display: flex; gap: var(--s4); font-size: var(--t-sm); }
  section > .note { margin: 2px 0 var(--s3); max-width: 68ch; }
  .legend { display: flex; gap: var(--s4); margin-top: var(--s2); }
  table { width: 100%; border-collapse: collapse; font-size: var(--t-sm); margin-top: var(--s2); }
  th, td { text-align: left; padding: 0 var(--s2); height: 38px; font-weight: 400; }
  thead th { height: auto; padding-bottom: 6px; font-size: var(--t-xs); text-transform: uppercase; letter-spacing: 0.04em; color: var(--mute); border-bottom: 1px solid var(--line); font-weight: 600; }
  tbody tr { border-bottom: 1px solid var(--line-soft); }
  .num { text-align: right; } .adj { font-size: var(--t-xs); color: var(--faint); margin-left: var(--s2); }
  @media (max-width: 719px) { .opt { display: none; } }
  button { margin-top: var(--s3); min-height: 40px; background: none; border: 1px solid var(--line); color: var(--accent); border-radius: var(--radius); padding: 0 var(--s4); font-size: var(--t-sm); }
  @media (min-width: 720px) { h1 { font-size: var(--t-2xl); } .arms { grid-template-columns: 1fr 1fr; } }
</style>
