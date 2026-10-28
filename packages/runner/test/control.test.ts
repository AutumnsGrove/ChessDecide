import { existsSync } from 'node:fs';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/d1';
import { getPlatformProxy } from 'wrangler';
import { describe, expect, it } from 'vitest';
import type { GameConfig } from '@chessdecide/core';
import * as schema from '@chessdecide/db/schema';
import { loadGame } from '@chessdecide/db';
import { EventHub } from '@chessdecide/api';
import { LocalControlPlane } from '../src/control.ts';
import { createRuntime } from '../src/runtime.ts';

const haveSf = existsSync('/usr/games/stockfish') || existsSync('/opt/homebrew/bin/stockfish') || !!process.env.STOCKFISH_PATH;
const cfg = (max: number): GameConfig => ({ white: { type: 'model', model: 'mock', arm: 'clean' }, black: { type: 'ladder', level: 'random' }, opening: { type: 'startpos' }, pace_ms: 0, budget_usd: 1, judge_depth: 6, max_plies: max, adjudicate: false, seed: 3 });

describe.skipIf(!haveSf)('LocalControlPlane (real Stockfish judge, mock model)', () => {
  async function setup() {
    const proxy = await getPlatformProxy<{ DB: D1Database }>({ configPath: fileURLToPath(new URL('../../../apps/web/wrangler.jsonc', import.meta.url)), persist: { path: mkdtempSync(join(tmpdir(), 'cd-ctl-')) } });
    const dir = fileURLToPath(new URL('../../db/migrations/', import.meta.url));
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort())
      for (const st of readFileSync(dir + f, 'utf8').split('--> statement-breakpoint')) if (st.trim()) await proxy.env.DB.exec(st.trim().replace(/\s+/g, ' '));
    const db = drizzle(proxy.env.DB, { schema }); const rt = await createRuntime(); const hub = new EventHub();
    return { db, rt, hub, cp: new LocalControlPlane(rt, db, hub, true), done: async () => { await rt.close(); await proxy.dispose(); } };
  }
  it('auto plays to max_plies and persists; events arrive in order', async () => {
    const s = await setup(); const names: string[] = [];
    const g = await s.cp.createGame(cfg(8));
    s.hub.subscribe(g.id, (e) => names.push(e.event));
    await s.cp.auto(g.id); await s.cp.idle(g.id);
    const back = (await loadGame(s.db, g.id))!;
    expect(back.status).toBe('finished'); expect(back.termination).toBe('max_plies'); expect(back.plies).toHaveLength(8);
    expect(back.plies.every((p) => p.eval)).toBe(true);
    expect(names[0]).toBe('thinking'); expect(names.at(-1)).toBe('status');
    await s.done();
  }, 60_000);
  it('step plays exactly one ply and leaves the game paused; stop aborts', async () => {
    const s = await setup();
    const g = await s.cp.createGame(cfg(40));
    await s.cp.step(g.id);
    let back = (await loadGame(s.db, g.id))!;
    expect(back.plies).toHaveLength(1); expect(back.status).toBe('paused');
    await s.cp.stop(g.id);
    back = (await loadGame(s.db, g.id))!;
    expect(back.status).toBe('aborted');
    await s.done();
  }, 60_000);
  it('pause stops between plies and auto resumes', async () => {
    const s = await setup();
    const g = await s.cp.createGame(cfg(30));
    await s.cp.auto(g.id, 50);
    await new Promise((r) => setTimeout(r, 300));
    await s.cp.pause(g.id);
    let back = (await loadGame(s.db, g.id))!;
    expect(back.status).toBe('paused'); const n = back.plies.length; expect(n).toBeGreaterThan(0); expect(n).toBeLessThan(30);
    await s.cp.auto(g.id, 0); await s.cp.idle(g.id);
    back = (await loadGame(s.db, g.id))!;
    expect(back.status).toBe('finished'); expect(back.plies).toHaveLength(30);
    await s.done();
  }, 90_000);
});
