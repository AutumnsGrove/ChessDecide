import { index, integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/** Canonical schema. Mirrors docs/API.md §4. All JSON columns hold JSON.stringify output. */
export const series = sqliteTable('series', {
  id: text('id').primaryKey(),
  name: text('name'),
  model_slug: text('model_slug').notNull(),
  arm_id: text('arm_id').notNull(),
  arm_json: text('arm_json').notNull(),
  status: text('status').notNull(),
  status_reason: text('status_reason'),
  size_json: text('size_json').notNull(),
  ladder_mode: text('ladder_mode'),
  ladder_level: text('ladder_level'),
  ladder_version: integer('ladder_version').notNull(),
  seed: integer('seed'),
  budget_usd: real('budget_usd'),
  concurrency: integer('concurrency').default(2),
  judge_depth: integer('judge_depth').default(14),
  cost_usd: real('cost_usd').default(0),
  elo_mean: real('elo_mean'), elo_lo: real('elo_lo'), elo_hi: real('elo_hi'),
  w: integer('w').default(0), d: integer('d').default(0), l: integer('l').default(0),
  elo_history_json: text('elo_history_json'),
  blocks_json: text('blocks_json'),
  catalog_snapshot_json: text('catalog_snapshot_json'),
  created_at: text('created_at').notNull(),
  finished_at: text('finished_at'),
});

export const games = sqliteTable('games', {
  id: text('id').primaryKey(),
  status: text('status').notNull(),
  status_reason: text('status_reason'),
  config_json: text('config_json').notNull(),
  white_player: text('white_player').notNull(),
  black_player: text('black_player').notNull(),
  engine_id: text('engine_id').default('stockfish'),
  series_id: text('series_id').references(() => series.id),
  series_index: integer('series_index'),
  block_index: integer('block_index'),
  level_id: text('level_id'),
  level_elo: real('level_elo'),
  model_color: text('model_color'),
  model_score: real('model_score'),
  adjudicated: integer('adjudicated').default(0),
  start_fen: text('start_fen').notNull(),
  opening_seed: integer('opening_seed'),
  result: text('result'),
  termination: text('termination'),
  budget_usd: real('budget_usd'),
  cost_usd: real('cost_usd').default(0),
  created_at: text('created_at').notNull(),
  finished_at: text('finished_at'),
}, (t) => [index('games_series').on(t.series_id), index('games_created').on(t.created_at)]);

export const attempts = sqliteTable('attempts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  created_at: text('created_at').notNull(),
  purpose: text('purpose').notNull(),                 // game | ladder | probe
  game_id: text('game_id'), ply: integer('ply'), series_id: text('series_id'), position_hash: text('position_hash'),
  model_slug: text('model_slug').notNull(), returned_model: text('returned_model'), provider: text('provider'),
  arm_id: text('arm_id').notNull(), interface: text('interface'),
  key_format: text('key_format'), descriptor: text('descriptor'), state_variant: text('state_variant'), template: text('template'),
  prompt_version: integer('prompt_version'), metrics_version: integer('metrics_version'),
  repeat: integer('repeat').default(0), seed: integer('seed'), order_json: text('order_json'),
  session_id: text('session_id'), concurrency: integer('concurrency'),
  request_hash: text('request_hash'), request_bytes: integer('request_bytes'),
  cache_hit: integer('cache_hit').default(0), retry_of: integer('retry_of'),
  status: text('status').notNull(),                   // ok | error
  http_status: integer('http_status'), error_code: text('error_code'), error: text('error'),
  pick_key: text('pick_key'), pick_uci: text('pick_uci'), pick_san: text('pick_san'),
  p_pick: real('p_pick'), confidence: real('confidence'),
  probs_json: text('probs_json'), prob_sum: real('prob_sum'),
  latency_ms: integer('latency_ms'), input_tokens: integer('input_tokens'), output_tokens: integer('output_tokens'),
  cost_usd: real('cost_usd'),
  request_gz: text('request_gz'), response_gz: text('response_gz'),   // base64 gzip; LOCAL ONLY, never published
}, (t) => [index('attempts_req').on(t.request_hash), index('attempts_game').on(t.game_id, t.ply), index('attempts_series').on(t.series_id)]);

export const plies = sqliteTable('plies', {
  game_id: text('game_id').notNull().references(() => games.id, { onDelete: 'cascade' }),
  ply: integer('ply').notNull(),
  side: text('side'), by: text('by'), uci: text('uci'), san: text('san'), fen_after: text('fen_after'),
  forced: integer('forced').default(0),
  attempt_id: integer('attempt_id'),
  decision_json: text('decision_json'), engine_json: text('engine_json'),
  eval_json: text('eval_json'), judge_json: text('judge_json'),
  created_at: text('created_at'),
}, (t) => [primaryKey({ columns: [t.game_id, t.ply] })]);

export const ladder_levels = sqliteTable('ladder_levels', {
  ladder_version: integer('ladder_version').notNull(),
  id: text('id').notNull(),
  kind: text('kind').notNull(),
  params_json: text('params_json').notNull(),
  elo: real('elo').notNull(), se: real('se'), games: integer('games'),
}, (t) => [primaryKey({ columns: [t.ladder_version, t.id] })]);

export const ladder_games = sqliteTable('ladder_games', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ladder_version: integer('ladder_version').notNull(),
  level_a: text('level_a').notNull(), level_b: text('level_b').notNull(),
  game_index: integer('game_index'),
  opening_seed: integer('opening_seed'), a_color: text('a_color'), result: text('result'), plies: integer('plies'),
});

export const oracle_moves = sqliteTable('oracle_moves', {
  position_hash: text('position_hash').notNull(),
  sf_version: text('sf_version').notNull(),
  depth: integer('depth').notNull(),
  hash_mb: integer('hash_mb').notNull(),
  threads: integer('threads').notNull(),
  uci: text('uci').notNull(), san: text('san').notNull(),
  cp: integer('cp').notNull(), wp: real('wp').notNull(),
  wdl_json: text('wdl_json').notNull(),               // mover POV [W,D,L] per mille
  mate_in: integer('mate_in'), pv: text('pv'),
}, (t) => [primaryKey({ columns: [t.position_hash, t.sf_version, t.depth, t.hash_mb, t.threads, t.uci] })]);

export const models_snapshot = sqliteTable('models_snapshot', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  slug: text('slug').notNull(), canonical_slug: text('canonical_slug'), name: text('name'),
  context_length: integer('context_length'), price_in_per_m: real('price_in_per_m'),
  input_modalities: text('input_modalities'), catalog_json: text('catalog_json'),
  captured_at: text('captured_at').notNull(),
});

export const settings = sqliteTable('settings', { key: text('key').primaryKey(), value: text('value').notNull() });
