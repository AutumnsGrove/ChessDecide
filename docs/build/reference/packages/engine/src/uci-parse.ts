import type { SearchLine } from './engine.ts';

/** Parse one `info ...` line. Returns null for lines without depth+score (e.g. `info string ...`, `currmove`). */
export function parseInfo(line: string): SearchLine | null {
  if (!line.startsWith('info ')) return null;
  const t = line.split(/\s+/);
  const out: SearchLine = { multipv: 1, depth: 0, pv: [] };
  let hasScore = false;
  for (let i = 1; i < t.length; i++) {
    switch (t[i]) {
      case 'depth': out.depth = Number(t[++i]); break;
      case 'multipv': out.multipv = Number(t[++i]); break;
      case 'score': {
        const kind = t[++i], val = Number(t[++i]);
        if (kind === 'cp') { out.cp = val; hasScore = true; }
        else if (kind === 'mate') { out.mate = val; hasScore = true; }
        if (t[i + 1] === 'lowerbound' || t[i + 1] === 'upperbound') i++;   // bound flags: ignore line
        break;
      }
      case 'wdl': out.wdl = [Number(t[i + 1]), Number(t[i + 2]), Number(t[i + 3])]; i += 3; break;
      case 'pv': out.pv = t.slice(i + 1); i = t.length; break;
      case 'string': return null;
    }
  }
  if (line.includes(' lowerbound') || line.includes(' upperbound')) return null;
  return hasScore && out.depth > 0 ? out : null;
}

/** Score as clamped centipawns: mate -> +-1000. */
export function lineCp(l: SearchLine): number {
  if (l.mate !== undefined) return l.mate > 0 ? 1000 : -1000;
  return Math.max(-1000, Math.min(1000, l.cp ?? 0));
}
