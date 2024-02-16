import { zValidator } from '@hono/zod-validator';
import { and, desc, eq, lte, ne, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { env } from 'hono/adapter';
import { createFactory } from 'hono/factory';
import { z } from 'zod';
import { bookmarks } from '../schema';
import { XrpcAuth } from './auth';

const factory = createFactory();

function createCursor(item: { cid: string; updatedAt: number } | undefined) {
  return item ? `${item.updatedAt}::${item.cid}` : undefined;
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
    const [, time, cid] = cursor ?? [];
    const filters =
      +time && cid
        ? [
            lte(sql`unixepoch(${bookmarks.updatedAt})`, +time),
            ne(bookmarks.cid, cid),
          ]
        : [];

    const result = await db
      .select({
        uri: bookmarks.uri,
        cid: bookmarks.cid,
        updatedAt: sql<number>`unixepoch(${bookmarks.updatedAt})`,
      })
      .from(bookmarks)
      .orderBy(desc(bookmarks.updatedAt))
      .limit(limit)
      .where(
        and(eq(bookmarks.sub, iss), eq(bookmarks.isDeleted, false), ...filters),
      );

    const feed = result.map((item) => ({ post: item.uri }));
    const lastPost = result[result.length - 1];
    const lastCur = createCursor(lastPost);
    return c.json({ cursor: lastCur, feed });
  },
);
