import { describe, expect, it } from 'vitest';
import { START_FEN, legalMoves, stepGame, playToEnd, type Game, type Ports } from '@chessdecide/core';
import {
  DecisionsClient, ModelPlayer, MockPlayer, estimateCallUsd, estimateGame, gameBudget,
  type AttemptRow, type AttemptSink, type ModelInfo,
} from '../src/index.ts';

const okBody = (choice: string, keys: string[], cost = 0.00004) => ({
  id: 'x', model: 'typesafe/jev-1.14-2026', provider: 'TypeSafe',
  answers: { move: { type: 'choice', choice, probabilities: Object.fromEntries(keys.map((k) => [k, k === choice ? 0.5 : 0.5 / (keys.length - 1)])), confidence: 0.5 } },
  usage: { input_tokens: 900, output_tokens: 250, cost },
});
const resp = (status: number, body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers });
const keys = legalMoves(START_FEN).map((m) => m.uci);

function client(script: Array<() => Response | Promise<Response>>, extra: { sleeps?: number[]; maxConcurrency?: number } = {}) {
  let i = 0; let calls = 0;
  const sleeps = extra.sleeps ?? [];
  const c = new DecisionsClient({
    apiKey: 'k', maxConcurrency: extra.maxConcurrency ?? 2, maxRps: 1000, rng: () => 0.5,
    fetch: (async () => { calls++; return script[Math.min(i++, script.length - 1)]!(); }) as unknown as typeof fetch,
    sleep: async (ms) => { sleeps.push(ms); },
  });
  return { c, calls: () => calls, sleeps };
}
function memSink(): AttemptSink & { rows: AttemptRow[] } {
  const rows: AttemptRow[] = [];
  return { rows, async record(r) { rows.push(r); return rows.length; }, async findCached(h) { const r = rows.find((x) => x.request_hash === h && x.status === 'ok' && x.response_json && !x.cache_hit); return r ? { response: JSON.parse(r.response_json!) } : undefined; } };
}
const game = (): Game => ({ id: 'g', status: 'ready', config: { white: { type: 'model', model: 'm', arm: 'clean' }, black: { type: 'ladder', level: 'random' }, opening: { type: 'startpos' }, pace_ms: 0, budget_usd: 1, judge_depth: 14, max_plies: 200, adjudicate: false, seed: 1 }, start_fen: START_FEN, adjudicated: false, plies: [], result: '*', termination: '', cost_usd: 0, created_at: '' });
const ctx = () => ({ game: game(), fen: START_FEN, historySan: [], legal: legalMoves(START_FEN), ply: 1, side: 'white' as const });

describe('DecisionsClient', () => {
  it('429 then 200: one retry, 1 s backoff with jitter factor 1.0 at rng 0.5', async () => {
    const { c, calls, sleeps } = client([() => resp(429, { error: 'slow' }), () => resp(200, okBody('e2e4', keys))]);
    const r = await c.call('m', '{}');
    expect(r.status).toBe(200); expect(r.retries).toBe(1); expect(calls()).toBe(2); expect(sleeps).toContain(1000);
  });
  it('502 x4 returns the error after 3 retries; 400 is not retried', async () => {
    const a = client([() => resp(502, { e: 1 })]);
    const r = await a.c.call('m', '{}');
    expect(r.status).toBe(502); expect(r.retries).toBe(3); expect(a.calls()).toBe(4);
    const b = client([() => resp(400, { e: 1 })]);
    expect((await b.c.call('m', '{}')).retries).toBe(0); expect(b.calls()).toBe(1);
  });
  it('honours Retry-After', async () => {
    const { c, sleeps } = client([() => resp(429, {}, { 'retry-after': '7' }), () => resp(200, okBody('e2e4', keys))]);
    await c.call('m', '{}');
    expect(sleeps).toContain(7000);
  });
  it('network error becomes status 0 and is retried', async () => {
    const { c } = client([() => { throw new Error('ECONNRESET'); }, () => resp(200, okBody('e2e4', keys))]);
    const r = await c.call('m', '{}');
    expect(r.status).toBe(200); expect(r.attempts[0]!.status).toBe(0);
  });
  it('never exceeds the per-model concurrency', async () => {
    let active = 0, max = 0;
    const c = new DecisionsClient({
      apiKey: 'k', maxConcurrency: 2, maxRps: 1000, sleep: async () => {},
      fetch: (async () => { active++; max = Math.max(max, active); await new Promise((r) => setTimeout(r, 15)); active--; return resp(200, okBody('e2e4', keys)); }) as unknown as typeof fetch,
    });
    await Promise.all(Array.from({ length: 8 }, () => c.call('m', '{}')));
    expect(max).toBe(2);
  });
});

