CREATE TABLE `bookmarks` (
	`sub` text NOT NULL,
	`repo` text NOT NULL,
	`rkey` text NOT NULL,
	`uri` text NOT NULL,
	`cid` text NOT NULL,
	`created_at` text DEFAULT (DATETIME('now', 'localtime')) NOT NULL,
	PRIMARY KEY(`sub`, `uri`)
);
--> statement-breakpoint
CREATE TABLE `operations` (
	`opid` integer PRIMARY KEY NOT NULL,
	`sub` text,
	`opcode` text NOT NULL,
	`uri` text NOT NULL,
	`cid` text NOT NULL,
	`bm_rowid` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (DATETIME('now', 'localtime')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`sub` text PRIMARY KEY NOT NULL,
	`handle` text NOT NULL,
	`bm_num` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (DATETIME('now', 'localtime')) NOT NULL,
	`issued_at` integer DEFAULT (UNIXEPOCH('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sub_index` ON `bookmarks` (`sub`);--> statement-breakpoint
CREATE INDEX `sub_idx` ON `operations` (`sub`);