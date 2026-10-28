/**
 * OpenRouter model catalog for decision models. Public endpoint, no key needed.
 * Spec: docs/API.md §3.1 (`GET /api/models`).
 */

export const ROSTER = ['typesafe/jev-1.14', 'liquid/d1-ultra'] as const;

export const CATALOG_URL = 'https://openrouter.ai/api/v1/models?output_modalities=decisions';

export interface ModelInfo {
  slug: string;                 // `id` in the response, e.g. "typesafe/jev-1.14"
  canonical_slug: string | null;
  name: string | null;
  context_length: number;
  price_in_per_m: number;       // Number(pricing.prompt) * 1e6
  input_modalities: string[];
  roster: boolean;              // slug in ROSTER
  disabled_reason: string | null;
}

/** Never hides a model: only flags the ones that cannot take our request. */
function disabledReason(contextLength: number, modalities: string[]): string | null {
  if (contextLength === 0 || contextLength < 8192) return 'Context window too small for a full move list';
  if (!modalities.includes('text')) return 'Does not accept text';
  return null;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** Pure parser. Sorts roster first (in ROSTER order), then price ascending, then slug. */
export function parseCatalog(json: unknown): ModelInfo[] {
  const data = (json as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) throw new Error('bad catalog response: expected { data: [] }');
  const models = data.map((raw): ModelInfo => {
    const m = raw as Record<string, any>;
    const slug = typeof m.id === 'string' ? m.id : '';
    const context_length = num(m.context_length);
    const input_modalities: string[] = Array.isArray(m.architecture?.input_modalities)
      ? m.architecture.input_modalities.filter((x: unknown): x is string => typeof x === 'string')
      : [];
    return {
      slug,
      canonical_slug: str(m.canonical_slug),
      name: str(m.name),
      context_length,
      price_in_per_m: Number(m.pricing?.prompt ?? 0) * 1e6,
      input_modalities,
      roster: (ROSTER as readonly string[]).includes(slug),
      disabled_reason: disabledReason(context_length, input_modalities),
    };
  });
  const rank = (m: ModelInfo) => (ROSTER as readonly string[]).indexOf(m.slug);
  return models.sort((a, b) => {
    const ra = rank(a), rb = rank(b);
    if (ra >= 0 || rb >= 0) {
      if (ra >= 0 && rb >= 0) return ra - rb;
      return ra >= 0 ? -1 : 1;
    }
    return a.price_in_per_m - b.price_in_per_m || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);
  });
}

export interface Catalog {
  list(): Promise<ModelInfo[]>;
}

export interface CatalogOptions {
  fetch?: typeof fetch;
  ttlMs?: number;               // default 1 h
  now?: () => number;
}

/** Cached catalog client. Concurrent callers share one in-flight request. */
export function createCatalog(opts: CatalogOptions = {}): Catalog {
  const f = opts.fetch ?? fetch;
  const ttlMs = opts.ttlMs ?? 3_600_000;
  const now = opts.now ?? (() => Date.now());
  let cached: { at: number; models: ModelInfo[] } | undefined;
  let inflight: Promise<ModelInfo[]> | undefined;

  return {
    async list(): Promise<ModelInfo[]> {
      if (cached && now() - cached.at < ttlMs) return cached.models;
      if (!inflight) {
        inflight = (async () => {
          const r = await f(CATALOG_URL);
          if (!r.ok) throw new Error(`catalog fetch failed: HTTP ${r.status}`);
          const models = parseCatalog(await r.json());
          cached = { at: now(), models };
          return models;
        })().finally(() => { inflight = undefined; });
      }
      return inflight;
    },
  };
}
