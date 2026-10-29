<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { app, loadHealth, openNewGame, openNewSeries } from '#lib/stores.svelte.ts';
  import Banner from '#lib/Banner.svelte';
  import NewGameDialog from '#lib/NewGameDialog.svelte';
  import NewSeriesDialog from '#lib/NewSeriesDialog.svelte';
  import SpendChip from '#lib/SpendChip.svelte';

  let { children } = $props();

  onMount(() => {
    void loadHealth();
    const t = setInterval(() => void loadHealth(), 30_000);
    return () => clearInterval(t);
  });
</script>

<header class="top">
  <nav class="nav">
    <a class="brand" href="/">♞ ChessDecide</a>
    <a href="/">Leaderboard</a>
    <a href="/series">Series</a>
    <a href="/games">Games</a>
  </nav>
  {#if app.health?.control}
    <div class="chips">
      <span class="chip" class:ok={app.health.openrouter.key_present} class:bad={!app.health.openrouter.key_present} title="OpenRouter API key">
        <i></i>OpenRouter
      </span>
      <span class="chip" class:ok={app.health.engine.ok} class:bad={!app.health.engine.ok} title={app.health.engine.version}>
        <i></i>Stockfish
      </span>
      <span class="chip" class:ok={app.health.ladder.calibrated} class:warn={!app.health.ladder.calibrated}>
        <i></i>{app.health.ladder.calibrated ? 'Ladder calibrated' : 'Ladder uncalibrated'}
      </span>
    </div>
    <SpendChip />
    <button class="new" onclick={openNewSeries}>New series</button>
    <button class="new" onclick={openNewGame}>New game</button>
  {/if}
</header>

<div class="page">
  {#if app.banners.length}
    <div class="banners">
      {#each app.banners as b (b.id)}<Banner banner={b} />{/each}
    </div>
  {/if}
  {@render children()}
</div>

{#if app.health?.control}<NewGameDialog />{/if}
{#if app.health?.control}<NewSeriesDialog />{/if}

<style>
  .top {
    position: sticky; top: 0; z-index: 10;
    display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center;
    padding: 8px max(16px, env(safe-area-inset-left, 0px)) 8px max(16px, env(safe-area-inset-right, 0px));
    background: var(--bg); border-bottom: 1px solid var(--line);
  }
  .nav { display: flex; gap: 14px; align-items: baseline; }
  .brand { color: var(--fg); font-weight: 700; white-space: nowrap; }
  .nav a:not(.brand) { color: var(--mute); font-size: 14px; }
  .nav a:not(.brand):hover { color: var(--fg); }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-left: auto; }
  .chip {
    display: inline-flex; gap: 5px; align-items: center;
    font-size: 11px; color: var(--mute); background: var(--panel);
    border: 1px solid var(--line); border-radius: 999px; padding: 3px 8px; white-space: nowrap;
  }
  .chip i { width: 7px; height: 7px; border-radius: 50%; background: var(--mute); }
  .chip.ok i { background: var(--good); }
  .chip.warn i { background: var(--warn); }
  .chip.bad i { background: var(--bad); }
  .chip.warn { color: var(--warn); }
  .new {
    background: var(--panel-2); color: var(--fg); border: 1px solid var(--line);
    border-radius: var(--radius); padding: 6px 12px; font-size: 14px;
  }
  .new:hover { border-color: var(--accent); }
  .banners { display: flex; flex-direction: column; gap: 8px; }
  @media (max-width: 560px) {
    .chips { margin-left: 0; order: 3; width: 100%; }
    .top { gap: 6px 10px; }
  }
</style>
