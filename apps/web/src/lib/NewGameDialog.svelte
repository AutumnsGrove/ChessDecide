<script lang="ts">
  import { goto } from '$app/navigation';
  import type { GameConfig, LadderFile, PlayerDesc } from '@chessdecide/core';
  import type { ArmName } from '@chessdecide/core';
  import type { GameEstimate, ModelInfo } from '@chessdecide/providers';
  import { ApiClientError, createGame, estimate, gameAction, getLadder, getModels } from './api.ts';
  import { app, closeNewGame, refreshSpend, showBanner } from './stores.svelte.ts';

  let dialog = $state<HTMLDialogElement>();
  let lastFocus: HTMLElement | null = null;

  let models = $state<ModelInfo[]>([]);
  let ladder = $state<LadderFile | null>(null);
  let loading = $state(true);
  let loadError = $state('');

  let model = $state('typesafe/jev-1.14');
  let arm = $state<ArmName>('clean');
  let opponent = $state('eps50');
  let plays = $state<'white' | 'black' | 'random'>('white');
  let opening = $state<'startpos' | 'random4'>('startpos');
  let pace = $state('600');
  let budget = $state(1);

  let starting = $state(false);
  let est = $state<{ loading: boolean; data: GameEstimate | null; error: string }>({ loading: false, data: null, error: '' });
  let estTimer: ReturnType<typeof setTimeout> | undefined;

  const rand32 = (): number => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0]!; };
  const fmtUsd = (n: number): string => `$${n >= 0.01 ? n.toFixed(3) : n.toFixed(4)}`;

  async function ensureData() {
    if (models.length && ladder) return;
    loading = true; loadError = '';
    try {
      const [m, l] = await Promise.all([getModels(), getLadder()]);
      models = m; ladder = l;
      const preferred = m.find((x) => x.slug === model && !x.disabled_reason)
        ?? m.find((x) => x.roster && !x.disabled_reason)
        ?? m.find((x) => !x.disabled_reason) ?? m[0];
      if (preferred) model = preferred.slug;
      if (!l.levels.some((x) => x.id === opponent)) opponent = l.levels.find((x) => x.id === 'eps50')?.id ?? l.levels[0]?.id ?? opponent;
    } catch (e) {
      loadError = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
    }
  }

  function buildConfig(): GameConfig {
    const modelDesc: PlayerDesc = { type: 'model', model, arm };
    const oppDesc: PlayerDesc = { type: 'ladder', level: opponent };
    const color = plays === 'random' ? (rand32() % 2 === 0 ? 'white' : 'black') : plays;
    return {
      white: color === 'white' ? modelDesc : oppDesc,
      black: color === 'black' ? modelDesc : oppDesc,
      opening: opening === 'random4' ? { type: 'random4' } : { type: 'startpos' },
      pace_ms: Number(pace),
      budget_usd: Number(budget),
      judge_depth: 14,
      max_plies: 200,
      adjudicate: true,
      seed: rand32() % 2_000_000_000,
    };
  }

  function onClose() {
    if (app.newGameOpen) closeNewGame();
    lastFocus?.focus();
  }

  // Open/close the native dialog with the store flag.
  $effect(() => {
    if (!dialog) return;
    if (app.newGameOpen && !dialog.open) {
      lastFocus = document.activeElement as HTMLElement | null;
      dialog.showModal();
      void ensureData();
      queueMicrotask(() => document.getElementById('ng-model')?.focus());
    } else if (!app.newGameOpen && dialog.open) {
      dialog.close();
    }
  });

  // Debounced live estimate; red when it exceeds the cap.
  $effect(() => {
    // dependencies
    void model; void arm; void opponent; void plays; void opening; void pace; void budget;
    if (!app.newGameOpen || models.length === 0) return;
    const config = buildConfig();
    clearTimeout(estTimer);
    est = { loading: true, data: null, error: '' };
    estTimer = setTimeout(async () => {
      try { est = { loading: false, data: await estimate(config), error: '' }; }
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
      const game = await createGame(config);
      await gameAction(game.id, 'auto', { pace_ms: config.pace_ms });
      refreshSpend();
      closeNewGame();
      await goto(`/games/${game.id}`);
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

<dialog bind:this={dialog} onclose={onClose} aria-labelledby="ng-title" class="ng">
  <form onsubmit={start}>
    <header class="head">
      <h2 id="ng-title">New game</h2>
      <button type="button" class="x" aria-label="Close" onclick={closeNewGame}>×</button>
    </header>

    {#if loading}<p class="note">Loading models and ladder…</p>{/if}
    {#if loadError}<p class="err" role="alert">{loadError}</p>{/if}

    <div class="field">
      <label for="ng-model">Model</label>
      <select id="ng-model" bind:value={model} disabled={loading}>
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
        <label class="off" title="The image arm arrives in a later task"><input type="radio" name="arm" value="image" disabled /> Image <small>coming soon</small></label>
      </div>
    </fieldset>

    <div class="field">
      <label for="ng-opponent">Opponent</label>
      <select id="ng-opponent" bind:value={opponent} disabled={loading || !ladder}>
        {#each ladder?.levels ?? [] as l (l.id)}
          <option value={l.id}>{l.label} · {l.elo}</option>
        {/each}
      </select>
      {#if ladder && !ladder.calibrated}<p class="warnline">Ladder uncalibrated: opponent ratings are nominal.</p>{/if}
    </div>

    <fieldset class="field">
      <legend>Model plays</legend>
      <div class="radios">
        <label><input type="radio" name="plays" value="white" bind:group={plays} /> White</label>
        <label><input type="radio" name="plays" value="black" bind:group={plays} /> Black</label>
        <label><input type="radio" name="plays" value="random" bind:group={plays} /> Random</label>
      </div>
    </fieldset>

    <fieldset class="field">
      <legend>Opening</legend>
      <div class="radios">
        <label><input type="radio" name="opening" value="startpos" bind:group={opening} /> Start position</label>
        <label><input type="radio" name="opening" value="random4" bind:group={opening} /> Random 4 plies</label>
      </div>
    </fieldset>

    <div class="two">
      <div class="field">
        <label for="ng-pace">Pace</label>
        <select id="ng-pace" bind:value={pace}>
          <option value="0">Fast (no delay)</option>
          <option value="600">Watch</option>
          <option value="1500">Slow</option>
        </select>
      </div>
      <div class="field">
        <label for="ng-budget">Budget cap (USD)</label>
        <input id="ng-budget" type="number" min="0.001" max="50" step="any" bind:value={budget} />
      </div>
    </div>

    {#if app.health?.mock}
      <label class="check"><input type="checkbox" checked disabled /> Mock model <small>server is in mock mode</small></label>
    {/if}

    <div class="estimate" class:over={!!est.data?.over_cap} aria-live="polite">
      {#if est.loading}
        Estimating…
      {:else if est.error}
        <span class="err">{est.error}</span>
      {:else if est.data}
        ≈ {fmtUsd(est.data.est_cost_usd)} · up to {fmtUsd(est.data.worst_case_usd)} · {est.data.calls} model calls
        {#if est.data.over_cap}<b> · over cap</b>{/if}
      {/if}
    </div>

    <button class="primary start" type="submit" disabled={starting || loading || models.length === 0}>
      {starting ? 'Starting…' : 'Start game'}
    </button>
  </form>
</dialog>

<style>
  .ng {
    width: min(520px, calc(100vw - 24px)); max-height: min(88vh, 760px); overflow: auto;
    background: var(--panel); color: var(--fg); border: 1px solid var(--line); border-radius: 10px;
    padding: 16px;
  }
  .ng::backdrop { background: rgba(0, 0, 0, 0.6); }
  .head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
  .head h2 { font-size: 18px; margin: 0; }
  .x { background: none; border: 0; color: var(--mute); font-size: 24px; line-height: 1; padding: 0 4px; }
  .x:hover { color: var(--fg); }
  form { display: flex; flex-direction: column; gap: 12px; }
  .field { display: flex; flex-direction: column; gap: 5px; margin: 0; padding: 0; border: 0; min-width: 0; }
  .field > label, legend { font-size: 12px; letter-spacing: 0.04em; text-transform: uppercase; color: var(--mute); padding: 0; }
  select, input[type='number'] {
    width: 100%; background: var(--panel-2); color: var(--fg); border: 1px solid var(--line);
    border-radius: var(--radius); padding: 9px 10px; font: inherit;
  }
  .radios { display: flex; flex-wrap: wrap; gap: 6px 16px; }
  .radios label { display: inline-flex; gap: 6px; align-items: center; font-size: 14px; }
  .radios label.off { color: var(--mute); }
  .radios small { color: var(--mute); font-size: 11px; }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .check { display: flex; gap: 8px; align-items: center; font-size: 14px; }
  .check small { color: var(--mute); }
  .estimate { font: 13px var(--mono); color: var(--mute); background: var(--panel-2); border-radius: var(--radius); padding: 8px 10px; min-height: 34px; }
  .estimate.over { color: var(--bad); }
  .estimate b { font-weight: 600; }
  .warnline { color: var(--warn); font-size: 12px; margin: 2px 0 0; }
  .err { color: var(--bad); font-size: 13px; margin: 0; }
  .primary {
    background: var(--accent); color: #0d1620; border: 1px solid var(--accent);
    border-radius: var(--radius); padding: 11px 14px; font-weight: 700;
  }
  .primary:disabled { opacity: 0.55; cursor: default; }
  .start { margin-top: 2px; }
</style>
