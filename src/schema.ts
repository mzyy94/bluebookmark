import { sql } from 'drizzle-orm';
import {
  integer,
  primaryKey,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core';

export const bookmarks = sqliteTable(
  'bookmarks',
  {
    sub: text('sub').notNull(),
    repo: text('repo').notNull(),
    rkey: text('rkey').notNull(),
    uri: text('uri').notNull(),
    cid: text('cid').notNull(),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(DATETIME('now', 'localtime'))`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(DATETIME('now', 'localtime'))`),
    isDeleted: integer('deleted', { mode: 'boolean' }).notNull().default(false),
  },
  (table) => ({ pk: primaryKey({ columns: [table.sub, table.uri] }) }),
);