describe('ModelPlayer', () => {
  it('plays a move, records one row per HTTP call and sums cost', async () => {
    const { c } = client([() => resp(429, {}), () => resp(200, okBody('e2e4', keys, 0.00004))]);
    const sink = memSink();
    const mv = await new ModelPlayer({ client: c, sink, model: 'typesafe/jev-1.14', arm: 'clean', seed: 1 }).move(ctx());
    expect(mv.uci).toBe('e2e4'); expect(mv.cost_usd).toBeCloseTo(0.00004, 12);
    expect(sink.rows.map((r) => r.status)).toEqual(['error', 'ok']); expect(sink.rows[1]!.retry_of).toBe(1);
    expect(mv.decision!.top_options.length).toBeLessThanOrEqual(9); expect(mv.decision!.retries).toBe(1);
    expect(sink.rows[0]!.request_hash).toHaveLength(64);
  });
  it('invalid_choice retries once, then succeeds', async () => {
    const { c, calls } = client([() => resp(200, okBody('zzzz', keys.concat('zzzz'))), () => resp(200, okBody('d2d4', keys))]);
    const mv = await new ModelPlayer({ client: c, sink: memSink(), model: 'm', arm: 'clean', seed: 1 }).move(ctx());
    expect(mv.uci).toBe('d2d4'); expect(calls()).toBe(2);
  });
  it('second identical request is a cache hit: no HTTP call, cost 0', async () => {
    const { c, calls } = client([() => resp(200, okBody('e2e4', keys))]);
    const sink = memSink(); const p = new ModelPlayer({ client: c, sink, model: 'm', arm: 'clean', seed: 1 });
    await p.move(ctx()); const mv = await p.move(ctx());
    expect(calls()).toBe(1); expect(mv.cost_usd).toBe(0); expect(mv.decision!.cache_hit).toBe(true); expect(sink.rows[1]!.cache_hit).toBe(true);
  });
  it('image arm renders the board and sends an image message', async () => {
    const { c } = client([() => resp(200, okBody('e2e4', keys))]);
    const sink = memSink(); const rendered: string[] = [];
    const mv = await new ModelPlayer({
      client: c, sink, model: 'm', arm: 'image', seed: 1,
      renderImage: async (fen) => { rendered.push(fen); return 'data:image/png;base64,AAAA'; },
    }).move(ctx());
    expect(mv.uci).toBe('e2e4');
    expect(rendered).toEqual([START_FEN]);
    expect(sink.rows[0]!.interface).toBe('image');
    expect(sink.rows[0]!.request_json).toContain('image_url');
    expect(sink.rows[0]!.request_json).toContain('data:image/png;base64,AAAA');
  });
  it('transport failure after retries throws (the game pauses)', async () => {
    const { c } = client([() => resp(502, {})]);
    await expect(new ModelPlayer({ client: c, sink: memSink(), model: 'm', arm: 'clean', seed: 1 }).move(ctx())).rejects.toThrow(/HTTP 502/);
  });
});

describe('budget and mock', () => {
  it('estimate formula and cap boundary', () => {
    expect(estimateCallUsd(20, 0.042)).toBeCloseTo(((400 + 45 * 20) / 1e6) * 0.042, 12);
    const est = estimateCallUsd(20, 0.042);
    const b = gameBudget({ capUsd: est, pricePerMInput: 0.042 });
    expect(b.check({ ...game(), cost_usd: 0 }).ok).toBe(true);        // spent + est == cap allowed
    expect(b.check({ ...game(), cost_usd: 1e-9 }).ok).toBe(false);    // > cap not allowed
  });
  it('image arm adds 600 input tokens per estimated call', () => {
    const models: ModelInfo[] = [{
      slug: 'm', canonical_slug: null, name: 'm', context_length: 100_000,
      price_in_per_m: 1, input_modalities: ['text', 'image'], roster: true, disabled_reason: null,
    }];
    const clean = estimateGame(game().config, models);
    const image = estimateGame({ ...game().config, white: { type: 'model', model: 'm', arm: 'image' } }, models);
    expect(image.est_input_tokens - clean.est_input_tokens).toBe(600 * clean.calls);
    expect(image.breakdown[0]!.arm).toBe('image');
  });
  it('mock player is deterministic and plays a whole game with the core stepper', async () => {
    const mk = () => new MockPlayer({ seed: 7 });
    const a = await mk().move(ctx()), b = await mk().move(ctx());
    expect(a.uci).toBe(b.uci);
    const white = new MockPlayer({ seed: 1 }), black = new MockPlayer({ seed: 2 });
    const ports: Ports = {
      player: (s) => (s === 'white' ? white : black),
      judge: { async oracle(fen) { return { depth: 1, sf_version: 'f', rows: legalMoves(fen).map((m) => ({ uci: m.uci, san: m.san, cp: 0, wp: 50, wdl: [0, 1000, 0] as [number, number, number] })) }; }, async evalPosition() { return { cp_stm: 0, wdl_stm: [0, 1000, 0] }; } },
      store: { async saveGame() {}, async savePly() {} }, events: { emit() {} }, budget: { check: () => ({ ok: true }) }, now: () => '',
    };
    const g = await playToEnd({ ...game(), config: { ...game().config, black: { type: 'model', model: 'm', arm: 'clean' }, max_plies: 40 } }, ports);
    expect(g.status).toBe('finished'); expect(g.plies.length).toBeGreaterThan(4);
  }, 30_000);
});
