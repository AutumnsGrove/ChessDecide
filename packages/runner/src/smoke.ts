import { eq } from 'drizzle-orm';
import { games, plies } from '@chessdecide/db/schema';
import { openLocalDb } from './d1.ts';

const { db, close } = await openLocalDb();
await db.insert(games).values({ id: 'smoke', status: 'ready', config_json: '{}', white_player: '{}', black_player: '{}', start_fen: 'x', created_at: new Date().toISOString() }).onConflictDoNothing();
await db.insert(plies).values({ game_id: 'smoke', ply: 1, san: 'e4' }).onConflictDoNothing();
console.log(await db.select().from(plies).where(eq(plies.game_id, 'smoke')));
await close();
