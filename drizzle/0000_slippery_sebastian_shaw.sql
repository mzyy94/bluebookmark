CREATE TABLE `bookmarks` (
	`id` integer PRIMARY KEY NOT NULL,
	`sub` text NOT NULL,
	`repo` text NOT NULL,
	`rkey` text NOT NULL,
	`uri` text NOT NULL,
	`cid` text NOT NULL,
	`created_at` text DEFAULT (DATETIME('now', 'localtime')) NOT NULL,
	`updated_at` text DEFAULT (DATETIME('now', 'localtime')) NOT NULL,
	`deleted` integer DEFAULT 0 NOT NULL
);
