import { positions, buildRequest, oracle, legal } from './harness.ts';
const p = positions[10];
for (const arm of ['text', 'image'] as const) { const r = buildRequest('typesafe/jev-1.14', p, arm); console.log(arm, 'bytes', JSON.stringify(r).length, 'options', Object.keys((r.questions.move as any).criteria).length); }
console.log('positions', positions.length, 'legal counts', positions.map(x => legal(x.fen).length).join(','));
const t = performance.now(); const o = await oracle(p.fen); console.log('oracle ms', Math.round(performance.now() - t), 'best', o.best);
