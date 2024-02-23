CREATE TABLE `users` (
	`sub` text PRIMARY KEY NOT NULL,
	`handle` text NOT NULL,
	`bm_num` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (DATETIME('now', 'localtime')) NOT NULL
);
