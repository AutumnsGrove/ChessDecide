import { positions, buildRequest } from './harness.ts';
import { decide } from './call.ts';
const p = positions[10];
for (const model of ['typesafe/jev-1.14']) for (const arm of ['text', 'image'] as const) {
  const r = await decide(buildRequest(model, p, arm));
  const a = r.json.answers?.move;
  console.log(model, arm, r.status, r.ms + 'ms', a ? `${a.choice} p=${a.probabilities?.[a.choice]} conf=${a.confidence}` : JSON.stringify(r.json).slice(0, 300), JSON.stringify(r.json.usage));
}
