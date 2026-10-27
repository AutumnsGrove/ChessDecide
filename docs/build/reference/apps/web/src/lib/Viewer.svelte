<script lang="ts">
  import type { Game, Ply } from '@chessdecide/core';
  import { START_FEN } from '@chessdecide/core';
  import { board } from './chessground.ts';
  import { evalPct, graphPoints, mistakeCount, playerLabel, resultLabel, statusLine } from './viewer-model.ts';

  let { initial, live = false }: { initial: Game; live?: boolean } = $props();

  // svelte-ignore state_referenced_locally
  let game = $state<Game>(structuredClone($state.snapshot(initial)) as Game);
  let cur = $state(0);                 // 0 = start position, n = after ply n
  let attached = $state(true);         // follow new plies as they arrive
  let playing = $state(false);
  let timer: ReturnType<typeof setInterval> | null = null;

  const plies = $derived(game.plies);
  const ply = $derived<Ply | null>(cur > 0 ? (plies[cur - 1] ?? null) : null);
  const fen = $derived(cur > 0 ? (plies[cur - 1]?.fen_after ?? START_FEN) : game.start_fen);
  const status = $derived(statusLine(game, ply));
  const evCp = $derived(ply?.eval?.white_eval_cp ?? 0);
  const behind = $derived(Math.max(0, plies.length - cur));
  const lastMove = $derived<[string, string] | undefined>(ply ? [ply.uci.slice(0, 2), ply.uci.slice(2, 4)] : undefined);

  function show(i: number) { cur = Math.max(0, Math.min(plies.length, i)); if (cur === plies.length) { if (!attached) attached = live && game.status !== 'finished'; stop(); } }
  function stop() { if (timer) clearInterval(timer); timer = null; playing = false; }
  function play() {
    if (playing) return stop();
    if (cur >= plies.length) cur = 0;
    playing = true; attached = false;
    timer = setInterval(() => show(cur + 1), 900);
  }
  function go(i: number) { stop(); attached = false; show(i); }

  function onKey(e: KeyboardEvent) {
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
    if (e.key === 'ArrowRight') { go(cur + 1); e.preventDefault(); }
    else if (e.key === 'ArrowLeft') { go(cur - 1); e.preventDefault(); }
    else if (e.key === 'Home') { go(0); e.preventDefault(); }
    else if (e.key === 'End') { stop(); attached = true; show(plies.length); e.preventDefault(); }
    else if (e.key === ' ') { play(); e.preventDefault(); }
  }

  function seekFromGraph(e: PointerEvent) {
    const el = e.currentTarget as SVGElement, r = el.getBoundingClientRect();
    go(Math.round(((e.clientX - r.left) / r.width) * plies.length));
  }

  // ---- live attach: SSE ----
  $effect(() => {
    if (!live || game.status === 'finished' || game.status === 'aborted') return;
    const es = new EventSource(`/api/games/${game.id}/events`);
    const on = (name: string, f: (d: any) => void) => es.addEventListener(name, (m) => f(JSON.parse((m as MessageEvent).data)));
    on('snapshot', (g: Game) => { game = g; if (attached) cur = g.plies.length; });
    on('ply', (p: Ply) => { const i = game.plies.findIndex((x) => x.ply === p.ply); if (i >= 0) game.plies[i] = p; else game.plies.push(p); if (attached) cur = game.plies.length; });
    on('judged', (d: { ply: number; eval: Ply['eval']; judge: Ply['judge'] }) => { const p = game.plies.find((x) => x.ply === d.ply); if (p) { p.eval = d.eval; p.judge = d.judge; } });
    on('status', (d: { status: Game['status']; status_reason?: string }) => { game.status = d.status; game.status_reason = d.status_reason; });
    return () => es.close();
  });
  $effect(() => () => stop());
</script>

<svelte:window onkeydown={onKey} />

