<script lang="ts">
  import Viewer from '#lib/Viewer.svelte';
  let { data } = $props();
</script>

<Viewer initial={data.game} live={data.game.status === 'running' || data.game.status === 'paused' || data.game.status === 'ready'} />
