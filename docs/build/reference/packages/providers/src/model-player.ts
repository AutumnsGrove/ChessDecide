import {
  ARM_PRESETS, PROMPT_VERSION, build, parse, ParseError, requestHash, type Arm, type ArmName, type Decision,
  type MoveContext, type OptionProb, type Player, type PlayerMove,
} from '@chessdecide/core';
import type { DecisionsClient, HttpResult } from './client.ts';

export interface AttemptRow {
  purpose: 'game' | 'ladder' | 'probe';
  game_id?: string; ply?: number; series_id?: string;
  model_slug: string; returned_model?: string; provider?: string;
  arm_id: string; interface: string; key_format: string; descriptor: string; state_variant: string; template: string;
  prompt_version: number; repeat: number; seed: number; order_json: string;
  request_hash: string; request_bytes: number; cache_hit: boolean; retry_of?: number;
  status: 'ok' | 'error'; http_status?: number; error_code?: string; error?: string;
  pick_key?: string; pick_uci?: string; pick_san?: string; p_pick?: number; confidence?: number;
  probs_json?: string; prob_sum?: number;
  latency_ms: number; input_tokens?: number | null; output_tokens?: number | null; cost_usd?: number | null;
  request_json?: string; response_json?: string;        // sink stores gzip locally; never published
}
export interface AttemptSink {
  record(row: AttemptRow): Promise<number>;            // returns attempt id
  findCached(requestHash: string): Promise<{ response: any } | undefined>;
}

export interface ModelPlayerDeps {
  client: DecisionsClient; sink: AttemptSink;
  model: string; arm: ArmName | Arm;
  seed: number;                                          // for shuffle ordering and logging
  repeat?: number;
  renderImage?: (fen: string) => Promise<string>;        // data URL; required for the image arm
}

export class ModelPlayer implements Player {
  readonly kind = 'model' as const;
  private arm: Arm; private armId: string;
  constructor(private d: ModelPlayerDeps) {
    this.arm = typeof d.arm === 'string' ? ARM_PRESETS[d.arm] : d.arm;
    this.armId = typeof d.arm === 'string' ? d.arm : 'custom';
  }

  async move(ctx: MoveContext): Promise<PlayerMove> {
    const d = this.d, arm = this.arm;
    const imageDataUrl = arm.interface === 'image' ? await d.renderImage!(ctx.fen) : undefined;
    const built = build({ model: d.model, position: { fen: ctx.fen, historySan: ctx.historySan }, legal: ctx.legal, arm, ...(imageDataUrl ? { imageDataUrl } : {}) });
    const repeat = d.repeat ?? 0;
    const hash = await requestHash(d.model, built.json, repeat);
    const base = {
      purpose: 'game' as const, game_id: ctx.game.id, ply: ctx.ply, ...(ctx.game.series_id ? { series_id: ctx.game.series_id } : {}),
      model_slug: d.model, arm_id: this.armId, interface: arm.interface, key_format: arm.key_format, descriptor: arm.descriptor,
      state_variant: arm.state_variant, template: arm.template, prompt_version: PROMPT_VERSION, repeat, seed: d.seed,
      order_json: JSON.stringify(built.order), request_hash: hash, request_bytes: built.json.length,
    };

    let spent = 0, retries = 0, lastErr: ParseError | undefined;
    for (let parseTry = 0; parseTry < 2; parseTry++) {          // invalid_choice: retry once
      let resp: any, http: HttpResult | undefined, cacheHit = false, attemptId = 0;
      const cached = parseTry === 0 ? await d.sink.findCached(hash) : undefined;
      if (cached) {
        resp = cached.response; cacheHit = true;
        attemptId = await d.sink.record({ ...base, cache_hit: true, status: 'ok', latency_ms: 0, cost_usd: 0, response_json: JSON.stringify(resp) });
      } else {
        const out = await d.client.call(d.model, built.json);
        retries += out.retries;
        let prev: number | undefined;
        for (const a of out.attempts) {                          // every HTTP call is its own row
          const ok = a.status === 200;
          prev = await d.sink.record({
            ...base, cache_hit: false, ...(prev ? { retry_of: prev } : {}), status: ok ? 'ok' : 'error', http_status: a.status,
            ...(ok ? {} : { error_code: a.status === 0 ? 'network' : `http_${a.status}`, error: JSON.stringify(a.json).slice(0, 300) }),
            latency_ms: a.latencyMs, input_tokens: a.json?.usage?.input_tokens ?? null, output_tokens: a.json?.usage?.output_tokens ?? null,
            cost_usd: ok ? (a.json?.usage?.cost ?? null) : null, ...(ok ? { response_json: JSON.stringify(a.json) } : {}),
          });
        }
        attemptId = prev!; http = out;
        if (out.status !== 200) throw new Error(`decisions call failed: HTTP ${out.status} ${JSON.stringify(out.json).slice(0, 200)}`);
        resp = out.json;
        spent += typeof resp?.usage?.cost === 'number' ? resp.usage.cost : 0;
      }
      try {
        const p = parse(resp, built.keyToUci);
        const probs = p.probs;
        const top: OptionProb[] = ctx.legal
          .map((m) => ({ uci: m.uci, san: m.san, p: probs?.[m.uci] ?? 0 }))
          .sort((a, b) => b.p - a.p).slice(0, 8);
        if (!top.some((o) => o.uci === p.pickUci)) {
          const m = ctx.legal.find((x) => x.uci === p.pickUci)!;
          top.push({ uci: m.uci, san: m.san, p: probs?.[m.uci] ?? 0 });
        }
        const decision: Decision = {
          model_slug: d.model, ...(p.returnedModel ? { returned_model: p.returnedModel } : {}), ...(p.provider ? { provider: p.provider } : {}),
          arm: this.armId, pick_uci: p.pickUci, ...(p.pPick !== undefined ? { p_pick: p.pPick } : {}),
          ...(p.confidence !== undefined ? { confidence: p.confidence } : {}), n_options: ctx.legal.length, top_options: top,
          ...(p.probSum !== undefined ? { prob_sum: p.probSum } : {}), latency_ms: http?.latencyMs ?? 0,
          usage: { input_tokens: p.usage.input_tokens ?? 0, output_tokens: p.usage.output_tokens ?? 0, cost_usd: cacheHit ? 0 : p.usage.cost_usd },
          cache_hit: cacheHit, retries, attempt_id: attemptId,
        };
        return { uci: p.pickUci, decision, ...(probs ? { probs } : {}), cost_usd: spent };
      } catch (e) {
        if (e instanceof ParseError && e.code === 'invalid_choice' && parseTry === 0) { lastErr = e; continue; }
        throw e;
      }
    }
    throw lastErr!;
  }
}
