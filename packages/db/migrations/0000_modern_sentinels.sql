CREATE TABLE `attempts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` text NOT NULL,
	`purpose` text NOT NULL,
	`game_id` text,
	`ply` integer,
	`series_id` text,
	`position_hash` text,
	`model_slug` text NOT NULL,
	`returned_model` text,
	`provider` text,
	`arm_id` text NOT NULL,
	`interface` text,
	`key_format` text,
	`descriptor` text,
	`state_variant` text,
	`template` text,
	`prompt_version` integer,
	`metrics_version` integer,
	`repeat` integer DEFAULT 0,
	`seed` integer,
	`order_json` text,
	`session_id` text,
	`concurrency` integer,
	`request_hash` text,
	`request_bytes` integer,
	`cache_hit` integer DEFAULT 0,
	`retry_of` integer,
	`status` text NOT NULL,
	`http_status` integer,
	`error_code` text,
	`error` text,
	`pick_key` text,
	`pick_uci` text,
	`pick_san` text,
	`p_pick` real,
	`confidence` real,
	`probs_json` text,
	`prob_sum` real,
	`latency_ms` integer,
	`input_tokens` integer,
	`output_tokens` integer,
	`cost_usd` real,
	`request_gz` text,
	`response_gz` text
);
--> statement-breakpoint
CREATE INDEX `attempts_req` ON `attempts` (`request_hash`);--> statement-breakpoint
CREATE INDEX `attempts_game` ON `attempts` (`game_id`,`ply`);--> statement-breakpoint
CREATE INDEX `attempts_series` ON `attempts` (`series_id`);--> statement-breakpoint
CREATE TABLE `games` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`status_reason` text,
	`config_json` text NOT NULL,
	`white_player` text NOT NULL,
	`black_player` text NOT NULL,
	`engine_id` text DEFAULT 'stockfish',
	`series_id` text,
	`series_index` integer,
	`block_index` integer,
	`level_id` text,
	`level_elo` real,
	`model_color` text,
	`model_score` real,
	`adjudicated` integer DEFAULT 0,
	`start_fen` text NOT NULL,
	`opening_seed` integer,
	`result` text,
	`termination` text,
	`budget_usd` real,
	`cost_usd` real DEFAULT 0,
	`created_at` text NOT NULL,
	`finished_at` text,
	FOREIGN KEY (`series_id`) REFERENCES `series`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `games_series` ON `games` (`series_id`);--> statement-breakpoint
CREATE INDEX `games_created` ON `games` (`created_at`);--> statement-breakpoint
CREATE TABLE `ladder_games` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ladder_version` integer NOT NULL,
	`level_a` text NOT NULL,
	`level_b` text NOT NULL,
	`opening_seed` integer,
	`a_color` text,
	`result` text,
	`plies` integer
);
--> statement-breakpoint
CREATE TABLE `ladder_levels` (
	`ladder_version` integer NOT NULL,
	`id` text NOT NULL,
	`kind` text NOT NULL,
	`params_json` text NOT NULL,
	`elo` real NOT NULL,
	`se` real,
	`games` integer,
	PRIMARY KEY(`ladder_version`, `id`)
);
--> statement-breakpoint
CREATE TABLE `models_snapshot` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`canonical_slug` text,
	`name` text,
	`context_length` integer,
	`price_in_per_m` real,
	`input_modalities` text,
	`catalog_json` text,
	`captured_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `oracle_moves` (
	`position_hash` text NOT NULL,
	`sf_version` text NOT NULL,
	`depth` integer NOT NULL,
	`hash_mb` integer NOT NULL,
	`threads` integer NOT NULL,
	`uci` text NOT NULL,
	`san` text NOT NULL,
	`cp` integer NOT NULL,
	`wp` real NOT NULL,
	`wdl_json` text NOT NULL,
	`mate_in` integer,
	`pv` text,
	PRIMARY KEY(`position_hash`, `sf_version`, `depth`, `hash_mb`, `threads`, `uci`)
);
--> statement-breakpoint
CREATE TABLE `plies` (
	`game_id` text NOT NULL,
	`ply` integer NOT NULL,
	`side` text,
	`by` text,
	`uci` text,
	`san` text,
	`fen_after` text,
	`forced` integer DEFAULT 0,
	`attempt_id` integer,
	`decision_json` text,
	`engine_json` text,
	`eval_json` text,
	`judge_json` text,
	`created_at` text,
	PRIMARY KEY(`game_id`, `ply`),
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `series` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`model_slug` text NOT NULL,
	`arm_id` text NOT NULL,
	`arm_json` text NOT NULL,
	`status` text NOT NULL,
	`status_reason` text,
	`size_json` text NOT NULL,
	`ladder_mode` text,
	`ladder_level` text,
	`ladder_version` integer NOT NULL,
	`seed` integer,
	`budget_usd` real,
	`cost_usd` real DEFAULT 0,
	`elo_mean` real,
	`elo_lo` real,
	`elo_hi` real,
	`w` integer DEFAULT 0,
	`d` integer DEFAULT 0,
	`l` integer DEFAULT 0,
	`elo_history_json` text,
	`blocks_json` text,
	`catalog_snapshot_json` text,
	`created_at` text NOT NULL,
	`finished_at` text
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
