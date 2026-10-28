<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { Game } from '@chessdecide/core';
  import { ApiClientError, gameAction } from './api.ts';
  import { showBanner } from './stores.svelte.ts';

  let { game, live }: { game: Game; live: boolean } = $props();

  let pending = $state(false);
  let confirmStop = $state(false);
  let confirmTimer: ReturnType<typeof setTimeout> | undefined;

  const terminal = $derived(game.status === 'finished' || game.status === 'aborted');
  const shown = $derived(live && !terminal);

  function resetConfirm() {
    confirmStop = false;
    if (confirmTimer) clearTimeout(confirmTimer);
    confirmTimer = undefined;
  }
  onDestroy(resetConfirm);

  async function act(action: 'auto' | 'pause' | 'step' | 'stop', body?: unknown) {
    if (pending) return;
    pending = true;
    try {
      await gameAction(game.id, action, body);
    } catch (e) {
      showBanner('error', e instanceof ApiClientError ? e.message : e instanceof Error ? e.message : String(e));
    } finally {
      pending = false;
    }
  }

  function stopClick() {
    if (!confirmStop) {
      confirmStop = true;
      confirmTimer = setTimeout(() => { confirmStop = false; confirmTimer = undefined; }, 3000);
      return;
    }
    resetConfirm();
    void act('stop');
  }
</script>

{#if shown}
  <div class="lc" aria-label="Game controls">
    {#if game.status === 'running'}
      <button type="button" onclick={() => act('pause')} disabled={pending}>Pause</button>
    {:else}
      <button type="button" onclick={() => act('auto', { pace_ms: game.config.pace_ms })} disabled={pending}>Resume</button>
      <button type="button" onclick={() => act('step')} disabled={pending}>Step</button>
    {/if}
    <button type="button" class="stop" class:confirm={confirmStop} onclick={stopClick} disabled={pending}>
      {confirmStop ? 'Confirm stop' : 'Stop'}
    </button>
  </div>
{/if}

<style>
  .lc { display: flex; gap: 6px; flex-wrap: wrap; }
  .lc button {
    flex: 1; min-width: 84px; padding: 8px 10px; font-size: 13px;
    background: var(--panel); color: var(--fg); border: 1px solid var(--line); border-radius: var(--radius);
  }
  .lc button:hover:not(:disabled) { border-color: var(--accent); }
  .lc button:disabled { opacity: 0.55; cursor: default; }
  .lc .stop { color: var(--bad); }
  .lc .stop.confirm { background: #44221e; border-color: var(--bad); color: var(--fg); font-weight: 600; }
</style>
