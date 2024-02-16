import { zValidator } from '@hono/zod-validator';
import { and, desc, eq, lte, ne, or, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { env } from 'hono/adapter';
import { createFactory } from 'hono/factory';
import { z } from 'zod';
import { getAllFeedFromCache, putAllFeedToCache } from '../cache';
import { ControlMode, bookmarks } from '../schema';
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
    const [, , cid] = cursor ?? [];

    const cacheMarkers = await db
      .select({
        control: bookmarks.control,
        updatedAt: sql<number>`unixepoch(${bookmarks.updatedAt})`,
      })
      .from(bookmarks)
      .where(
        or(
          eq(bookmarks.control, ControlMode.LastAdded),
          eq(bookmarks.control, ControlMode.LastDeleted),
        ),
      );

    let allFeed = await getAllFeedFromCache(c, iss, cacheMarkers);
    if (!allFeed) {
      allFeed = await db
        .select({
          post: bookmarks.uri,
          cid: bookmarks.cid,
          updatedAt: sql<number>`unixepoch(${bookmarks.updatedAt})`,
        })
        .from(bookmarks)
        .limit(1000)
        .where(
          and(
            eq(bookmarks.sub, iss),
            eq(bookmarks.control, ControlMode.Active),
          ),
        );
      if (allFeed.length === 0) {
        return c.json({ feed: [] });
      }
      allFeed.sort((a, b) => b.updatedAt - a.updatedAt);
      await putAllFeedToCache(c, iss, cacheMarkers, allFeed);
    }

    const index = allFeed.findIndex((a) => a.cid === cid);
    const result = allFeed.slice(index + 1, index + 1 + limit);
    const feed = result.map(({ post }) => ({ post }));
    const lastPost = result[result.length - 1];
    const lastCur = createCursor(lastPost);
    return c.json({ cursor: lastCur, feed });
  },
);
