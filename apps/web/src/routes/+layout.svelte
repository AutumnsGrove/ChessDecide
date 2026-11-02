<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { app, loadHealth, openNewGame, openNewSeries } from '#lib/stores.svelte.ts';
  import Banner from '#lib/Banner.svelte';
  import NewGameDialog from '#lib/NewGameDialog.svelte';
  import NewSeriesDialog from '#lib/NewSeriesDialog.svelte';
  import SpendChip from '#lib/SpendChip.svelte';

  let { children } = $props();

  // The public pages are wide, the data-dense ones too; the older series/game screens keep the narrow column.
  const WIDE = ['/', '/models', '/compare', '/method', '/series'];
  const wide = $derived(WIDE.some((p) => (p === '/' ? page.url.pathname === '/' : page.url.pathname === p || page.url.pathname.startsWith(`${p}/`))));
  const here = (href: string) => (href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href));
  const links = [
    { href: '/', label: 'Leaderboard', short: 'Board' }, { href: '/models', label: 'Models' },
    { href: '/games', label: 'Games' }, { href: '/method', label: 'Method' },
  ];

  onMount(() => {
    void loadHealth();
    const t = setInterval(() => void loadHealth(), 30_000);
    return () => clearInterval(t);
  });
</script>

<header class="top" class:wide>
  <nav class="nav">
    <a class="brand" href="/"><span aria-hidden="true">♞</span> ChessDecide</a>
    {#each links as l (l.href)}
      <a href={l.href} class="link" aria-current={here(l.href) ? 'page' : undefined}>{#if l.short}<span class="long">{l.label}</span><span class="short">{l.short}</span>{:else}{l.label}{/if}</a>
    {/each}
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

<div class="page" class:wide>
  {#if app.banners.length}
    <div class="banners">
      {#each app.banners as b (b.id)}<Banner banner={b} />{/each}
    </div>
  {/if}
  {@render children()}
</div>

<footer class="foot">
  <span>Read-only research data. No generated commentary: every sentence is a template over a number.</span>
  <span class="links">
    <a href="/api/leaderboard/export.csv" download>CSV</a>
    <a href="/api/leaderboard">JSON</a>
    <a href="/series">All series</a>
    <a href="/method">Method</a>
  </span>
</footer>

{#if app.health?.control}<NewGameDialog />{/if}
{#if app.health?.control}<NewSeriesDialog />{/if}

<style>
  .top {
    position: sticky; top: 0; z-index: 10;
    display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center;
    padding-block: 4px;
    background: var(--bg); border-bottom: 1px solid var(--line);
  }
  .top { padding-inline: max(16px, calc((100vw - 560px) / 2)); }
  .top.wide { padding-inline: max(16px, calc((100vw - 1120px) / 2)); }
  .nav { display: flex; flex-wrap: wrap; gap: 0 var(--s1); align-items: center; margin-left: -8px; }
  .nav a { display: inline-flex; align-items: center; min-height: 40px; padding: 0 8px; border-radius: var(--radius); }
  .nav a:hover { text-decoration: none; }
  .brand { color: var(--fg); font-weight: 700; white-space: nowrap; margin-right: var(--s2); }
  .link { color: var(--mute); font-size: var(--t-sm); padding: 0 6px !important; }
  .short { display: none; }
  @media (max-width: 479px) { .long { display: none; } .short { display: inline; } }
  .link:hover { color: var(--fg); }
  .link[aria-current='page'] { color: var(--fg); box-shadow: inset 0 -2px 0 var(--accent); border-radius: 0; }
  .foot {
    max-width: 1120px; margin: 0 auto; padding: var(--s5) var(--s4) var(--s6);
    display: flex; flex-wrap: wrap; justify-content: space-between; gap: var(--s2) var(--s4);
    font-size: var(--t-xs); color: var(--mute); border-top: 1px solid var(--line-soft);
  }
  .foot .links { display: flex; gap: var(--s4); }
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
