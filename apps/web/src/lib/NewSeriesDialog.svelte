<script lang="ts">
  import type { LadderLevel } from '@chessdecide/core';
  import type { ModelInfo } from '@chessdecide/providers';
  import type { SeriesEstimate } from '@chessdecide/providers';
  import { goto } from '$app/navigation';
  import type { SeriesConfig, SeriesSize } from '@chessdecide/core';
  import { ApiClientError, createSeries, estimateSeriesConfig, getLadder, getModels, seriesAction } from './api.ts';
  import { app, closeNewSeries, refreshSpend, showBanner } from './stores.svelte.ts';

  let dialog = $state<HTMLDialogElement>();
  let lastFocus: HTMLElement | null = null;

  let models = $state<ModelInfo[]>([]);
  let levels = $state<LadderLevel[]>([]);
  let calibrated = $state(false);
  let loading = $state(true);
  let loadError = $state('');

  let model = $state('typesafe/jev-1.14');
  let arm = $state<'clean' | 'hinted' | 'image'>('clean');
  let size = $state<'quick' | 'standard' | 'completion'>('quick');
  let ladderMode = $state<'adaptive' | 'fixed'>('adaptive');
  let level = $state('uci1320');
  let budget = $state(1);
  let starting = $state(false);
  let est = $state<{ loading: boolean; data: SeriesEstimate | null; error: string }>({ loading: false, data: null, error: '' });
  let estTimer: ReturnType<typeof setTimeout> | undefined;

  const fmtUsd = (n: number): string => `$${n >= 0.01 ? n.toFixed(3) : n.toFixed(4)}`;

  function buildConfig(): SeriesConfig {
    const s: SeriesSize = size === 'completion' ? { preset: 'completion' } : { preset: size };
    return {
      model, arm, size: s,
      ladder: ladderMode === 'fixed' ? { mode: 'fixed', level } : { mode: 'adaptive' },
      budget_usd: Number(budget), concurrency: 2, judge_depth: 14,
      seed: Date.now() % 2_000_000_000,
    };
  }

  async function ensureData() {
    if (models.length && levels.length) return;
    loading = true; loadError = '';
    try {
      const [m, l] = await Promise.all([getModels(), getLadder()]);
      models = m; levels = l.levels; calibrated = l.calibrated;
      if (!m.some((x) => x.slug === model)) model = m.find((x) => x.roster && !x.disabled_reason)?.slug ?? m[0]?.slug ?? model;
      if (!l.levels.some((x) => x.id === level)) level = l.levels.find((x) => x.id === 'uci1320')?.id ?? l.levels[0]?.id ?? level;
    } catch (e) {
      loadError = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
    }
  }

  function onClose() {
    if (app.newSeriesOpen) closeNewSeries();
    lastFocus?.focus();
  }

  $effect(() => {
    if (!dialog) return;
    if (app.newSeriesOpen && !dialog.open) {
      lastFocus = document.activeElement as HTMLElement | null;
      dialog.showModal();
      void ensureData();
      queueMicrotask(() => document.getElementById('ns-model')?.focus());
    } else if (!app.newSeriesOpen && dialog.open) {
      dialog.close();
    }
  });

  $effect(() => {
    void model; void arm; void size; void ladderMode; void level; void budget;
    if (!app.newSeriesOpen || models.length === 0) return;
    const config = buildConfig();
    clearTimeout(estTimer);
    est = { loading: true, data: null, error: '' };
    estTimer = setTimeout(async () => {
      try { est = { loading: false, data: await estimateSeriesConfig(config), error: '' }; }
      catch (e) { est = { loading: false, data: null, error: e instanceof Error ? e.message : String(e) }; }
    }, 300);
    return () => clearTimeout(estTimer);
  });

  async function start(e: SubmitEvent) {
    e.preventDefault();
    if (starting || loading) return;
    starting = true;
    try {
      const config = buildConfig();
      const series = await createSeries(config);
      await seriesAction(series.id, 'start');
      refreshSpend();
      closeNewSeries();
      await goto(`/series/${series.id}`);
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.status === 402) {
          const over = Number((err.detail as { est_cost_usd?: number } | null)?.est_cost_usd ?? 0);
          showBanner('error', `Estimated ${fmtUsd(over)} exceeds your cap of ${fmtUsd(Number(budget))}`);
        } else if (err.status === 424) {
          showBanner('error', 'No OpenRouter key is set on the server');
        } else {
          showBanner('error', err.message);
        }
      } else {
        showBanner('error', err instanceof Error ? err.message : String(err));
      }
    } finally {
      starting = false;
    }
  }
</script>

