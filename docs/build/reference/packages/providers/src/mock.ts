import {
  applyMove, mulberry32, type Decision, type MoveContext, type Player, type PlayerMove,
} from '@chessdecide/core';

const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const CENTRE = new Set(['d4', 'e4', 'd5', 'e5']);

/** Cheap deterministic heuristic: captured value + promotion + check + centre bonus. */
export function mockScore(ctx: MoveContext, uci: string): number {
  const m = ctx.legal.find((x) => x.uci === uci)!;
  let s = 0;
  if (m.captured) s += VALUE[m.captured]!;
  if (m.promo) s += VALUE[m.promo]! - 1;
  if (m.check) s += 0.5;
  if (m.mate) s += 20;
  if (CENTRE.has(m.to)) s += 0.4;
  return s;
}

export interface MockOptions {
  seed: number; temperature?: number; latencyMs?: number;
  failRate?: number;                         // injected transport failures, reproducible by seed
  priceInPerM?: number;                      // default 0.042
  sleep?: (ms: number) => Promise<void>;
}

export class MockPlayer implements Player {
  readonly kind = 'model' as const;
  private rng: () => number;
  constructor(private o: MockOptions) { this.rng = mulberry32(o.seed); }
  async move(ctx: MoveContext): Promise<PlayerMove> {
    const o = this.o, T = o.temperature ?? 1;
    if (o.latencyMs && o.sleep) await o.sleep(o.latencyMs);
    if (o.failRate && this.rng() < o.failRate) throw new Error('mock: injected upstream 502');
    const scores = ctx.legal.map((m) => mockScore(ctx, m.uci));
    const max = Math.max(...scores);
    const w = scores.map((s) => Math.exp((s - max) / T));
    const sum = w.reduce((a, b) => a + b, 0);
    const probs: Record<string, number> = {};
    ctx.legal.forEach((m, i) => { probs[m.uci] = w[i]! / sum; });
    // sample with the seeded rng, so the pick is deterministic given (seed, call order)
    let r = this.rng(), pick = ctx.legal[ctx.legal.length - 1]!.uci;
    for (const m of ctx.legal) { r -= probs[m.uci]!; if (r <= 0) { pick = m.uci; break; } }
    const tokens = 400 + 45 * ctx.legal.length;
    const cost = (tokens / 1e6) * (o.priceInPerM ?? 0.042);
    const top = [...ctx.legal].sort((a, b) => probs[b.uci]! - probs[a.uci]!).slice(0, 8).map((m) => ({ uci: m.uci, san: m.san, p: probs[m.uci]! }));
    if (!top.some((t) => t.uci === pick)) { const m = ctx.legal.find((x) => x.uci === pick)!; top.push({ uci: m.uci, san: m.san, p: probs[pick]! }); }
    void applyMove;
    const decision: Decision = {
      model_slug: 'mock/heuristic', arm: 'clean', pick_uci: pick, p_pick: probs[pick]!, confidence: probs[pick]!, n_options: ctx.legal.length,
      top_options: top, prob_sum: 1, latency_ms: o.latencyMs ?? 0, usage: { input_tokens: tokens, output_tokens: 0, cost_usd: cost },
      cache_hit: false, retries: 0, attempt_id: 0,
    };
    return { uci: pick, decision, probs, cost_usd: cost };
  }
}
