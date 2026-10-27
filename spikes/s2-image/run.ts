import { positions, buildRequest, oracle } from './harness.ts';
import { decide } from './call.ts';
import { existsSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
const models = process.argv.slice(2);
let orc: Record<string, any> = existsSync('oracle.json') ? JSON.parse(readFileSync('oracle.json', 'utf8')) : {};
for (const p of positions) if (!orc[p.fen]) { orc[p.fen] = await oracle(p.fen, 10); writeFileSync('oracle.json', JSON.stringify(orc)); }
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
async function one(model: string, arm: 'text' | 'image', pos: any) {
  const body = buildRequest(model, pos, arm);
  for (let a = 0; a < 4; a++) {
    const r = await decide(body);
    if (r.status === 429 || r.status >= 500) { await sleep(1000 * 2 ** a); continue; }
    const ans = r.json.answers?.move; const o = orc[pos.fen];
    const row: any = { model, arm, ply: pos.ply, status: r.status, ms: r.ms, usage: r.json.usage, n_opts: Object.keys(body.questions.move.criteria).length };
    if (ans) { row.pick = ans.choice; row.p = ans.probabilities?.[ans.choice]; row.cpl = o.cpl[ans.choice]; row.legal = ans.choice in o.cpl; row.returned = r.json.model; }
    else row.err = JSON.stringify(r.json).slice(0, 200);
    appendFileSync('results.jsonl', JSON.stringify(row) + '\n'); return;
  }
  appendFileSync('results.jsonl', JSON.stringify({ model, arm, ply: pos.ply, status: 'retry_exhausted' }) + '\n');
}
await Promise.all(models.map(async m => { for (const pos of positions) for (const arm of ['text', 'image'] as const) await one(m, arm, pos); console.log('done', m); }));