<dialog bind:this={dialog} onclose={onClose} aria-labelledby="ns-title" class="ns">
  <form onsubmit={start}>
    <header class="head">
      <h2 id="ns-title">New series</h2>
      <button type="button" class="x" aria-label="Close" onclick={closeNewSeries}>×</button>
    </header>

    {#if loading}<p class="note">Loading models and ladder…</p>{/if}
    {#if loadError}<p class="err" role="alert">{loadError}</p>{/if}

    <div class="field">
      <label for="ns-model">Model</label>
      <select id="ns-model" bind:value={model} disabled={loading}>
        <optgroup label="Roster">
          {#each models.filter((m) => m.roster) as m (m.slug)}
            <option value={m.slug} disabled={!!m.disabled_reason}>{m.name ?? m.slug}{m.disabled_reason ? ` — ${m.disabled_reason}` : ''}</option>
          {/each}
        </optgroup>
        <optgroup label="More models">
          {#each models.filter((m) => !m.roster) as m (m.slug)}
            <option value={m.slug} disabled={!!m.disabled_reason}>{m.name ?? m.slug}{m.disabled_reason ? ` — ${m.disabled_reason}` : ''}</option>
          {/each}
        </optgroup>
      </select>
    </div>

    <fieldset class="field">
      <legend>Arm</legend>
      <div class="radios">
        <label><input type="radio" name="arm" value="clean" bind:group={arm} /> Clean</label>
        <label><input type="radio" name="arm" value="hinted" bind:group={arm} /> Hinted</label>
        <label><input type="radio" name="arm" value="image" bind:group={arm} /> Image</label>
      </div>
      {#if arm === 'image'}<p class="caveat">Sends a picture of the board instead of text positions. Jev switches to a slower mode for images.</p>{/if}
    </fieldset>

    <fieldset class="field">
      <legend>Size</legend>
      <div class="radios">
        <label><input type="radio" name="size" value="quick" bind:group={size} /> Quick · 25</label>
        <label><input type="radio" name="size" value="standard" bind:group={size} /> Standard · 50</label>
        <label><input type="radio" name="size" value="completion" bind:group={size} /> To completion</label>
      </div>
    </fieldset>

    <fieldset class="field">
      <legend>Ladder</legend>
      <div class="radios">
        <label><input type="radio" name="ladder" value="adaptive" bind:group={ladderMode} /> Adaptive</label>
        <label><input type="radio" name="ladder" value="fixed" bind:group={ladderMode} /> Fixed level</label>
      </div>
      {#if ladderMode === 'fixed'}
        <select aria-label="Fixed ladder level" bind:value={level} disabled={loading}>
          {#each levels as l (l.id)}<option value={l.id}>{l.label} · {l.elo}</option>{/each}
        </select>
      {/if}
      {#if !calibrated}<p class="warnline">Ladder uncalibrated: opponent ratings are nominal.</p>{/if}
    </fieldset>

    <div class="field">
      <label for="ns-budget">Budget cap (USD)</label>
      <input id="ns-budget" type="number" min="0.01" max="50" step="any" bind:value={budget} />
    </div>

    {#if app.health?.mock}
      <label class="check"><input type="checkbox" checked disabled /> Mock model <small>server is in mock mode</small></label>
    {/if}

    <div class="estimate" class:over={!!est.data?.over_cap_typical} aria-live="polite">
      {#if est.loading}
        Estimating…
      {:else if est.error}
        <span class="err">{est.error}</span>
      {:else if est.data}
        ≈ {fmtUsd(est.data.typical.est_cost_usd)} typical · up to {fmtUsd(est.data.worst_case.est_cost_usd)} worst · {est.data.games_typical}–{est.data.games_worst} games
        {#if est.data.over_cap_typical}<b> · over cap</b>{/if}
      {/if}
    </div>

    <button class="primary start" type="submit" disabled={starting || loading || models.length === 0}>
      {starting ? 'Starting…' : 'Start series'}
    </button>
  </form>
</dialog>

<style>
  .ns {
    width: min(520px, calc(100vw - 24px)); max-height: min(88vh, 760px); overflow: auto;
    background: var(--panel); color: var(--fg); border: 1px solid var(--line); border-radius: 10px; padding: 16px;
  }
  .ns::backdrop { background: rgba(0, 0, 0, 0.6); }
  .head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
  .head h2 { font-size: 18px; margin: 0; }
  .x { background: none; border: 0; color: var(--mute); font-size: 24px; line-height: 1; padding: 0 4px; }
  form { display: flex; flex-direction: column; gap: 12px; }
  .field { display: flex; flex-direction: column; gap: 5px; margin: 0; padding: 0; border: 0; min-width: 0; }
  .field > label, legend { font-size: 12px; letter-spacing: 0.04em; text-transform: uppercase; color: var(--mute); padding: 0; }
  select, input[type='number'] {
    width: 100%; background: var(--panel-2); color: var(--fg); border: 1px solid var(--line);
    border-radius: var(--radius); padding: 9px 10px; font: inherit;
  }
  .radios { display: flex; flex-wrap: wrap; gap: 6px 16px; }
  .radios label { display: inline-flex; gap: 6px; align-items: center; font-size: 14px; }
  .caveat { margin: 6px 0 0; font-size: 12px; color: var(--mute); }
  .check { display: flex; gap: 8px; align-items: center; font-size: 14px; }
  .check small { color: var(--mute); }
  .estimate { font: 13px var(--mono); color: var(--mute); background: var(--panel-2); border-radius: var(--radius); padding: 8px 10px; min-height: 34px; }
  .estimate.over { color: var(--bad); }
  .estimate b { font-weight: 600; }
  .warnline { color: var(--warn); font-size: 12px; margin: 2px 0 0; }
  .err { color: var(--bad); font-size: 13px; margin: 0; }
  .primary { background: var(--accent); color: #0d1620; border: 1px solid var(--accent); border-radius: var(--radius); padding: 11px 14px; font-weight: 700; }
  .primary:disabled { opacity: 0.55; cursor: default; }
</style>
