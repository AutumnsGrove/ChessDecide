<script lang="ts">
  import '../app.css';
  let { children } = $props();
</script>

<div class="page">
  <nav class="nav"><a href="/games"><b>ChessDecide</b></a></nav>
  {@render children()}
</div>

<style>
  .nav { display: flex; gap: 12px; align-items: baseline; }
  .nav b { color: var(--fg); }
</style>
