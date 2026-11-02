#!/usr/bin/env -S pnpm exec tsx
/**
 * Paired position test: does adding the board picture to clean / hinted change move quality?
 * No games, no Elo, no database. Every position is sent under all four arms (clean, clean_image,
 * hinted, hinted_image) to each model through the production request builders (ModelPlayer),
 * and every pick is scored by Stockfish. Differences are paired by position.
 *
 *   tsx scripts/paired-image.ts positions --out DIR --n 200 [--seed 1]
 *   tsx scripts/paired-image.ts oracle    --out DIR [--depth 14] [--workers 4]
 *   tsx scripts/paired-image.ts run       --out DIR --models a,b,c [--limit N] [--cap-usd 1.5] [--parallel 6]
 *   tsx scripts/paired-image.ts analyze   --out DIR
 *
 * Needs OPENROUTER_API_KEY in the environment for `run`, and Stockfish for `positions` / `oracle`.
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import {
  ARM_PRESETS, START_FEN, applyMove, classify, derive, legalMoves, mulberry32, outcomeOf, sideToMove,
  type ArmName, type Game, type GameConfig, type MoveContext, type Oracle,
} from '@chessdecide/core';
import { EngineJudge, NativeUciEngine } from '@chessdecide/engine';
import { DecisionsClient, ModelPlayer, type AttemptRow, type AttemptSink } from '@chessdecide/providers';
import { boardDataUrl } from '@chessdecide/render';
import { findStockfish } from '../src/config.ts';

const ARMS: ArmName[] = ['clean', 'clean_image', 'hinted', 'hinted_image'];
const PAIRS: Array<[base: ArmName, img: ArmName]> = [['clean', 'clean_image'], ['hinted', 'hinted_image']];

interface Pos { idx: number; fen: string; history: string[]; ply: number }

const [cmd, ...rest] = process.argv.slice(2);
const { values: v } = parseArgs({ args: rest, options: {
  out: { type: 'string' }, n: { type: 'string', default: '200' }, seed: { type: 'string', default: '1' },
  depth: { type: 'string', default: '14' }, workers: { type: 'string', default: '4' },
  models: { type: 'string' }, limit: { type: 'string' }, 'cap-usd': { type: 'string', default: '1.5' },
  parallel: { type: 'string', default: '6' },
} });
if (!v.out) { console.error('--out DIR is required'); process.exit(2); }
const OUT = v.out; mkdirSync(OUT, { recursive: true });
const P = (f: string) => join(OUT, f);
const readJson = <T>(f: string): T => JSON.parse(readFileSync(P(f), 'utf8')) as T;

// ---------------------------------------------------------------- positions
async function positions() {
  const n = Number(v.n), seed = Number(v.seed);
  const eng = await NativeUciEngine.start({ path: findStockfish(), options: { UCI_LimitStrength: true, UCI_Elo: 1500, Threads: 1, Hash: 16 } });
  const out: Pos[] = []; const seen = new Set<string>();
  for (let g = 0; out.length < n && g < n * 6; g++) {
    const rng = mulberry32(seed * 100003 + g);
    const target = 8 + Math.floor(rng() * 63);              // sampled ply: 8..70, uniform
    let fen = START_FEN; const sans: string[] = [];
    let alive = true;
    for (let ply = 0; ply < target && alive; ply++) {
      const legal = legalMoves(fen);
      if (legal.length === 0) { alive = false; break; }
      let uci: string;
      if (ply < 4 || rng() < 0.15) uci = legal[Math.floor(rng() * legal.length)]!.uci;   // random opening + 15% noise
      else uci = (await eng.search({ fen, movetimeMs: 15 })).bestUci;
      const r = applyMove(fen, uci); sans.push(r.move.san); fen = r.fen;
      if (outcomeOf(fen, []) !== 'none') alive = false;
    }
    if (!alive || legalMoves(fen).length < 2) continue;      // a lone legal move is played without a call
    const key = fen.split(' ').slice(0, 4).join(' ');
    if (seen.has(key)) continue; seen.add(key);
    out.push({ idx: out.length, fen, history: sans.slice(-16), ply: target });
  }
  await eng.close();
  writeFileSync(P('positions.json'), JSON.stringify(out));
  const white = out.filter((p) => sideToMove(p.fen) === 'white').length;
  console.log(`positions: ${out.length} (white to move ${white}), mean legal moves ${(out.reduce((s, p) => s + legalMoves(p.fen).length, 0) / out.length).toFixed(1)}`);
}

// ---------------------------------------------------------------- oracle
async function oracle() {
  const pos = readJson<Pos[]>('positions.json');
  const engines = await Promise.all(Array.from({ length: Number(v.workers) }, () => NativeUciEngine.start({ path: findStockfish() })));
  const judge = await EngineJudge.create(engines);
  const file = P('oracle.json');
  const have: Record<string, Oracle> = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  const t0 = Date.now();
  for (const p of pos) {
    if (have[p.fen]) continue;
    have[p.fen] = await judge.oracle(p.fen, Number(v.depth));
    if (p.idx % 10 === 0) { writeFileSync(file, JSON.stringify(have)); console.log(`oracle ${p.idx + 1}/${pos.length}  ${((Date.now() - t0) / 1000).toFixed(0)}s`); }
  }
  writeFileSync(file, JSON.stringify(have));
  await Promise.all(engines.map((e) => e.close()));
  console.log(`oracle done: ${Object.keys(have).length} positions, depth ${v.depth}`);
}

// ---------------------------------------------------------------- run
interface Row {
  model: string; arm: ArmName; pos: number; pick?: string; p_pick?: number; ms?: number;
  in?: number; out?: number; cost?: number; err?: string;
}
async function run() {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) { console.error('OPENROUTER_API_KEY is not set'); process.exit(2); }
  if (!v.models) { console.error('--models a,b,c is required'); process.exit(2); }
  const models = v.models.split(',').map((s) => s.trim()).filter(Boolean);
  const all = readJson<Pos[]>('positions.json');
  const pos = v.limit ? all.slice(0, Number(v.limit)) : all;
  const capUsd = Number(v['cap-usd']);
  const file = P('results.jsonl');
  const done = new Set<string>();
  let spent = 0;
  if (existsSync(file)) for (const l of readFileSync(file, 'utf8').split('\n').filter(Boolean)) {
    const r = JSON.parse(l) as Row; done.add(`${r.model}|${r.arm}|${r.pos}`); spent += r.cost ?? 0;
  }
  console.log(`resuming with ${done.size} rows already done, $${spent.toFixed(4)} spent; cap $${capUsd}`);
  const client = new DecisionsClient({ apiKey: key });
  let stop = false;

  const sink: AttemptSink = { async record() { return 0; }, async findCached() { return undefined; } };
  const config = (model: string, arm: ArmName): GameConfig => ({
    white: { type: 'model', model, arm }, black: { type: 'ladder', level: 'random' },
    opening: { type: 'startpos' }, pace_ms: 0, budget_usd: 1, judge_depth: 14, max_plies: 200, adjudicate: true, seed: 1,
  });
  const players = (model: string) => Object.fromEntries(ARMS.map((arm) => [arm, new ModelPlayer({
    client, sink, model, arm, seed: 1, renderImage: async (f: string) => boardDataUrl(f),
  })])) as Record<ArmName, ModelPlayer>;

  async function oneModel(model: string) {
    const pl = players(model);
    let n = 0;
    for (const p of pos) {
      for (const arm of ARMS) {                                  // arms interleaved per position
        if (stop) return;
        if (done.has(`${model}|${arm}|${p.idx}`)) continue;
        const legal = legalMoves(p.fen);
        const game: Game = { id: `paired-${p.idx}`, status: 'running', config: config(model, arm), start_fen: p.fen, adjudicated: false, plies: [], result: '*', termination: '', cost_usd: 0, created_at: '' };
        const ctx: MoveContext = { game, fen: p.fen, historySan: p.history, legal, ply: p.idx + 1, side: sideToMove(p.fen) };
        const row: Row = { model, arm, pos: p.idx };
        const t0 = Date.now();
        try {
          const m = await pl[arm].move(ctx);
          const d = m.decision!;
          Object.assign(row, { pick: m.uci, p_pick: d.p_pick, ms: d.latency_ms, in: d.usage.input_tokens, out: d.usage.output_tokens, cost: d.usage.cost_usd ?? 0 });
        } catch (e) { Object.assign(row, { err: String((e as Error).message).slice(0, 200), ms: Date.now() - t0 }); }
        appendFileSync(file, JSON.stringify(row) + '\n');
        spent += row.cost ?? 0;
        if (spent > capUsd) { stop = true; console.log(`CAP HIT: $${spent.toFixed(4)} > $${capUsd}`); return; }
      }
      if (++n % 20 === 0) console.log(`${model}: ${n}/${pos.length} positions, total $${spent.toFixed(4)}`);
    }
    console.log(`done ${model}`);
  }
  const queue = [...models]; const par = Math.min(Number(v.parallel), queue.length);
  await Promise.all(Array.from({ length: par }, async () => { for (let m; (m = queue.shift()); ) await oneModel(m); }));
  console.log(`finished; spent $${spent.toFixed(4)}`);
}

// ---------------------------------------------------------------- analyze
const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
function bootstrapCi(diffs: number[], seed = 7, reps = 2000): [number, number] {
  const rng = mulberry32(seed), n = diffs.length, ms: number[] = [];
  for (let r = 0; r < reps; r++) { let s = 0; for (let i = 0; i < n; i++) s += diffs[Math.floor(rng() * n)]!; ms.push(s / n); }
  ms.sort((a, b) => a - b);
  return [ms[Math.floor(reps * 0.025)]!, ms[Math.floor(reps * 0.975)]!];
}
const f1 = (x: number) => (x >= 0 ? '+' : '') + x.toFixed(1);

function analyze() {
  const pos = readJson<Pos[]>('positions.json');
  const orc = readJson<Record<string, Oracle>>('oracle.json');
  const der = new Map(pos.map((p) => [p.idx, derive(orc[p.fen]!)]));
  const rows = readFileSync(P('results.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as Row);
  const key = (m: string, a: string, i: number) => `${m}|${a}|${i}`;
  const by = new Map(rows.map((r) => [key(r.model, r.arm, r.pos), r]));
  const models = [...new Set(rows.map((r) => r.model))];
  const wl = (r: Row) => der.get(r.pos)!.wl[r.pick!]!;
  const best = (r: Row) => der.get(r.pos)!.bestSet.has(r.pick!) ? 1 : 0;
  const blun = (r: Row) => classify(wl(r)) === 'blunder' ? 1 : 0;

  // random-mover reference: expected win-prob loss of a uniform pick
  const rndWl = mean(pos.map((p) => mean(Object.values(der.get(p.idx)!.wl))));
  const lines: string[] = [];
  const errs = rows.filter((r) => r.err);
  lines.push(`# Paired position test: board picture added to clean / hinted`, '');
  lines.push(`${new Set(rows.map((r) => r.pos)).size} positions · Stockfish depth ${Object.values(orc)[0]?.depth} · ${rows.length} calls (${errs.length} failed) · spent $${rows.reduce((s, r) => s + (r.cost ?? 0), 0).toFixed(3)}`);
  lines.push(`Metric: **win-probability loss** per move in percentage points (lower is better) vs Stockfish's best; uniform random mover ≈ ${rndWl.toFixed(1)}.`);
  lines.push(`Δ = with picture − without, paired by position; 95 % CI by bootstrap over positions. Negative Δ means the picture helped.`, '');

  type Cell = { base: number; img: number; d: number; lo: number; hi: number; n: number; best: number; blun: number; same: number; dBy: Map<number, number> };
  const cells = new Map<string, Cell>();
  for (const m of models) for (const [b, im] of PAIRS) {
    const ds: number[] = []; const dBy = new Map<number, number>();
    let sb = 0, si = 0, bb = 0, bi = 0, ub = 0, ui = 0, same = 0;
    for (const p of pos) {
      const rb = by.get(key(m, b, p.idx)), ri = by.get(key(m, im, p.idx));
      if (!rb?.pick || !ri?.pick) continue;
      const d = wl(ri) - wl(rb); ds.push(d); dBy.set(p.idx, d);
      sb += wl(rb); si += wl(ri); bb += best(rb); bi += best(ri); ub += blun(rb); ui += blun(ri); same += rb.pick === ri.pick ? 1 : 0;
    }
    const n = ds.length; if (!n) continue;
    const [lo, hi] = bootstrapCi(ds);
    cells.set(`${m}|${b}`, { base: sb / n, img: si / n, d: mean(ds), lo, hi, n, best: (bi - bb) / n * 100, blun: (ui - ub) / n * 100, same: same / n * 100, dBy });
  }

  for (const [b, im] of PAIRS) {
    lines.push(`## ${b} → ${im}`, '');
    lines.push('| model | n | loss without | loss with | Δ loss (95 % CI) | Δ best-move % | Δ blunder % | same pick % |', '|---|---:|---:|---:|---|---:|---:|---:|');
    const list = models.map((m) => [m, cells.get(`${m}|${b}`)] as const).filter(([, c]) => c).sort((x, y) => x[1]!.d - y[1]!.d);
    for (const [m, c] of list) {
      const sig = c!.hi < 0 ? ' ▲ helps' : c!.lo > 0 ? ' ▼ hurts' : '';
      lines.push(`| ${m} | ${c!.n} | ${c!.base.toFixed(1)} | ${c!.img.toFixed(1)} | **${f1(c!.d)}** [${f1(c!.lo)}, ${f1(c!.hi)}]${sig} | ${f1(c!.best)} | ${f1(c!.blun)} | ${c!.same.toFixed(0)} |`);
    }
    // pooled: average over models of the per-position diff; cluster bootstrap over positions
    const cs = list.map(([, c]) => c!);
    const idxs = pos.map((p) => p.idx).filter((i) => cs.every((c) => c.dBy.has(i)));
    if (idxs.length >= 10 && cs.length > 1) {
      const per = idxs.map((i) => mean(cs.map((c) => c.dBy.get(i)!)));
      const [lo, hi] = bootstrapCi(per, 11);
      lines.push('', `**Pooled over ${cs.length} models** (positions where all have answers, n=${idxs.length}): Δ loss ${f1(mean(per))} [${f1(lo)}, ${f1(hi)}]`, '');
    } else lines.push('');
  }

  lines.push('## Cost and size of the picture', '', '| model | arm | mean input tok | mean $/call |', '|---|---|---:|---:|');
  for (const m of models) for (const a of ARMS) {
    const rs = rows.filter((r) => r.model === m && r.arm === a && r.pick);
    if (rs.length) lines.push(`| ${m} | ${a} | ${mean(rs.map((r) => r.in ?? 0)).toFixed(0)} | ${(mean(rs.map((r) => r.cost ?? 0))).toFixed(6)} |`);
  }
  if (errs.length) {
    lines.push('', '## Failures', '');
    const c = new Map<string, number>(); for (const r of errs) c.set(`${r.model} · ${r.arm} · ${r.err!.slice(0, 80)}`, (c.get(`${r.model} · ${r.arm} · ${r.err!.slice(0, 80)}`) ?? 0) + 1);
    for (const [k, n] of c) lines.push(`- ${n}× ${k}`);
  }
  writeFileSync(P('report.md'), lines.join('\n') + '\n');
  console.log(lines.join('\n'));
}

const commands: Record<string, () => unknown> = { positions, oracle, run, analyze };
if (!cmd || !(cmd in commands)) { console.error('usage: positions | oracle | run | analyze'); process.exit(2); }
await commands[cmd]!();
process.exit(0);
