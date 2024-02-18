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
    /**
     * @deprecated deleted flag is no longer used
     */
    isDeleted: integer('deleted', { mode: 'boolean' }).notNull().default(false),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.sub, table.uri] }),
    subIndex: index('sub_index').on(table.sub),
  }),
);

export const operations = sqliteTable(
  'operations',
  {
    id: integer('opid').primaryKey(),
    sub: text('sub'),
    opcode: text('opcode').notNull().$type<'add' | 'delete'>(),
    uri: text('uri').notNull(),
    cid: text('cid').notNull(),
    bookmarkId: integer('bm_rowid').notNull().default(0),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(DATETIME('now', 'localtime'))`),
  },
  (table) => ({ subIdx: index('sub_idx').on(table.sub) }),
);
