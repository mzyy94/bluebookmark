import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core';

export const bookmarks = sqliteTable(
  'bookmarks',
  {
    /** did of user */
    user: text('sub').notNull(),
    repo: text('repo').notNull(),
    rkey: text('rkey').notNull(),
    uri: text('uri').notNull(),
    cid: text('cid').notNull(),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(DATETIME('now', 'localtime'))`),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.user, table.uri] }),
    subIndex: index('sub_index').on(table.user),
  }),
);

export const operations = sqliteTable(
  'operations',
  {
    id: integer('opid').primaryKey(),
    /** did of user */
    user: text('sub'),
    opcode: text('opcode').notNull().$type<'add' | 'delete'>(),
    uri: text('uri').notNull(),
    cid: text('cid').notNull(),
    bookmarkId: integer('bm_rowid').notNull().default(0),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(DATETIME('now', 'localtime'))`),
  },
  (table) => ({ subIdx: index('sub_idx').on(table.user) }),
);

export const users = sqliteTable('users', {
  /** did of user */
  user: text('sub').primaryKey(),
  handle: text('handle').notNull(),
  bookmarkCount: integer('bm_num').notNull().default(0),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(DATETIME('now', 'localtime'))`),
  issuedAt: integer('issued_at').notNull().default(sql`(UNIXEPOCH('now'))`),
});
