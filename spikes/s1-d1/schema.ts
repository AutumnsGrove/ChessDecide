import { sqliteTable, text, integer, real, primaryKey } from 'drizzle-orm/sqlite-core';
export const games = sqliteTable('games', { id: text('id').primaryKey(), status: text('status').notNull(), config_json: text('config_json').notNull() });
export const plies = sqliteTable('plies', {
  game_id: text('game_id').notNull().references(() => games.id), ply: integer('ply').notNull(),
  san: text('san'), fen_after: text('fen_after'), decision_json: text('decision_json'), cost: real('cost'),
}, t => [primaryKey({ columns: [t.game_id, t.ply] })]);
