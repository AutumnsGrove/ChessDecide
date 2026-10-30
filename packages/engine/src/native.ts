import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import type { Engine, SearchLine, SearchRequest, SearchResult } from './engine.ts';
import { parseInfo } from './uci-parse.ts';

export interface NativeOptions {
  path: string;                                  // binary path
  id?: string;                                   // default "stockfish"
  options?: Record<string, string | number | boolean>;   // set once at start, e.g. Threads, Hash, UCI_ShowWDL
  searchTimeoutMs?: number;                      // default 60_000
}

/** One UCI process. Not safe for concurrent searches: use a pool (see JudgePool). */
export class NativeUciEngine implements Engine {
  readonly id: string;
  private proc!: ChildProcessWithoutNullStreams;
  private lines: string[] = [];
  private waiters: Array<() => void> = [];
  private idName = '';
  private applied = new Map<string, string>();
  private busy = false;
  private closed = false;
  private poisoned = false;                        // timed out mid-search: its output can no longer be trusted
  constructor(private opts: NativeOptions) { this.id = opts.id ?? 'stockfish'; }

  static async start(opts: NativeOptions): Promise<NativeUciEngine> {
    const e = new NativeUciEngine(opts);
    await e.boot();
    return e;
  }

  private async boot(): Promise<void> {
    this.lines = []; this.applied.clear(); this.poisoned = false;
    this.proc = spawn(this.opts.path, [], { stdio: ['pipe', 'pipe', 'pipe'] });
    this.proc.on('exit', () => this.wake());
    this.proc.stderr.resume();
    this.proc.stdin.on('error', () => { /* EPIPE after a crash: detected via dead() */ });
    createInterface({ input: this.proc.stdout }).on('line', (l) => { this.lines.push(l); this.wake(); });
    this.send('uci');
    const ident = await this.readUntil((l) => l === 'uciok');
    this.idName = ident.find((l) => l.startsWith('id name '))?.slice(8) ?? 'unknown';
    for (const [k, v] of Object.entries(this.opts.options ?? {})) await this.setOption(k, v);
    await this.ready();
  }

  private dead() { return this.poisoned || this.proc.exitCode !== null || this.proc.signalCode !== null; }
  private wake() { const w = this.waiters; this.waiters = []; w.forEach((f) => f()); }
  private send(cmd: string) { this.proc.stdin.write(cmd + '\n'); }

  private async readUntil(done: (line: string) => boolean, timeoutMs = this.opts.searchTimeoutMs ?? 60_000): Promise<string[]> {
    const seen: string[] = [];
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      while (this.lines.length) {
        const l = this.lines.shift()!;
        seen.push(l);
        if (done(l)) return seen;
      }
      if (this.dead()) throw new Error('engine process exited');
      const left = deadline - Date.now();
      if (left <= 0) {
        // A late `bestmove` would be read as the answer to the next search: discard the process instead.
        this.poisoned = true; this.proc.kill('SIGKILL');
        throw new Error('engine timeout');
      }
      await new Promise<void>((res) => { const t = setTimeout(res, left); this.waiters.push(() => { clearTimeout(t); res(); }); });
    }
  }

  private async setOption(name: string, value: string | number | boolean) {
    const v = String(value);
    if (this.applied.get(name) === v) return;
    this.send(`setoption name ${name} value ${v}`);
    this.applied.set(name, v);
  }
  private async ready() { this.send('isready'); await this.readUntil((l) => l === 'readyok'); }

  async version(): Promise<string> { return this.idName; }

  async search(req: SearchRequest): Promise<SearchResult> {
    if (this.busy) throw new Error('NativeUciEngine is single-flight');
    this.busy = true;
    try {
      return await this.searchOnce(req).catch(async (err) => {
        if (this.closed || !this.dead()) throw err;   // retry only if the process died
        await this.boot();
        return this.searchOnce(req);
      });
    } finally { this.busy = false; }
  }

  private async searchOnce(req: SearchRequest): Promise<SearchResult> {
    for (const [k, v] of Object.entries({ MultiPV: req.multipv ?? 1, ...(req.options ?? {}) })) await this.setOption(k, v);
    this.send('ucinewgame');
    await this.ready();
    this.send(`position fen ${req.fen}`);
    this.send(req.movetimeMs ? `go movetime ${req.movetimeMs}` : `go depth ${req.depth ?? 14}`);
    const lines = await this.readUntil((l) => l.startsWith('bestmove '));
    const best = new Map<number, SearchLine>();
    for (const l of lines) {
      const info = parseInfo(l);
      if (!info) continue;
      const cur = best.get(info.multipv);
      if (!cur || info.depth >= cur.depth) best.set(info.multipv, info);
    }
    const bm = lines[lines.length - 1]!.split(/\s+/)[1] ?? '(none)';
    return { bestUci: bm, lines: [...best.values()].sort((a, b) => a.multipv - b.multipv) };
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    try { this.send('quit'); } catch { /* ignore */ }
    await new Promise<void>((res) => { const t = setTimeout(() => { this.proc.kill('SIGKILL'); res(); }, 1000); this.proc.once('exit', () => { clearTimeout(t); res(); }); });
  }
  /** Test helper: simulate a crash. */
  kill() { this.proc.kill('SIGKILL'); }
}
