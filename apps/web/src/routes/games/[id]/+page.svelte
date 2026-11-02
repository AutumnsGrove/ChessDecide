<script lang="ts">
  import Viewer from '#lib/Viewer.svelte';
  import { modelHref, money, shortName } from '#lib/leaderboard-model.ts';
  import { armPresetName } from '#lib/games-model.ts';
  import { playerLabel, resultLabel } from '#lib/viewer-model.ts';

  let { data } = $props();
  const game = $derived(data.game);
  const live = $derived(game.status === 'running' || game.status === 'paused' || game.status === 'ready');
  const modelSide = $derived(game.config.white.type === 'model' ? game.config.white : game.config.black.type === 'model' ? game.config.black : null);
  const mine = $derived(game.plies.filter((p) => p.by === 'model' && !p.forced && p.judge));
  const acpl = $derived(mine.length ? mine.reduce((s, p) => s + p.judge!.cpl, 0) / mine.length : null);
  const armName = $derived(modelSide && modelSide.type === 'model' ? armPresetName(modelSide.arm) : null);
  const bad = (c: string) => mine.filter((p) => p.judge!.class === c).length;
  const title = $derived(`${playerLabel(game.config.white)} vs ${playerLabel(game.config.black)}`);
</script>

<svelte:head><title>{title} · ChessDecide</title></svelte:head>

{#if !live}
  <header class="result">
    <div class="who">
      <h1>{title}</h1>
      <p class="note">
        {#if modelSide && modelSide.type === 'model'}
          <a href={modelHref(modelSide.model)}>{shortName(modelSide.model)}</a>{#if armName}<span class="arm-chip {armName}">{armName}</span>{/if}
        {/if}
        {#if game.series_id}<a href="/series/{game.series_id}">Series</a>{/if}
      </p>
    </div>
    <dl class="mono">
      <div><dt>Result</dt><dd class="r">{game.result} · {resultLabel(game)}</dd></div>
      <div><dt>Ended by</dt><dd>{game.termination || 'none'}{game.adjudicated ? ' (adjudicated)' : ''}</dd></div>
      <div><dt>Plies</dt><dd>{game.plies.length}</dd></div>
      {#if acpl !== null}<div><dt>ACPL</dt><dd>{Math.round(acpl)}</dd></div>{/if}
      {#if mine.length}<div><dt>Mistakes, blunders</dt><dd>{bad('mistake')}, {bad('blunder')}</dd></div>{/if}
      <div><dt>Cost</dt><dd>{money(game.cost_usd)}</dd></div>
    </dl>
  </header>
{/if}

<Viewer initial={game} {live} />

<style>
  .result { display: grid; gap: var(--s3); }
  h1 { font-size: var(--t-lg); }
  .note a { margin-right: var(--s3); }
  dl { margin: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: var(--s2) var(--s4); }
  dt { font: var(--t-xs) var(--sans); letter-spacing: 0.04em; text-transform: uppercase; color: var(--mute); }
  dd { margin: 2px 0 0; font-size: var(--t-sm); }
  .r { font-weight: 700; color: var(--fg); }
  @media (min-width: 720px) { h1 { font-size: var(--t-xl); } }
</style>
