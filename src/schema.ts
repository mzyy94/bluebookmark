import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core';

export enum ControlMode {
  Active = 0,
  Deleted = 1,
  Control = 2,
}

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
    control: integer('deleted').notNull().default(0).$type<ControlMode>(), // control field
  },
  (table) => ({ pk: primaryKey({ columns: [table.sub, table.uri] }) }),
);

export const operations = sqliteTable(
  'operations',
  {
    id: integer('opid').primaryKey(),
    sub: text('sub'),
    opcode: text('opcode').notNull().$type<'add' | 'delete'>(),
    uri: text('uri').notNull(),
    cid: text('cid').notNull(),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(DATETIME('now', 'localtime'))`),
  },
  (table) => ({ subIdx: index('sub_idx').on(table.sub) }),
);
