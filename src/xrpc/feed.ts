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
      createdAt: Date.parse(a.createdAt) / 1000,
    }));
  const remove = diffs
    .filter((a) => a.opcode === 'delete')
    .map(({ uri }) => uri);
  return { insert, remove, id };
}

const newestFirst = <T extends { createdAt: number }>(a: T, b: T) =>
  b.createdAt - a.createdAt;

function appendRange(
  range: { s: number; e: number }[],
  result: { rowid: number }[],
  start: number | undefined,
) {
  if (!start) {
    return range;
  }
  const end = result[result.length - 1]?.rowid ?? start;
  range.push({ s: start, e: end });
  return range
    .sort((a, b) => b.s - a.s)
    .reduce(
      (r, { s, e }) => {
        if (r.length) {
          const last = r[r.length - 1];
          if (s !== e && last.e <= s) {
            last.e = e;
            return r;
          }
        }
        return r.concat([{ s, e }]);
      },
      [] as typeof range,
    );
}

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
        range = appendRange(range, feeds, rowid);
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
      const { insert, remove, id } = await getOperationDiffs(db, user, opId);
      feedItems = insert
        .concat(feedItems)
        .filter((a) => !remove.includes(a.post))
        .sort(newestFirst);
      opId = id ?? opId;

      if (!cursor) {
        if (feedItems.length < limit) {
          // fetch missing pieces from database
          feedItems = await updateFeedItems(
            limit - feedItems.length,
            feedItems[feedItems.length - 1]?.rowid,
          );
        }
      } else if (range.find((r) => r.s === r.e && r.e === cursor.rowid)) {
        // end of feed. nothing to do
      } else {
        let targetRange = range.find(
          (r) => cursor.rowid <= r.s && cursor.rowid > r.e,
        );
        const nextRange = range.find((r) => r.s < cursor.rowid);
        if (!targetRange && nextRange) {
          const rowid = cursor.rowid;
          feedItems = await updateFeedItems(limit, rowid, nextRange.s);
          targetRange = range.find((r) => rowid <= r.s && rowid > r.e);
        }
        if (targetRange) {
          const end = targetRange.e;
          const found = feedItems.filter(
            ({ rowid }) => rowid < cursor.rowid && rowid >= end,
          );
          if (found.length < limit) {
            const rowid = found[found.length - 1]?.rowid ?? cursor.rowid;
            feedItems = await updateFeedItems(limit - found.length, rowid);
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
