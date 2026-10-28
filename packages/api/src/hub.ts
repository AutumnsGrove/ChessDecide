import type { GameEvent } from '@chessdecide/core';

/** In-memory fan-out of game events to SSE subscribers. One instance per process. */
export class EventHub {
  private subs = new Map<string, Set<(e: GameEvent) => void>>();
  emit(gameId: string, e: GameEvent) { this.subs.get(gameId)?.forEach((f) => f(e)); }
  subscribe(gameId: string, f: (e: GameEvent) => void): () => void {
    let s = this.subs.get(gameId); if (!s) this.subs.set(gameId, (s = new Set()));
    s.add(f);
    return () => { s!.delete(f); if (s!.size === 0) this.subs.delete(gameId); };
  }
}
