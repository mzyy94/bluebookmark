CREATE TABLE `bookmarks` (
	`sub` text NOT NULL,
	`repo` text NOT NULL,
	`rkey` text NOT NULL,
	`uri` text NOT NULL,
	`cid` text NOT NULL,
	`created_at` text DEFAULT (DATETIME('now', 'localtime')) NOT NULL,
	`updated_at` text DEFAULT (DATETIME('now', 'localtime')) NOT NULL,
	`deleted` integer DEFAULT false NOT NULL,
	PRIMARY KEY(`sub`, `uri`)
);
