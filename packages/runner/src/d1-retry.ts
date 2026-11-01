/**
 * Retry reads on a dropped miniflare socket.
 *
 * Long synchronous work (the bench report recomputes Elo for every cell, ~25 s on a 38-series run) blocks the
 * event loop; workerd closes the idle keep-alive connection meanwhile, and the next query reuses the dead
 * socket: `TypeError: fetch failed` <- `SocketError: other side closed` (UND_ERR_SOCKET). A retry opens a
 * fresh connection. Only reads are retried: a write that failed this way may or may not have been applied.
 */

const SOCKET_ERROR = /fetch failed|other side closed|UND_ERR_SOCKET|ECONNRESET|EPIPE/i;
const READ_SQL = /^\s*(select|with|pragma)\b/i;
const READ_METHODS = new Set(['first', 'all', 'raw', 'run']);

export interface RetryOptions { retries?: number; delayMs?: number }

export function isSocketError(e: unknown): boolean {
  for (let x: unknown = e, depth = 0; x && depth < 6; x = (x as { cause?: unknown }).cause, depth++) {
    const err = x as { message?: unknown; code?: unknown };
    if (SOCKET_ERROR.test(String(err.message ?? '')) || SOCKET_ERROR.test(String(err.code ?? ''))) return true;
  }
  return false;
}

export function withSocketRetry(db: D1Database, opts: RetryOptions = {}): D1Database {
  const retries = opts.retries ?? 3;
  const delayMs = opts.delayMs ?? 300;
  const originals = new WeakMap<object, D1PreparedStatement>();
  const reads = new WeakSet<object>();

  const attempt = async <T>(fn: () => Promise<T>): Promise<T> => {
    for (let i = 0; ; i++) {
      try { return await fn(); }
      catch (e) {
        if (i >= retries || !isSocketError(e)) throw e;
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  };

  const wrap = (stmt: D1PreparedStatement, isRead: boolean): D1PreparedStatement => {
    const proxy: D1PreparedStatement = new Proxy(stmt, {
      get(target, prop) {
        const value = Reflect.get(target, prop) as unknown;
        if (prop === 'bind') return (...args: unknown[]) => wrap((value as (...a: unknown[]) => D1PreparedStatement).apply(target, args), isRead);
        if (typeof value !== 'function') return value;
        if (isRead && READ_METHODS.has(prop as string)) return (...args: unknown[]) => attempt(() => (value as (...a: unknown[]) => Promise<unknown>).apply(target, args));
        return value.bind(target);
      },
    });
    originals.set(proxy, stmt);
    if (isRead) reads.add(proxy);
    return proxy;
  };

  return new Proxy(db, {
    get(target, prop) {
      const value = Reflect.get(target, prop) as unknown;
      if (prop === 'prepare') return (sql: string) => wrap(target.prepare(sql), READ_SQL.test(sql));
      if (prop === 'batch') {
        return (statements: D1PreparedStatement[]) => {
          const raw = statements.map((s) => originals.get(s) ?? s);
          const run = () => target.batch(raw);
          return statements.every((s) => reads.has(s)) ? attempt(run) : run();
        };
      }
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
