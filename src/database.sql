CREATE TABLE bookmarks (
  id INTEGER PRIMARY KEY NOT NULL,
  sub TEXT NOT NULL, -- Subject, bookmark user did
  repo TEXT NOT NULL, -- Repository, bookmark post author handle
  rkey TEXT NOT NULL, -- Record Key, bookmark post rkey
  uri TEXT NOT NULL, -- URI, bookmark post uri
  cid TEXT NOT NULL, -- Content ID, bookmark post cid
  created_at TEXT NOT NULL DEFAULT (DATETIME('now', 'localtime')),
  updated_at TEXT NOT NULL DEFAULT (DATETIME('now', 'localtime')),
  deleted INTEGER NOT NULL DEFAULT 0
);