<div class="viewer">
  <div class="who"><b>{playerLabel(game.config.black)}</b><span>Black</span></div>
  <div class="boardrow">
    <div class="board"><div use:board={{ fen, ...(lastMove ? { lastMove } : {}), check: !!ply && /[+#]/.test(ply.san) }}></div></div>
    <div class="evalbar" title="Who is ahead, according to Stockfish"><i style:height="{evalPct(evCp)}%"></i></div>
  </div>
  <div class="who"><b>{playerLabel(game.config.white)}</b><span>White</span></div>

  <div class="caption" aria-live="polite">
    <span class="mv mono">{status.title}</span>
    {#if status.tag}<span class="tag {status.tag.kind}">{status.tag.text}</span>{/if}
    <p>{status.body}</p>
    {#if status.lead}<small>{status.lead}</small>{/if}
  </div>

  <div class="controls">
    <button onclick={() => go(0)} aria-label="Start">⏮</button>
    <button onclick={() => go(cur - 1)} aria-label="Previous move">◀</button>
    <button class="main" onclick={play} aria-label={playing ? 'Pause' : 'Play'}>{playing ? '⏸' : '▶'}</button>
    <button onclick={() => go(cur + 1)} aria-label="Next move">▶▶</button>
    <button onclick={() => { stop(); attached = true; show(plies.length); }} aria-label="End">⏭</button>
  </div>
  {#if live && !attached && behind > 0}<button class="pill" onclick={() => { attached = true; show(plies.length); }}>+{behind} new moves · jump to live</button>{/if}

  <div class="graph">
    <svg viewBox="0 0 300 84" preserveAspectRatio="none" role="img" aria-label="Who is ahead over time. Tap to jump." onpointerdown={seekFromGraph}>
      <line x1="0" x2="300" y1="42" y2="42" stroke="#3a3733" vector-effect="non-scaling-stroke" />
      <polyline points={graphPoints(plies)} fill="none" stroke="#6fa8dc" stroke-width="2" vector-effect="non-scaling-stroke" />
      {#if plies.length}<line x1={(cur / plies.length) * 300} x2={(cur / plies.length) * 300} y1="0" y2="84" stroke="#e6e3dc" stroke-width="2" vector-effect="non-scaling-stroke" />{/if}
    </svg>
    <div class="lab"><span>White ahead ↑</span><span>Move {Math.ceil(cur / 2)} of {Math.ceil(plies.length / 2)}</span><span>Black ahead ↓</span></div>
  </div>

  <div class="stats">
    <div class="stat"><b>{resultLabel(game)}</b><span>result</span></div>
    <div class="stat"><b>{mistakeCount(game)}</b><span>mistakes</span></div>
    <div class="stat"><b>${game.cost_usd.toFixed(3)}</b><span>cost of game</span></div>
  </div>
</div>

<style>
  .viewer { display: flex; flex-direction: column; gap: 14px; }
  .who { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
  .who span { color: var(--mute); font-size: 13px; }
  .boardrow { display: flex; gap: 8px; }
  .board { flex: 1; min-width: 0; aspect-ratio: 1; position: relative; }
  .board > div { width: 100%; height: 100%; }
  .evalbar { width: 14px; border-radius: 3px; overflow: hidden; background: #111; display: flex; flex-direction: column; justify-content: flex-end; border: 1px solid var(--line); }
  .evalbar i { display: block; background: #f2f0ea; transition: height 0.3s; }
  .caption { background: var(--panel); border-radius: 8px; padding: 12px 14px; min-height: 96px; }
  .mv { font-weight: 600; font-size: 17px; }
  .caption p { margin: 6px 0 0; } .caption small { color: var(--mute); }
  .tag { display: inline-block; font: 600 11px var(--sans); letter-spacing: 0.06em; text-transform: uppercase; padding: 2px 7px; border-radius: 4px; margin-left: 8px; vertical-align: 2px; }
  .tag.ok { background: #2b3a26; color: var(--good); } .tag.inaccuracy { background: #3d3418; color: var(--warn); }
  .tag.mistake, .tag.blunder { background: #44221e; color: var(--bad); } .tag.engine, .tag.forced { background: #24303b; color: var(--accent); }
  .controls { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; }
  .controls button { padding: 12px 0; font-size: 18px; background: var(--panel); color: var(--fg); border: 1px solid var(--line); border-radius: var(--radius); }
  .controls button.main { background: var(--accent); color: #0d1620; border-color: var(--accent); font-weight: 700; }
  .pill { align-self: center; background: var(--accent); color: #0d1620; border: 0; border-radius: 999px; padding: 6px 14px; font-weight: 600; }
  .graph { background: var(--panel); border-radius: 8px; padding: 8px 10px; }
  .graph svg { display: block; width: 100%; height: 84px; touch-action: none; }
  .lab { display: flex; justify-content: space-between; color: var(--mute); font-size: 12px; }
  .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .stat { background: var(--panel); border-radius: 8px; padding: 10px; text-align: center; }
  .stat b { display: block; font: 600 18px var(--mono); } .stat span { font-size: 12px; color: var(--mute); }
</style>
