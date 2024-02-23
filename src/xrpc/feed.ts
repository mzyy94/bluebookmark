import { zValidator } from '@hono/zod-validator';
import { and, between, desc, eq, gt, sql } from 'drizzle-orm';
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
  user: string,
  operationId: number,
) {
  const operationList = await db
    .select()
    .from(operations)
    .where(and(eq(operations.user, user), gt(operations.id, operationId)))
    .limit(50)
    .orderBy(desc(operations.id));
  if (operationList.length === 50 && operationList[49].id !== operationId) {
    return Promise.reject({ error: 'Cache too old', id: operationList[0].id });
  }

  const id = operationList[0]?.id;
  const diffs = operationList
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
    .reduce(
      (a, c) => {
        if (c.opcode === 'delete') {
          const lastAdded = a.map((b) => b.uri).lastIndexOf(c.uri);
          if (lastAdded !== -1) {
            return a.filter((_, i) => i !== lastAdded);
          }
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
      createdAt: Date.parse(a.createdAt) / 1000,
    }));
  const remove = diffs
    .filter((a) => a.opcode === 'delete')
    .map(({ uri }) => uri);
  return { insert, remove, id };
}

const newestFirst = <T extends { createdAt: number }>(a: T, b: T) =>
  b.createdAt - a.createdAt;

export const getFeedSkeletonHandlers = factory.createHandlers(
  XrpcAuth({ allowGuest: true }),
  validateQuery,
  async (c) => {
    const user: string | undefined = c.get('iss');
    if (!user) {
      const { WELCOME_POST } = env<{ WELCOME_POST: string | undefined }>(c);
      return c.json({ feed: WELCOME_POST ? [{ post: WELCOME_POST }] : [] });
    }
    const { DB } = env<{ DB: D1Database }>(c);
    const db = drizzle(DB);
    const fetchFeedItems = (limit: number, rowId?: number, until = 0) =>
      db
        .select({
          rowid: sql<number>`rowid`,
          post: bookmarks.uri,
          cid: bookmarks.cid,
          createdAt: sql<number>`unixepoch(${bookmarks.createdAt})`,
        })
        .from(bookmarks)
        .orderBy(desc(sql`rowid`))
        .limit(limit)
        .where(
          and(
            eq(bookmarks.user, user),
            rowId ? between(sql`rowid`, until, rowId - 1) : undefined,
          ),
        );

    const { limit, cursor } = c.req.valid('query');

    if (limit === 1 && !cursor) {
      const items = await fetchFeedItems(1);
      const feed = items.map(({ post }) => ({ post }));
      return c.json({ feed, cursor: createCursor(items[0]) });
    }

    let { feedItems, opId, range } = await getFeedFromCache(c, user, !cursor);
    const updateFeedItems = (limit: number, rowid?: number, until?: number) =>
      fetchFeedItems(limit + 1, rowid, until).then((feeds) => {
        range.append(feeds, rowid);
        return feeds.concat(feedItems ?? []).sort(newestFirst);
      });

    if (!feedItems) {
      // cache not found. fetch bookmarks from database
      feedItems = await updateFeedItems(limit, cursor?.rowid);
      if (feedItems.length === 0) {
        return c.json({ feed: [] });
      }
      const lastOp = await db
        .select()
        .from(operations)
        .where(eq(operations.user, user))
        .limit(1)
        .orderBy(desc(operations.id))
        .get();
      opId = lastOp?.id ?? opId;
    } else {
      // Cache hit. check difference from cache
      const { insert, remove, id } = await getOperationDiffs(
        db,
        user,
        opId,
      ).catch((e): Awaited<ReturnType<typeof getOperationDiffs>> => {
        range.clear();
        feedItems = [];
        return { insert: [], remove: [], id: e.id };
      });

      feedItems = insert
        .concat(feedItems)
        .filter((a) => !remove.includes(a.post))
        .sort(newestFirst);
      opId = id ?? opId;

      if (!cursor) {
        if (feedItems.length < limit) {
          if (!range.isEOF(feedItems[feedItems.length - 1])) {
            // fetch missing pieces from database
            feedItems = await updateFeedItems(
              limit - feedItems.length,
              feedItems[feedItems.length - 1]?.rowid,
            );
          }
        }
      } else if (range.isEOF(cursor)) {
        // end of feed. nothing to do
      } else {
        let targetRange = range.get(cursor);
        const nextRange = range.next(cursor);
        if (!targetRange && nextRange) {
          feedItems = await updateFeedItems(limit, cursor.rowid, nextRange.s);
          targetRange = range.get(cursor);
        }
        if (targetRange) {
          const end = targetRange.e;
          const found = feedItems.filter(
            ({ rowid }) => rowid < cursor.rowid && rowid >= end,
          );
          if (found.length < limit) {
            if (!range.isEOF(found[found.length - 1])) {
              const rowid = found[found.length - 1]?.rowid ?? cursor.rowid;
              feedItems = await updateFeedItems(limit - found.length, rowid);
            }
          }
        } else {
          feedItems = await updateFeedItems(limit, cursor.rowid);
        }
      }
    }

    // remove duplicates
    feedItems = feedItems.reduce(
      (array, c) =>
        array.find((a) => a.cid === c.cid) ? array : array.concat([c]),
      [] as typeof feedItems,
    );

    const index = cursor
      ? feedItems.findIndex(
          (a) => a.createdAt <= cursor.time && a.cid !== cursor.cid,
        )
      : 0;
    const result = index >= 0 ? feedItems.slice(index, index + limit) : [];
    const feed = result.map(({ post }) => ({ post }));
    const lastPost = result[result.length - 1];
    const lastCur = createCursor(lastPost);
    await putFeedToCache(c, user, feedItems, opId, range, !cursor);

    return c.json({ cursor: lastCur, feed });
  },
);
