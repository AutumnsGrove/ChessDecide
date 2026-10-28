/** In-memory fan-out of live events to SSE subscribers. One instance per event kind per process. */
export class EventHub<E extends { event: string; data: unknown }> {
  private subs = new Map<string, Set<(e: E) => void>>();
  emit(id: string, e: E) { this.subs.get(id)?.forEach((f) => f(e)); }
  subscribe(id: string, f: (e: E) => void): () => void {
    let s = this.subs.get(id); if (!s) this.subs.set(id, (s = new Set()));
    s.add(f);
    return () => { s!.delete(f); if (s!.size === 0) this.subs.delete(id); };
  }
}
