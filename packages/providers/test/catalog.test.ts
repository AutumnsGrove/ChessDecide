import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CATALOG_URL, createCatalog, parseCatalog } from '../src/catalog.ts';

const fixture = (): unknown => JSON.parse(readFileSync(new URL('./fixtures/openrouter-models-decisions.json', import.meta.url), 'utf8'));

describe('parseCatalog', () => {
  it('parses the fixture into 32 models', () => {
    expect(parseCatalog(fixture())).toHaveLength(32);
  });

  it('marks the roster and prices per million input tokens', () => {
    const models = parseCatalog(fixture());
    const jev = models.find((m) => m.slug === 'typesafe/jev-1.14')!;
    expect(jev.roster).toBe(true);
    expect(jev.price_in_per_m).toBeCloseTo(0.042, 12);
    expect(jev.context_length).toBe(262144);
    expect(jev.disabled_reason).toBeNull();
    expect(models.find((m) => m.slug === 'liquid/d1-ultra')!.roster).toBe(true);
  });

  it('flags a zero context window instead of hiding the model', () => {
    const lite = parseCatalog(fixture()).find((m) => m.slug === 'respan/span-01-lite')!;
    expect(lite.disabled_reason).toBe('Context window too small for a full move list');
  });

  it('sorts roster first in roster order, then price ascending, then slug', () => {
    const models = parseCatalog(fixture());
    expect(models.slice(0, 2).map((m) => m.slug)).toEqual(['typesafe/jev-1.14', 'liquid/d1-ultra']);
    const rest = models.slice(2);
    for (let i = 1; i < rest.length; i++) {
      const a = rest[i - 1]!, b = rest[i]!;
      expect(a.price_in_per_m < b.price_in_per_m || (a.price_in_per_m === b.price_in_per_m && a.slug < b.slug)).toBe(true);
    }
    expect(rest[0]!.slug).toBe('baseten/elephant-1:free');
  });

  it('rejects a malformed payload', () => {
    expect(() => parseCatalog({})).toThrow(/bad catalog response/);
  });
});

describe('createCatalog', () => {
  it('caches for the ttl so a second call does not fetch', async () => {
    let calls = 0;
    const f = (async (url: string | URL | Request) => {
      expect(String(url)).toBe(CATALOG_URL);
      calls++;
      return new Response(JSON.stringify(fixture()), { status: 200 });
    }) as unknown as typeof fetch;
    const catalog = createCatalog({ fetch: f, now: () => 1000 });
    expect(await catalog.list()).toHaveLength(32);
    expect(await catalog.list()).toHaveLength(32);
    expect(calls).toBe(1);
  });

  it('refetches after the ttl expires', async () => {
    let calls = 0; let now = 0;
    const f = (async () => { calls++; return new Response(JSON.stringify(fixture()), { status: 200 }); }) as unknown as typeof fetch;
    const catalog = createCatalog({ fetch: f, ttlMs: 10, now: () => now });
    await catalog.list();
    now = 11;
    await catalog.list();
    expect(calls).toBe(2);
  });

  it('throws on a non-OK response', async () => {
    const f = (async () => new Response('nope', { status: 502 })) as unknown as typeof fetch;
    const catalog = createCatalog({ fetch: f });
    await expect(catalog.list()).rejects.toThrow(/HTTP 502/);
  });
});
