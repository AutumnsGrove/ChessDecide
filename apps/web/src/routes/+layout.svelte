<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { app, loadHealth, openNewGame, openNewSeries } from '#lib/stores.svelte.ts';
  import { REPO } from '#lib/paper.ts';
  import Banner from '#lib/Banner.svelte';
  import NewGameDialog from '#lib/NewGameDialog.svelte';
  import NewSeriesDialog from '#lib/NewSeriesDialog.svelte';
  import SpendChip from '#lib/SpendChip.svelte';

  let { children } = $props();

  // The public pages are wide, the data-dense ones too; the older series/game screens keep the narrow column.
  const WIDE = ['/', '/models', '/compare', '/paper', '/series'];
  // `/games` is the browsable list, but `/games/<id>` is the viewer and keeps the narrow column.
  const WIDE_EXACT = ['/games'];
  const wide = $derived(WIDE_EXACT.includes(page.url.pathname) || WIDE.some((p) => (p === '/' ? page.url.pathname === '/' : page.url.pathname === p || page.url.pathname.startsWith(`${p}/`))));
  const here = (href: string) => (href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href));
  const links = [
    { href: '/', label: 'Leaderboard', short: 'Board' }, { href: '/models', label: 'Models' },
    { href: '/games', label: 'Games' }, { href: '/paper', label: 'Paper' },
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
  <a class="gh" class:solo={!app.health?.control} href={REPO} aria-label="ChessDecide on GitHub" title="ChessDecide on GitHub">
    <svg viewBox="0 0 16 16" width="22" height="22" aria-hidden="true" focusable="false"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
  </a>
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
  <p>ChessDecide rates AI decision models at chess against a calibrated Stockfish ladder. The site is read-only and every number can be downloaded.</p>
  <nav class="links" aria-label="Data and documents">
    <a href="/paper">Paper</a>
    <a href={REPO}>GitHub</a>
    <a href="/api/leaderboard/export.csv" download>CSV</a>
    <a href="/api/leaderboard">JSON</a>
    <a href="/series">All series</a>
  </nav>
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
  .gh { display: none; align-items: center; justify-content: center; width: 44px; height: 44px; color: var(--mute); border-radius: var(--radius); }
  .gh:hover { color: var(--fg); text-decoration: none; }
  .gh.solo { margin-left: auto; }
  @media (min-width: 560px) { .gh { display: inline-flex; } }
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
