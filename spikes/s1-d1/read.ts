import { getPlatformProxy } from 'wrangler';
const { env, dispose } = await getPlatformProxy({ persist: { path: '.wrangler/state' } });
const DB = (env as any).DB;
let t = performance.now();
console.log(await DB.prepare('select count(*) c from plies').first(), 'new process read ms', Math.round(performance.now() - t));
t = performance.now();
for (let i = 0; i < 50; i++) await DB.prepare('insert into plies (game_id,ply,san) values (?,?,?)').bind('g1', 20000 + i, 'e4').run();
console.log('50 single inserts ms', Math.round(performance.now() - t));
await dispose();
