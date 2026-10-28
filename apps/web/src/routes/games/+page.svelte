<script lang="ts">
  import { onMount } from 'svelte';
  import { app, openNewGame } from '#lib/stores.svelte.ts';
  import { listGames, type GameSummary } from '#lib/api.ts';
  import { playerLabel } from '#lib/viewer-model.ts';

  let { data } = $props();
  // svelte-ignore state_referenced_locally
  let games = $state<GameSummary[]>(data.games as GameSummary[]);

  onMount(() => {
    const tick = async () => { try { games = await listGames(); } catch { /* keep the last list */ } };
    void tick();
    const t = setInterval(() => void tick(), 5000);
    return () => clearInterval(t);
  });

  const modelOf = (g: GameSummary) => (g.white.type === 'model' ? g.white : g.black);
  const opponentOf = (g: GameSummary) => (g.white.type === 'model' ? g.black : g.white);
  function modelName(g: GameSummary): string {
    const p = modelOf(g);
    return p.type === 'model' ? p.model : '—';
  }

  function chip(g: GameSummary): string {
    if (g.result === '*') return g.status === 'finished' ? '—' : 'In progress';
    if (g.result === '1/2-1/2') return 'Draw';
    const modelIsWhite = g.white.type === 'model';
    const whiteWon = g.result === '1-0';
    return whiteWon === modelIsWhite ? 'Model won' : 'Model lost';
  }

  function chipClass(g: GameSummary): string {
    if (g.result === '*') return 'live';
    if (g.result === '1/2-1/2') return 'draw';
    const modelIsWhite = g.white.type === 'model';
    return (g.result === '1-0') === modelIsWhite ? 'won' : 'lost';
  }

  function ago(iso: string): string {
    const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  }
</script>

<div class="head">
  <h1 class="h">Games</h1>
  {#if app.health?.control}<button class="new" onclick={openNewGame}>New game</button>{/if}
</div>

{#if games.length === 0}
  <div class="empty card">
    <p class="note">No games yet.</p>
    {#if app.health?.control}<button class="primary" onclick={openNewGame}>Start a game</button>{/if}
  </div>
{:else}
  <ul class="list">
    {#each games as g (g.id)}
      <li>
        <a href="/games/{g.id}">
          <span class="chip {chipClass(g)}">{chip(g)}</span>
          <span class="who">{modelName(g)} <span class="note">vs {playerLabel(opponentOf(g))}</span></span>
          <span class="meta mono">{g.plies} plies · ${(g.cost_usd ?? 0).toFixed(3)} · {ago(g.created_at)}</span>
          <span class="id mono">{g.id.slice(-6)}</span>
        </a>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .h { font-size: 18px; margin: 0; }
  .new, .primary {
    background: var(--panel-2); color: var(--fg); border: 1px solid var(--line);
    border-radius: var(--radius); padding: 7px 12px; font-size: 14px;
  }
  .primary { background: var(--accent); color: #0d1620; border-color: var(--accent); font-weight: 700; }
  .empty { display: flex; flex-direction: column; gap: 10px; align-items: flex-start; }
  .list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
  .list a {
    display: grid; grid-template-columns: auto 1fr auto; gap: 4px 10px; align-items: center;
    background: var(--panel); border-radius: var(--radius); padding: 10px 12px; color: var(--fg);
  }
  .list a:hover { background: var(--panel-2); }
  .chip {
    grid-row: span 2; align-self: center; font: 600 11px var(--sans); letter-spacing: 0.03em;
    padding: 3px 8px; border-radius: 999px; white-space: nowrap; background: var(--panel-2); color: var(--mute);
  }
  .chip.won { background: #2b3a26; color: var(--good); }
  .chip.lost { background: #44221e; color: var(--bad); }
  .chip.draw { background: var(--panel-2); color: var(--fg); }
  .chip.live { background: #24303b; color: var(--accent); }
  .who { font-size: 14px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .meta { grid-column: 2; font-size: 12px; color: var(--mute); }
  .id { grid-column: 3; grid-row: 1; font-size: 12px; color: var(--mute); }
  @media (max-width: 420px) {
    .list a { grid-template-columns: auto 1fr; }
    .id { display: none; }
  }
</style>
