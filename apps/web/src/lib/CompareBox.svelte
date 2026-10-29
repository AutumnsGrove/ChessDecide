<script lang="ts">
  import type { CompareResult, LeaderRow } from './api.ts';
  import { compareLeaderArms } from './api.ts';
  import { armLabel, comparisonSentence, differenceLabel } from './leaderboard-model.ts';

  let { rows }: { rows: LeaderRow[] } = $props();

  let a = $state('');
  let b = $state('');
  let result = $state<CompareResult | null>(null);
  let error = $state('');

  // Default to the two top rows once, so the box is useful without any clicking.
  $effect(() => {
    if (!a && rows.length > 0) a = rows[0]!.arm_id;
    if (!b && rows.length > 1) b = rows[1]!.arm_id;
  });

  $effect(() => {
    if (!a || !b || a === b) { result = null; return; }
    const wantA = a, wantB = b;
    let live = true;
    compareLeaderArms(wantA, wantB)
      .then((r) => { if (live && a === wantA && b === wantB) { result = r; error = ''; } })
      .catch((e: unknown) => { if (live) { result = null; error = e instanceof Error ? e.message : 'compare failed'; } });
    return () => { live = false; };
  });

  const same = $derived(a !== '' && a === b);
</script>

<div class="box">
  <div class="picks">
    <label>Arm A
      <select bind:value={a}>
        {#each rows as row (row.arm_id)}<option value={row.arm_id}>{armLabel(row)}</option>{/each}
      </select>
    </label>
    <span class="vs">vs</span>
    <label>Arm B
      <select bind:value={b}>
        {#each rows as row (row.arm_id)}<option value={row.arm_id}>{armLabel(row)}</option>{/each}
      </select>
    </label>
  </div>

  {#if same}
    <p class="note">Pick two different arms.</p>
  {:else if error}
    <p class="err" role="alert">{error}</p>
  {:else if result}
    <p class="sentence">{comparisonSentence(result)}</p>
    <p class="gap mono">{differenceLabel(result)}</p>
    <p class="note">On {result.a.games} and {result.b.games} games. A difference interval that spans zero is not separable.</p>
  {:else}
    <p class="note">Comparing…</p>
  {/if}
</div>

<style>
  .box { display: flex; flex-direction: column; gap: 8px; }
  .picks { display: flex; align-items: flex-end; gap: 8px; flex-wrap: wrap; }
  label { display: flex; flex-direction: column; gap: 3px; font-size: 11px; color: var(--mute); text-transform: uppercase; letter-spacing: 0.04em; flex: 1 1 140px; }
  select {
    background: var(--panel-2); color: var(--fg); border: 1px solid var(--line); border-radius: var(--radius);
    padding: 7px 8px; font-size: 13px; min-width: 0;
  }
  .vs { color: var(--mute); font-size: 12px; padding-bottom: 9px; }
  .sentence { margin: 0; font-size: 15px; color: var(--fg); }
  .gap { margin: 0; font-size: 13px; color: var(--mute); }
  .err { margin: 0; color: var(--bad); font-size: 13px; }
</style>
