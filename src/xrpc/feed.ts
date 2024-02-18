import { zValidator } from '@hono/zod-validator';
import { SQL, and, desc, eq, gt, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { env } from 'hono/adapter';
import { createFactory } from 'hono/factory';
import { z } from 'zod';
import { getFeedFromCache, putFeedToCache } from '../cache';
import { bookmarks, operations } from '../schema';
import { XrpcAuth } from './auth';

const factory = createFactory();

function createCursor<
  T extends { cid: string; updatedAt: number; rowid: number } | undefined,
  R = T extends NonNullable<T> ? string : undefined,
>(item: T): R {
  return item
    ? (`${item.updatedAt}::${item.cid}+${item.rowid}` as R)
    : (undefined as R);
}

// ref. https://github.com/bluesky-social/atproto/blob/fcf8e3faf311559162c3aa0d9af36f84951914bc/lexicons/app/bsky/feed/getFeedSkeleton.json
const validateQuery = zValidator(
  'query',
  z.object({
    feed: z.string(),
    limit: z
      .string()
      .default('50')
      .transform((s) => parseFloat(s))
      .pipe(z.number().int().min(1).max(100)),
    cursor: z
      .string()
      .regex(/(^$|^\d+::\w+)/)
      .transform((s) => s.match(/^(\d+)::(\w+)/))
      .optional(),
  }),
);

async function getOperationDiffs(
  db: ReturnType<typeof drizzle>,
  iss: string,
  operationId: number,
) {
  const operationList = await db
    .select()
    .from(operations)
    .where(and(eq(operations.sub, iss), gt(operations.id, operationId)))
    .orderBy(desc(operations.id));

  const diffs = operationList
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
    .reduce(
      (a, c) => {
        if (c.opcode === 'delete' && a.find((b) => b.uri === c.uri)) {
          return a.filter((b) => b.uri !== c.uri);
        }
        return a.concat([c]);
      },
      [] as typeof operationList,
    );
  const insert = diffs
    .filter((a) => a.opcode === 'add')
    .map((a) => ({
      rowid: a.bookmarkId,
      post: a.uri,
      cid: a.cid,
      updatedAt: Date.parse(a.createdAt) / 1000,
    }));
  const remove = diffs
    .filter((a) => a.opcode === 'delete')
    .map(({ uri }) => uri);
  return { insert, remove };
}

export const getFeedSkeletonHandlers = factory.createHandlers(
  XrpcAuth({ allowGuest: true }),
  validateQuery,
  async (c) => {
    const iss: string | undefined = c.get('iss');
    if (!iss) {
      const { WELCOME_POST } = env<{ WELCOME_POST: string | undefined }>(c);
      if (WELCOME_POST) {
        return c.json({ feed: [{ post: WELCOME_POST }] });
      }
      return c.json({ feed: [] });
    }
    const { DB } = env<{ DB: D1Database }>(c);
    const db = drizzle(DB);

    const { limit, cursor } = c.req.valid('query');
    const [, time, cid] = cursor ?? [];

    const lastOp = await db
      .select({ id: operations.id })
      .from(operations)
      .where(eq(operations.sub, iss))
      .orderBy(desc(operations.id))
      .limit(1)
      .get();
    const latestOpId = lastOp?.id ?? 0;

    const fetchFeedItems = (limit: number, filter?: SQL) =>
      db
        .select({
          rowid: sql<number>`rowid`,
          post: bookmarks.uri,
          cid: bookmarks.cid,
          updatedAt: sql<number>`unixepoch(${bookmarks.updatedAt})`,
        })
        .from(bookmarks)
        .orderBy(desc(sql`rowid`))
        .limit(limit)
        .where(and(eq(bookmarks.sub, iss), filter));

    let { feed: feedItems, opId: cachedOpId } = await getFeedFromCache(c, iss);
    if (!feedItems) {
      // fetch all bookmarks from db
      feedItems = await fetchFeedItems(1000);
      if (feedItems.length === 0) {
        return c.json({ feed: [] });
      }
    } else if (cachedOpId !== latestOpId) {
      // need to apply diff patch
      const { insert, remove } = await getOperationDiffs(db, iss, cachedOpId);
      feedItems = insert
        .concat(feedItems)
        .filter((a) => !remove.includes(a.post));
    }
    feedItems.sort((a, b) => b.updatedAt - a.updatedAt);
    await putFeedToCache(c, iss, feedItems, latestOpId);

    const index = time
      ? feedItems.findIndex((a) => a.updatedAt <= +time && a.cid !== cid)
      : 0;
    const result = feedItems.slice(index, index + limit);
    const feed = result.map(({ post }) => ({ post }));
    const lastPost = result[result.length - 1];
    const lastCur = createCursor(lastPost);
    return c.json({ cursor: lastCur, feed });
  },
);
