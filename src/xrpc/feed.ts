import { zValidator } from '@hono/zod-validator';
import { SQL, and, between, desc, eq, gt, ne, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { env } from 'hono/adapter';
import { createFactory } from 'hono/factory';
import { z } from 'zod';
import { getFeedFromCache, putFeedToCache } from '../cache';
import { bookmarks, operations } from '../schema';
import { XrpcAuth } from './auth';
import { createCursor, cursorPattern, parseCursor } from './cursor';

const factory = createFactory();

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
    cursor: z.string().regex(cursorPattern).transform(parseCursor).optional(),
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

  const id = operationList[0]?.id;
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
  return { insert, remove, id };
}

const newestFirst = <T extends { updatedAt: number }>(a: T, b: T) =>
  b.updatedAt - a.updatedAt;

export const getFeedSkeletonHandlers = factory.createHandlers(
  XrpcAuth({ allowGuest: true }),
  validateQuery,
  async (c) => {
    const iss: string | undefined = c.get('iss');
    if (!iss) {
      const { WELCOME_POST } = env<{ WELCOME_POST: string | undefined }>(c);
      return c.json({ feed: WELCOME_POST ? [{ post: WELCOME_POST }] : [] });
    }
    const { DB } = env<{ DB: D1Database }>(c);
    const db = drizzle(DB);
    const fetchFeedItems = (limit: number, rowId?: number) =>
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
        .where(
          and(
            eq(bookmarks.sub, iss),
            rowId ? between(sql`rowid`, 0, rowId - 1) : undefined,
          ),
        );

    const { limit, cursor } = c.req.valid('query');

    if (limit === 1 && !cursor) {
      const items = await fetchFeedItems(1);
      const feed = items.map(({ post }) => ({ post }));
      return c.json({ feed, cursor: createCursor(items[0]) });
    }

    let { feed: feedItems, opId } = await getFeedFromCache(c, iss, !cursor);
    if (!feedItems) {
      // cache not found. fetch bookmarks from database
      feedItems = await fetchFeedItems(limit + 1, cursor?.rowid).execute();
      if (feedItems.length === 0) {
        return c.json({ feed: [] });
      }
      feedItems.sort(newestFirst);
    } else {
      // Cache hit. check difference from cache
      const { insert, remove, id } = await getOperationDiffs(db, iss, opId);
      feedItems = insert
        .concat(feedItems)
        .filter((a) => !remove.includes(a.post));
      opId = id ?? opId;

      let headCid: string;
      if (cursor) {
        headCid = cursor.cid;
      } else {
        const lastAdded = await fetchFeedItems(1).get();
        if (!lastAdded) {
          return c.json({ feed: [] });
        }
        headCid = lastAdded.cid;
      }

      feedItems.sort(newestFirst);
      const headIndex = feedItems.findIndex((item) => item.cid === headCid);
      if (headIndex !== -1) {
        // if head item exists in cache, check all feed items are in cache
        const items = feedItems.slice(headIndex + 1, headIndex + 1 + limit);
        if (items.length !== limit) {
          // if number of found feed items in cache is not enough, fetch missing pieces from database
          const rowid = items[items.length - 1]?.rowid;
          const feeds = await fetchFeedItems(limit + 1 - items.length, rowid);
          feedItems = feeds.concat(feedItems);
        }
      } else {
        // head item is not in cache. fetch from database
        const feeds = await fetchFeedItems(limit + 1, cursor?.rowid);
        feedItems = feeds.concat(feedItems);
      }
    }

    // remove duplicates
    feedItems = feedItems
      .sort(newestFirst)
      .reduce(
        (array, c) =>
          array.find((a) => a.cid === c.cid) ? array : array.concat([c]),
        [] as typeof feedItems,
      );

    await putFeedToCache(c, iss, feedItems, opId, !cursor);

    const index = cursor
      ? feedItems.findIndex(
          (a) => a.updatedAt <= cursor.time && a.cid !== cursor.cid,
        )
      : 0;
    const result = feedItems.slice(index, index + limit);
    const feed = result.map(({ post }) => ({ post }));
    const lastPost = result[result.length - 1];
    const lastCur = createCursor(lastPost);
    return c.json({ cursor: lastCur, feed });
  },
);
