import { drizzle } from 'drizzle-orm/d1';
import { env } from 'hono/adapter';
import { createFactory } from 'hono/factory';
import { bookmarks } from '../schema';
import { and, desc, eq, lte, ne, sql } from 'drizzle-orm';
import { XrpcAuth } from './auth';

const factory = createFactory();

export const getFeedSkeletonHandlers = factory.createHandlers(
  XrpcAuth({ allowGuest: true }),
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

    const limit = parseInt(c.req.query('limit') ?? '50', 10);
    const [time, cid] = c.req.query('cursor')?.match(/^(\d+)::([\w]+)$/) ?? [];
    const filters =
      time && cid
        ? [
            lte(sql`unixepoch(${bookmarks.updatedAt})`, +time),
            ne(bookmarks.cid, cid),
          ]
        : [];

    const result = await db
      .select({
        uri: bookmarks.uri,
        cid: bookmarks.cid,
        updatedAt: sql`unixepoch(${bookmarks.updatedAt})`,
      })
      .from(bookmarks)
      .orderBy(desc(bookmarks.updatedAt))
      .limit(limit)
      .where(
        and(eq(bookmarks.sub, iss), eq(bookmarks.isDeleted, false), ...filters),
      );

    const feed = result.map((item) => ({ post: item.uri }));
    const lastPost = result[result.length - 1];
    const cursor = lastPost
      ? `${lastPost.updatedAt}::${lastPost.cid}`
      : undefined;
    return c.json({ cursor, feed });
  },
);
