import { getPlatformProxy } from 'wrangler';
import { drizzle } from 'drizzle-orm/d1';
import { games, plies } from './schema';
import { readFileSync, readdirSync } from 'node:fs';
const { env, dispose } = await getPlatformProxy({ persist: { path: '.wrangler/state' } });
const DB = (env as any).DB;
for (const f of readdirSync('migrations').filter(f => f.endsWith('.sql')).sort()) {
  for (const stmt of readFileSync('migrations/' + f, 'utf8').split('--> statement-breakpoint')) { const s = stmt.trim(); if (s) await DB.exec(s.replace(/\s+/g, ' ')).catch((e: any) => { if (!/already exists/.test(String(e))) throw e; }); }
}
const db = drizzle(DB);
await db.insert(games).values({ id: 'g1', status: 'running', config_json: '{}' }).onConflictDoNothing();
const rows = Array.from({ length: 10000 }, (_, i) => ({ game_id: 'g1', ply: i + 1, san: 'e4', fen_after: 'x'.repeat(80), decision_json: '{"a":1}'.repeat(30), cost: 0.0001 }));
let t = performance.now();
// D1 caps bound params (100/stmt); batch chunks of 10 rows (6 cols)
const chunks = []; for (let i = 0; i < rows.length; i += 10) chunks.push(db.insert(plies).values(rows.slice(i, i + 10)).onConflictDoNothing());
for (let i = 0; i < chunks.length; i += 100) await db.batch(chunks.slice(i, i + 100) as any);
console.log('insert 10k ply rows ms', Math.round(performance.now() - t));
t = performance.now();
const r = await DB.prepare('select count(*) c, sum(cost) s from plies').first();
console.log('read', r, 'ms', Math.round(performance.now() - t));
await dispose();
