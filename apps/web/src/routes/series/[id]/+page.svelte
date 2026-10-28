<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { Series, SeriesEvent } from '@chessdecide/core';
  import { app, refreshSpend, showBanner } from '#lib/stores.svelte.ts';
  import { ApiClientError, getSeries, seriesAction } from '#lib/api.ts';
  import {
    blockRows, gameChip, intervalLabel, metricRows, precisionHint, progressLabel,
  } from '#lib/series-model.ts';
  import EloChart from '#lib/EloChart.svelte';
  import GameStrip from '#lib/GameStrip.svelte';
  import MiniBoard from '#lib/MiniBoard.svelte';

  let { data } = $props();
  // svelte-ignore state_referenced_locally
  let series = $state<Series>(structuredClone($state.snapshot(data.series)) as Series);
  let showAll = $state(false);
  let pending = $state(false);
  let confirmStop = $state(false);
  let confirmTimer: ReturnType<typeof setTimeout> | undefined;
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;

  const statusClass = $derived(
    series.status === 'finished' ? 'good'
      : series.status === 'running' ? 'live'
      : series.status === 'paused' || series.status === 'stopped_budget' ? 'warn'
      : series.status === 'aborted' || series.status === 'stopped_error' ? 'bad' : 'mute',
  );
  const live = $derived(['running', 'paused', 'created', 'stopped_budget'].includes(series.status));
  const runningGames = $derived(series.games.filter((g) => g.status === 'running').slice(0, 2));
  const shownGames = $derived(showAll ? series.games : series.games.slice(0, 25));
  const rows = $derived(metricRows(series.secondary));

  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(async () => {
      try { series = await getSeries(series.id); } catch { /* keep the current view */ }
    }, 250);
  }

  async function act(action: 'start' | 'pause' | 'stop') {
    if (pending) return;
    pending = true;
    try { await seriesAction(series.id, action); }
    catch (e) { showBanner('error', e instanceof ApiClientError ? e.message : e instanceof Error ? e.message : String(e)); }
    finally { pending = false; }
  }

  function stopClick() {
    if (!confirmStop) {
      confirmStop = true;
      confirmTimer = setTimeout(() => { confirmStop = false; confirmTimer = undefined; }, 3000);
      return;
    }
    confirmStop = false;
    if (confirmTimer) clearTimeout(confirmTimer);
    void act('stop');
  }

  onDestroy(() => { if (confirmTimer) clearTimeout(confirmTimer); if (refreshTimer) clearTimeout(refreshTimer); });

  // Live series events. A fresh snapshot is sent on connect, so reconnects are safe.
  $effect(() => {
    const id = series.id;
    if (!live) return;
    const es = new EventSource(`/api/series/${id}/events`);
    const on = (name: string, f: (d: any) => void) => es.addEventListener(name, (m) => f(JSON.parse((m as MessageEvent).data)));
    on('snapshot', (s: Series) => { series = s; });
    on('elo', (d: { estimate: Series['elo']; point: Series['elo_history'][number] }) => {
      series.elo = d.estimate;
      series.elo_history = [...series.elo_history, d.point];
      refreshSpend();
    });
    on('game_finished', (g: Series['games'][number]) => {
      const i = series.games.findIndex((x) => x.game_id === g.game_id);
      if (i >= 0) series.games[i] = g; else series.games.push(g);
      scheduleRefresh();
      refreshSpend();
    });
    on('game_started', () => scheduleRefresh());
    on('block', () => scheduleRefresh());
    on('spend', (d: { series_usd: number }) => { series.cost_usd = d.series_usd; refreshSpend(); });
    on('status', (d: { status: Series['status']; status_reason?: string }) => {
      series.status = d.status;
      series.status_reason = d.status_reason;
      refreshSpend();
      if (!['running', 'paused', 'created', 'stopped_budget'].includes(d.status)) es.close();
    });
    on('error', (d: { message: string }) => showBanner('error', d.message));
    return () => es.close();
  });
</script>

<div class="head">
  <div>
    <h1 class="h">{series.name}</h1>
    <p class="note">{series.model} · {series.arm} · ladder v{series.ladder_version}</p>
  </div>
  <span class="chip {statusClass}">{series.status.replace('_', ' ')}</span>
</div>

