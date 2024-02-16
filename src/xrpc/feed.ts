import { zValidator } from '@hono/zod-validator';
import { and, desc, eq, lte, ne, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { env } from 'hono/adapter';
import { createFactory } from 'hono/factory';
import { z } from 'zod';
import { getFeedSkeletonFromCache, putFeedSkeletonToCache } from '../cache';
import { bookmarks } from '../schema';
import { XrpcAuth } from './auth';

const factory = createFactory();

function createCursor<
  T extends { cid: string; updatedAt: number } | undefined,
  R = T extends NonNullable<T> ? string : undefined,
>(item: T): R {
  return item ? (`${item.updatedAt}::${item.cid}` as R) : (undefined as R);
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
      .regex(/(^$|^\d+::\w+$)/)
      .transform((s) => s.match(/^(\d+)::(\w+)$/))
      .optional(),
  }),
);

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
    const [begin, time, cid] = cursor ?? [];
    const filters =
      +time && cid
        ? [
            lte(sql`unixepoch(${bookmarks.updatedAt})`, +time),
            ne(bookmarks.cid, cid),
          ]
        : [];

    const prepared = db
      .select({
        post: bookmarks.uri,
        cid: bookmarks.cid,
        updatedAt: sql<number>`unixepoch(${bookmarks.updatedAt})`,
      })
      .from(bookmarks)
      .orderBy(desc(bookmarks.updatedAt))
      .limit(sql.placeholder('limit'))
      .offset(sql.placeholder('offset'))
      .where(
        and(eq(bookmarks.sub, iss), eq(bookmarks.isDeleted, false), ...filters),
      )
      .prepare();

    const lastItem = await prepared.get({ limit: 1, offset: limit - 1 });

    if (limit === 1) {
      // skip cache check
      return c.json({
        cursor: createCursor(lastItem),
        feed: [{ post: lastItem?.post }],
      });
    }

    if (lastItem) {
      const end = createCursor(lastItem);
      const res = await getFeedSkeletonFromCache(c, iss, limit, begin, end);
      if (res) {
        // cache hit
        return res;
      }
    }

    const result = await prepared.all({ limit: limit - 1, offset: 0 });

    if (lastItem) {
      result.push(lastItem);
    } else if (result.length === 0) {
      return c.json({ feed: [] });
    }

    const feed = result.map(({ post }) => ({ post }));
    const lastPost = result[result.length - 1];
    const lastCur = createCursor(lastPost);
    const res = c.json({ cursor: lastCur, feed });
    await putFeedSkeletonToCache(c, iss, limit, begin, lastCur, res.clone());
    return res;
  },
);
