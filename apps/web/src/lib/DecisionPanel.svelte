<script lang="ts">
  import type { Ply } from '@chessdecide/core';
  import { decisionRows } from './viewer-model.ts';

  let { ply, modelLabel }: { ply: Ply; modelLabel: string } = $props();

  const d = $derived(ply.decision);
  const rows = $derived(decisionRows(ply));
  const confidence = $derived(d?.confidence ?? d?.p_pick);
</script>

{#if ply.forced}
  <details class="dp">
    <summary>What the model considered</summary>
    <p class="note">Only one legal move: no model call.</p>
  </details>
{:else if ply.by === 'model' && d && ply.judge && rows.length > 0}
  <details class="dp">
    <summary>What the model considered</summary>
    <div class="rows">
      {#each rows as r (r.uci)}
        <div class="row" class:pick={r.isPick}>
          <span class="san mono">{r.san}{#if r.isBest}<span class="star" title="Stockfish best">★</span>{/if}</span>
          <span class="bar" aria-hidden="true"><i style:width="{(Math.max(0, Math.min(1, r.p)) * 100).toFixed(1)}%"></i></span>
          <span class="p mono">{Math.round(r.p * 100)} %</span>
          <span class="loss {r.tone}">{r.tone === 'best' ? 'best' : `−${(r.cpl / 100).toFixed(1)} pawns`}</span>
        </div>
      {/each}
    </div>
    <p class="foot mono">
      Confidence {confidence !== undefined ? confidence.toFixed(2) : '—'} · {d.n_options} options ·
      ${(d.usage.cost_usd ?? 0).toFixed(5)} · {d.latency_ms} ms · {modelLabel}{#if d.cache_hit} · Cached{/if}
    </p>
  </details>
{/if}

<style>
  .dp { background: var(--panel); border-radius: 8px; padding: 0 12px; }
  summary {
    cursor: pointer; padding: 10px 0; font-size: 13px; color: var(--mute);
    letter-spacing: 0.02em; list-style-position: inside;
  }
  summary:hover { color: var(--fg); }
  .rows { display: flex; flex-direction: column; gap: 5px; padding-bottom: 8px; }
  .row {
    display: grid; grid-template-columns: minmax(52px, auto) 1fr auto auto; gap: 8px; align-items: center;
    font-size: 13px; padding: 3px 6px; border-radius: 4px; border: 1px solid transparent;
  }
  .row.pick { border-color: var(--accent); }
  .san { white-space: nowrap; }
  .star { color: var(--good); margin-left: 3px; font-size: 11px; vertical-align: 1px; }
  .bar { height: 8px; background: var(--panel-2); border-radius: 999px; overflow: hidden; min-width: 40px; }
  .bar i { display: block; height: 100%; background: var(--accent); border-radius: 999px; }
  .p { font-size: 12px; color: var(--mute); min-width: 38px; text-align: right; }
  .loss { font-size: 11px; white-space: nowrap; color: var(--mute); }
  .loss.best { color: var(--good); }
  .loss.inaccuracy { color: var(--warn); }
  .loss.mistake, .loss.blunder { color: var(--bad); }
  .foot { color: var(--mute); font-size: 11px; margin: 0; padding: 0 0 10px; line-height: 1.5; }
  .note { padding-bottom: 10px; }
  @media (max-width: 420px) {
    .row { grid-template-columns: minmax(44px, auto) 1fr auto; }
    .loss { grid-column: 2 / -1; text-align: right; margin-top: -4px; }
  }
</style>