{#if !data.ladder.calibrated}
  <div class="notice" role="status">Ladder uncalibrated: opponent ratings are nominal.</div>
{/if}

{#if app.health?.control && !['finished', 'aborted', 'stopped_error'].includes(series.status)}
  <div class="controls">
    {#if series.status === 'running'}
      <button onclick={() => act('pause')} disabled={pending}>Pause</button>
    {:else}
      <button onclick={() => act('start')} disabled={pending}>Resume</button>
    {/if}
    <button class="stop" class:confirm={confirmStop} onclick={stopClick} disabled={pending}>{confirmStop ? 'Confirm stop' : 'Stop'}</button>
  </div>
{/if}

<section class="card rating">
  {#if series.elo}
    <div class="big mono">{Math.round(series.elo.mean)}<span> ± {Math.round(series.elo.half_width)}</span></div>
    <p class="note">95 % interval {Math.round(series.elo.lo)}–{Math.round(series.elo.hi)} · {series.elo.games} rated games</p>
    <div class="record">
      <span><b>W-D-L</b> {series.elo.w}-{series.elo.d}-{series.elo.l}</span>
      <span><b>Score</b> {(series.elo.score_pct * 100).toFixed(0)} %</span>
      <span><b>Progress</b> {progressLabel(series)}</span>
      <span><b>Cost</b> <span class="mono">${(series.cost_usd ?? 0).toFixed(4)}</span></span>
    </div>
    <p class="hint">{precisionHint(series.elo.games)}</p>
  {:else}
    <p class="note">No rated games yet. The first interval appears after the first finished game.</p>
    <div class="record"><span><b>Progress</b> {progressLabel(series)}</span><span><b>Cost</b> <span class="mono">${(series.cost_usd ?? 0).toFixed(4)}</span></span></div>
  {/if}
</section>

{#if series.elo_history.length > 0}
  <section class="card">
    <h2 class="sub">Elo over games</h2>
    <EloChart {series} levels={data.ladder.levels} />
  </section>
{/if}

<section class="card">
  <h2 class="sub">Games</h2>
  <GameStrip games={series.games} />
</section>

{#if runningGames.length > 0}
  <section class="card">
    <h2 class="sub">In flight</h2>
    <div class="minis">
      {#each runningGames as g (g.game_id)}
        <MiniBoard gameId={g.game_id} base="Game {g.index + 1} · {g.model_color} vs {g.level_id}" />
      {/each}
    </div>
  </section>
{/if}

<section class="card">
  <h2 class="sub">Blocks</h2>
  {#if series.blocks.length === 0}
    <p class="note">No blocks yet.</p>
  {:else}
    <table>
      <thead><tr><th>#</th><th>Opponent</th><th>Games</th><th>Score</th><th>After</th></tr></thead>
      <tbody>
        {#each blockRows(series) as b (b.index)}
          <tr><td class="mono">{b.index + 1}</td><td>{b.level}</td><td class="mono">{b.games}</td><td class="mono">{(b.score * 100).toFixed(0)} %</td><td class="mono">{Math.round(b.after)}</td></tr>
        {/each}
      </tbody>
    </table>
  {/if}
</section>

<section class="card">
  <h2 class="sub">Secondary metrics</h2>
  <div class="metrics">
    {#each rows as m (m.key)}
      <div class="metric"><b class="mono">{m.value}</b><span>{m.label}</span></div>
    {/each}
  </div>
</section>

<section class="card">
  <div class="tablehead">
    <h2 class="sub">Game list</h2>
    {#if series.games.length > 25}<button class="link" onclick={() => (showAll = !showAll)}>{showAll ? 'Show less' : `Show all ${series.games.length}`}</button>{/if}
  </div>
  {#if series.games.length === 0}
    <p class="note">No games yet.</p>
  {:else}
    <table class="games">
      <thead><tr><th>#</th><th>Result</th><th>Level</th><th>Colour</th><th>Plies</th><th>Cost</th></tr></thead>
      <tbody>
        {#each shownGames as g (g.game_id)}
          <tr>
            <td class="mono"><a href="/games/{g.game_id}">{g.index + 1}</a></td>
            <td><span class="gchip {gameChip(g)}">{gameChip(g)}</span></td>
            <td>{g.level_id}</td>
            <td>{g.model_color}</td>
            <td class="mono">{g.plies}</td>
            <td class="mono">${(g.cost_usd ?? 0).toFixed(4)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</section>

<style>
  .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
  .h { font-size: 18px; margin: 0; }
  .chip { font: 600 11px var(--sans); padding: 3px 9px; border-radius: 999px; background: var(--panel-2); color: var(--mute); white-space: nowrap; }
  .chip.good { background: #2b3a26; color: var(--good); }
  .chip.live { background: #24303b; color: var(--accent); }
  .chip.warn { background: #3d3418; color: var(--warn); }
  .chip.bad { background: #44221e; color: var(--bad); }
  .notice { background: #3d3418; color: var(--warn); border-radius: var(--radius); padding: 9px 12px; font-size: 13px; }
  .controls { display: flex; gap: 6px; }
  .controls button { flex: 1; padding: 8px 10px; font-size: 13px; background: var(--panel); color: var(--fg); border: 1px solid var(--line); border-radius: var(--radius); }
  .controls button:disabled { opacity: 0.55; cursor: default; }
  .controls .stop { color: var(--bad); }
  .controls .stop.confirm { background: #44221e; border-color: var(--bad); color: var(--fg); font-weight: 600; }
  .sub { font-size: 12px; letter-spacing: 0.04em; text-transform: uppercase; color: var(--mute); margin: 0 0 8px; }
  .rating .big { font-size: 44px; line-height: 1.1; }
  .rating .big span { font-size: 20px; color: var(--mute); }
  .record { display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 13px; color: var(--mute); margin-top: 8px; }
  .record b { color: var(--fg); font-weight: 500; }
  .hint { color: var(--mute); font-size: 12px; margin: 6px 0 0; }
  .minis { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; font-size: 11px; letter-spacing: 0.04em; text-transform: uppercase; color: var(--mute); font-weight: 500; padding: 4px 6px; }
  td { padding: 5px 6px; border-top: 1px solid var(--line); }
  td a { color: var(--fg); }
  .metrics { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
  .metric { background: var(--panel-2); border-radius: 6px; padding: 8px 10px; min-width: 0; }
  .metric b { display: block; font-size: 16px; }
  .metric span { font-size: 11px; color: var(--mute); line-height: 1.3; }
  .tablehead { display: flex; justify-content: space-between; align-items: baseline; }
  .link { background: none; border: 0; color: var(--accent); font-size: 12px; padding: 0; }
  .gchip { font: 600 10px var(--sans); text-transform: uppercase; letter-spacing: 0.03em; padding: 2px 6px; border-radius: 4px; background: var(--panel-2); color: var(--mute); }
  .gchip.won { background: #2b3a26; color: var(--good); }
  .gchip.lost { background: #44221e; color: var(--bad); }
  .gchip.draw { background: var(--panel-2); color: var(--fg); }
  .gchip.running { background: #24303b; color: var(--accent); }
  .gchip.aborted { background: #44221e; color: var(--bad); }
  @media (max-width: 420px) { .metrics { grid-template-columns: 1fr 1fr; } }
</style>
