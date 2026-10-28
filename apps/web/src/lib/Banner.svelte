<script lang="ts">
  import { dismissBanner, type Banner } from './stores.svelte.ts';
  let { banner }: { banner: Banner } = $props();
</script>

<div class="banner {banner.kind}" role={banner.kind === 'error' ? 'alert' : 'status'}>
  <span>{banner.message}</span>
  {#if banner.dismissible}
    <button type="button" aria-label="Dismiss" onclick={() => dismissBanner(banner.id)}>×</button>
  {/if}
</div>

<style>
  .banner {
    display: flex; gap: 10px; align-items: flex-start; justify-content: space-between;
    padding: 10px 12px; border-radius: var(--radius); border-left: 3px solid var(--accent);
    background: var(--panel); font-size: 14px;
  }
  .banner.info { border-left-color: var(--accent); }
  .banner.warn { border-left-color: var(--warn); }
  .banner.error { border-left-color: var(--bad); }
  .banner button {
    flex: none; background: none; border: 0; color: var(--mute); font-size: 18px; line-height: 1;
    padding: 0 2px;
  }
  .banner button:hover { color: var(--fg); }
</style>
