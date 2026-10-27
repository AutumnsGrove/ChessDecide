import { isTerminal, stepGame, playToEnd, type Game, type GameConfig } from '@chessdecide/core';
import type { ControlPlane, EventHub } from '@chessdecide/api';
import { loadGame, saveGame, type Db } from '@chessdecide/db';
import { buildPorts, newGame, type Runtime } from './runtime.ts';
import { eq } from 'drizzle-orm';
import { games } from '@chessdecide/db/schema';

interface Running { ac: AbortController; pause: boolean; done: Promise<void> }

/** Runs games inside this Node process. One instance per daemon. */
export class LocalControlPlane implements ControlPlane {
  private running = new Map<string, Running>();
  constructor(private rt: Runtime, private db: Db, private hub: EventHub, private mock: boolean) {}

  async createGame(config: GameConfig): Promise<Game> {
    const g = newGame(config);
    await saveGame(this.db, g);
    return g;
  }

  async auto(id: string, paceMs?: number): Promise<void> {
    if (this.running.has(id)) return;                                  // already running: idempotent
    const game = await this.mustLoad(id);
    if (isTerminal(game)) return;
    const ports = await buildPorts(this.rt, this.db, game, { mock: this.mock, events: this.hub });
    const state: Running = { ac: new AbortController(), pause: false, done: Promise.resolve() };
    this.running.set(id, state);
    state.done = playToEnd(game, ports, {
      signal: state.ac.signal, shouldPause: () => state.pause, paceMs: paceMs ?? game.config.pace_ms,
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    }).then(() => undefined, (e) => { console.error('game loop failed', id, e); })
      .finally(async () => { this.running.delete(id); await ports.closePlayers(); });
  }

  async pause(id: string): Promise<void> { const r = this.running.get(id); if (r) { r.pause = true; await r.done; } }

  async step(id: string): Promise<void> {
    if (this.running.has(id)) return;                                  // a running game cannot be stepped
    const game = await this.mustLoad(id);
    if (isTerminal(game)) return;
    const ports = await buildPorts(this.rt, this.db, game, { mock: this.mock, events: this.hub });
    try {
      await ports.store.saveGame({ ...game, status: game.status === 'ready' ? 'paused' : game.status });
      await stepGame({ ...game, status: 'paused' }, ports);
    } finally { await ports.closePlayers(); }
  }

  async stop(id: string): Promise<void> {
    const r = this.running.get(id);
    if (r) { r.ac.abort(); await r.done; return; }
    const g = await this.mustLoad(id);
    if (!isTerminal(g)) await saveGame(this.db, { ...g, status: 'aborted', status_reason: 'stopped', termination: 'aborted' });
  }

  /** Resolves when the game loop for `id` has finished (tests). */
  async idle(id: string) { await this.running.get(id)?.done; }

  private async mustLoad(id: string): Promise<Game> {
    const g = await loadGame(this.db, id);
    if (!g) throw new Error(`game ${id} not found`);
    return g;
  }
}

/** On start-up, games left `running` by a previous process become `paused` (reason `server_restart`). */
export async function recoverGames(db: Db): Promise<number> {
  const rows = await db.update(games).set({ status: 'paused', status_reason: 'server_restart' }).where(eq(games.status, 'running')).returning({ id: games.id });
  return rows.length;
}
