import { drizzle } from 'drizzle-orm/d1';
import type { Context } from 'hono';
import { env } from 'hono/adapter';
import { bookmarks } from './schema';
import { and, desc, eq, lte, ne, sql } from 'drizzle-orm';

export async function getFeedSkeleton(c: Context) {
  const iss = c.get('iss');
  const { DB } = env<{ DB: D1Database }>(c);
  const db = drizzle(DB);

  const limit = parseInt(c.req.query('limit') ?? '50', 10);
  const [time, cid] = c.req.query('cursor')?.match(/^(\d+)::([\w]+)$/) ?? [];
  const filters = time
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
    .where(and(eq(bookmarks.sub, iss), eq(bookmarks.isDeleted, 0), ...filters));

  const feed = result.map((item) => ({ post: item.uri }));
  const lastPost = result[result.length - 1];
  const cursor = lastPost
    ? `${lastPost.updatedAt}::${lastPost.cid}`
    : undefined;
  return c.json({ cursor, feed });
}
