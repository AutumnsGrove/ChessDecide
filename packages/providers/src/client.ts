/** OpenRouter Decisions HTTP client: retry, per-model concurrency, rate limit. Spec: docs/PROMPTS.md §7–§9. */
export const DECISIONS_URL = 'https://openrouter.ai/api/alpha/decisions';

export interface HttpResult { status: number; json: any; latencyMs: number; headers: Record<string, string> }
export interface CallOutcome extends HttpResult { attempts: HttpResult[]; retries: number }

export interface ClientOptions {
  apiKey: string;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;                       // ms
  rng?: () => number;                       // jitter in [0,1)
  url?: string;
  timeoutMs?: number;                       // default 60_000
  maxConcurrency?: number;                  // per model, default 2
  maxRps?: number;                          // per model, default 4
  backoffMs?: number[];                     // default [1000, 2000, 4000]
}

class Gate {
  private active = 0;
  private waiters: Array<() => void> = [];
  private lastStart = 0;
  limit: number;
  private reducedUntil = 0;
  constructor(private base: number, private minGapMs: number, private now: () => number, private sleep: (ms: number) => Promise<void>) { this.limit = base; }
  async acquire() {
    while (this.active >= this.effectiveLimit()) await new Promise<void>((r) => this.waiters.push(r));
    this.active++;
    const wait = this.lastStart + this.minGapMs - this.now();
    this.lastStart = Math.max(this.now(), this.lastStart + this.minGapMs);
    if (wait > 0) await this.sleep(wait);
  }
  release() { this.active--; this.waiters.shift()?.(); }
  /** 429: halve concurrency (min 1) for 60 s. */
  throttle() { this.reducedUntil = this.now() + 60_000; }
  effectiveLimit() { return this.now() < this.reducedUntil ? Math.max(1, Math.floor(this.base / 2)) : this.base; }
}

export class DecisionsClient {
  private gates = new Map<string, Gate>();
  private f: typeof fetch; private sleep: (ms: number) => Promise<void>; private now: () => number; private rng: () => number;
  constructor(private o: ClientOptions) {
    this.f = o.fetch ?? fetch;
    this.sleep = o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.now = o.now ?? (() => Date.now());
    this.rng = o.rng ?? Math.random;
  }
  private gate(model: string) {
    let g = this.gates.get(model);
    if (!g) { g = new Gate(this.o.maxConcurrency ?? 2, 1000 / (this.o.maxRps ?? 4), this.now, this.sleep); this.gates.set(model, g); }
    return g;
  }

  /** One HTTP call, no retry. Network errors and timeouts become status 0. */
  private async once(model: string, bodyJson: string, signal?: AbortSignal): Promise<HttpResult> {
    const t0 = this.now();
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), this.o.timeoutMs ?? 60_000);
    const onAbort = () => ctl.abort();
    if (signal?.aborted) ctl.abort(); else signal?.addEventListener('abort', onAbort, { once: true });
    try {
      const r = await this.f(this.o.url ?? DECISIONS_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.o.apiKey}`, 'Content-Type': 'application/json', 'X-Title': 'ChessDecide' },
        body: bodyJson, signal: ctl.signal,
      });
      const text = await r.text();
      let json: any; try { json = JSON.parse(text); } catch { json = { bad_json: text.slice(0, 200) }; }
      const headers: Record<string, string> = {}; r.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
      return { status: r.status, json, latencyMs: this.now() - t0, headers };
    } catch (e) {
      return { status: 0, json: { network_error: String(e) }, latencyMs: this.now() - t0, headers: {} };
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); }
  }

  /**
   * Retries 429, 5xx and network errors with backoff 1 s, 2 s, 4 s (+-20 % jitter, Retry-After wins). Other 4xx: no retry.
   * An aborted `signal` cancels the in-flight request and ends the call without further retries.
   */
  async call(model: string, bodyJson: string, signal?: AbortSignal): Promise<CallOutcome> {
    const backoff = this.o.backoffMs ?? [1000, 2000, 4000];
    const attempts: HttpResult[] = [];
    const gate = this.gate(model);
    for (let i = 0; ; i++) {
      await gate.acquire();
      let r: HttpResult;
      try { r = await this.once(model, bodyJson, signal); } finally { gate.release(); }
      attempts.push(r);
      const retryable = r.status === 0 || r.status === 429 || r.status >= 500;
      if (r.status === 429) gate.throttle();
      if (!retryable || signal?.aborted || i >= backoff.length) return { ...r, attempts, retries: i };
      const ra = Number(r.headers['retry-after']);
      const base = Number.isFinite(ra) && ra > 0 ? ra * 1000 : backoff[i]!;
      await this.sleep(base * (0.8 + 0.4 * this.rng()));
    }
  }
}
