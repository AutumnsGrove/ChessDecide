<script lang="ts">
  import type { BrowsedGame, LeaderReference } from './api.ts';
  import { board } from './chessground.ts';
  import { endingLabel, gameFacts, modelOf, opponentWithElo, outcomeOf, OUTCOME_WORD } from './games-model.ts';
  import { shortName } from './leaderboard-model.ts';

  let { g, reference }: { g: BrowsedGame; reference: LeaderReference[] } = $props();
  const who = $derived(modelOf(g));
  const outcome = $derived(outcomeOf(g));
  const opponent = $derived(opponentWithElo(g, reference));
</script>

<a class="game" href="/games/{g.id}">
  <div class="thumb" aria-hidden="true"><div use:board={{ fen: g.final_fen, thumb: true, orientation: g.model_color ?? 'white' }}></div></div>
  <div class="body">
    <div class="top">
      <span class="who">
        {#if who}{shortName(who.model)}{#if who.arm} <span class="arm-chip {who.arm}">{who.arm}</span>{/if}{:else}Game {g.id.slice(-6)}{/if}
      </span>
      <span class="chip {outcome}">{OUTCOME_WORD[outcome]}</span>
    </div>
    <p class="vs">vs {opponent}</p>
    <p class="end">{endingLabel(g)}</p>
    <p class="facts mono">{gameFacts(g)}</p>
  </div>
</a>

<style>
  .game {
    display: grid; grid-template-columns: 76px minmax(0, 1fr); gap: var(--s3); align-items: center;
    background: var(--panel); border-radius: var(--radius); padding: var(--s3); color: var(--fg); min-width: 0;
  }
  .game:hover { background: var(--panel-2); text-decoration: none; }
  .thumb { width: 76px; aspect-ratio: 1; border-radius: 3px; overflow: hidden; background: var(--bg-deep); }
  .thumb > div { width: 100%; height: 100%; }
  .body { display: grid; gap: 3px; min-width: 0; }
  .top { display: flex; justify-content: space-between; align-items: baseline; gap: var(--s2); min-width: 0; }
  .who { font-weight: 650; font-size: var(--t-md); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .who .arm-chip { margin-left: var(--s1); font-weight: 400; }
  .vs { font-size: var(--t-sm); color: var(--mute); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .end { font-size: var(--t-sm); color: var(--fg); }
  .facts { font-size: var(--t-xs); color: var(--faint); }
  .chip {
    flex: none; font: 600 var(--t-xs) var(--sans); letter-spacing: 0.03em; padding: 2px 8px; border-radius: 999px;
    background: var(--panel-2); color: var(--mute);
  }
  .chip.won { background: color-mix(in oklch, var(--good) 18%, var(--panel)); color: var(--good); }
  .chip.lost { background: color-mix(in oklch, var(--bad) 20%, var(--panel)); color: var(--bad); }
  .chip.drawn { color: var(--fg); }
  .chip.live { background: color-mix(in oklch, var(--accent) 18%, var(--panel)); color: var(--accent); }
</style>
