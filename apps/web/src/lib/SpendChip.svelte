<script lang="ts">
  import { onMount } from 'svelte';
  import { app, loadSpend } from './stores.svelte.ts';

  onMount(() => {
    void loadSpend();
    const t = setInterval(() => void loadSpend(), 10_000);
    return () => clearInterval(t);
  });
  // A game event (or a new game) asks for an immediate refresh.
  $effect(() => { app.spendPulse; void loadSpend(); });

  const usd = $derived(app.spend?.usd ?? 0);
  const text = $derived(`$${usd < 0.01 ? usd.toFixed(4) : usd.toFixed(3)}`);
</script>

<span class="spend mono" title="Spent this session">{text}</span>

<style>
  .spend {
    font-size: 13px; color: var(--fg); background: var(--panel); border: 1px solid var(--line);
    border-radius: 999px; padding: 3px 10px; white-space: nowrap;
  }
</style>
