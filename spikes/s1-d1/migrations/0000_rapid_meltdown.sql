CREATE TABLE `games` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`config_json` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `plies` (
	`game_id` text NOT NULL,
	`ply` integer NOT NULL,
	`san` text,
	`fen_after` text,
	`decision_json` text,
	`cost` real,
	PRIMARY KEY(`game_id`, `ply`),
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE no action
);
