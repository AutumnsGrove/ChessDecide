import { describe, expect, it } from 'vitest';
import { isSocketError, withSocketRetry } from '../src/d1-retry.ts';

const socketError = () => Object.assign(new Error('Failed query'), {
  cause: Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error('other side closed'), { code: 'UND_ERR_SOCKET' }) }),
});

/** A fake D1 whose statements fail `failures` times with a dropped socket before succeeding. */
function fakeDb(failures: number) {
  const calls = { all: 0, run: 0, batch: 0 };
  let left = failures;
  const stmt = (sql: string) => {
    const s = {
      sql,
      bind: () => s,
      all: async () => { calls.all++; if (left-- > 0) throw socketError(); return { results: [sql] }; },
      first: async () => { calls.all++; if (left-- > 0) throw socketError(); return { sql }; },
      run: async () => { calls.run++; if (left-- > 0) throw socketError(); return { success: true }; },
      raw: async () => [[sql]],
    };
    return s;
  };
  const db = {
    prepare: (sql: string) => stmt(sql),
    batch: async (list: Array<{ sql: string }>) => { calls.batch++; if (left-- > 0) throw socketError(); return list.map((x) => x.sql); },
    exec: async () => ({ count: 1 }),
  };
  return { db: db as unknown as D1Database, calls };
}

describe('isSocketError', () => {
  it('finds a dropped socket anywhere in the cause chain', () => {
    expect(isSocketError(socketError())).toBe(true);
    expect(isSocketError(new Error('UNIQUE constraint failed'))).toBe(false);
    expect(isSocketError(undefined)).toBe(false);
  });
});

describe('withSocketRetry', () => {
  it('retries a read after a dropped socket', async () => {
    const { db, calls } = fakeDb(2);
    const r = await withSocketRetry(db, { delayMs: 0 }).prepare('select 1').bind(1).all();
    expect(r.results).toEqual(['select 1']);
    expect(calls.all).toBe(3);
  });

  it('gives up after the retry budget and rethrows', async () => {
    const { db, calls } = fakeDb(10);
    await expect(withSocketRetry(db, { retries: 2, delayMs: 0 }).prepare('select 1').first()).rejects.toThrow('Failed query');
    expect(calls.all).toBe(3);
  });

  it('never retries a write', async () => {
    const { db, calls } = fakeDb(1);
    await expect(withSocketRetry(db, { delayMs: 0 }).prepare('insert into t values (1)').run()).rejects.toThrow('Failed query');
    expect(calls.run).toBe(1);
  });

  it('does not retry other errors', async () => {
    const calls = { n: 0 };
    const db = { prepare: () => ({ bind() { return this; }, all: async () => { calls.n++; throw new Error('no such table'); } }) } as unknown as D1Database;
    await expect(withSocketRetry(db, { delayMs: 0 }).prepare('select * from nope').all()).rejects.toThrow('no such table');
    expect(calls.n).toBe(1);
  });

  it('unwraps statements for batch and retries an all-read batch only', async () => {
    const reads = fakeDb(1);
    const wrapped = withSocketRetry(reads.db, { delayMs: 0 });
    expect(await wrapped.batch([wrapped.prepare('select 1'), wrapped.prepare('select 2')])).toEqual(['select 1', 'select 2']);
    expect(reads.calls.batch).toBe(2);

    const mixed = fakeDb(1);
    const w2 = withSocketRetry(mixed.db, { delayMs: 0 });
    await expect(w2.batch([w2.prepare('select 1'), w2.prepare('insert into t values (1)')])).rejects.toThrow('Failed query');
    expect(mixed.calls.batch).toBe(1);
  });
});
