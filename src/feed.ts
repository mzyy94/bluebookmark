import { drizzle } from 'drizzle-orm/d1';
import type { Context } from 'hono';
import { env } from 'hono/adapter';
import { bookmarks } from './schema';
import { and, desc, eq, lte, sql } from 'drizzle-orm';
import { decode } from 'hono/jwt';

export async function getFeedSkeleton(c: Context) {
  const jwt = c.req
    .header('Authorization')
    ?.match(/^Bearer ([\w-]+\.[\w-]+\.[\w-]+)/)?.[1];
  if (!jwt) {
    return c.json({ feed: [] });
  }

  // TODO: verify jwt
  const {
    payload: { iss, exp },
  } = decode(jwt);
  if (exp * 1000 < Date.now()) {
    // token expired
    return c.json({ feed: [] });
  }

  const { DB } = env<{ DB: D1Database }>(c);
  const db = drizzle(DB);

  const limit = parseInt(c.req.query('limit') ?? '50', 10);
  const time = c.req.query('cursor')?.match(/^(\d+)::([\w]+)$/)?.[1];
  const filter = time
    ? lte(sql`unixepoch(${bookmarks.updatedAt})`, +time)
    : undefined;

  const result = await db
    .select({
      uri: bookmarks.uri,
      cid: bookmarks.cid,
      updatedAt: sql`unixepoch(${bookmarks.updatedAt})`,
    })
    .from(bookmarks)
    .orderBy(desc(bookmarks.updatedAt))
    .limit(limit)
    .where(and(eq(bookmarks.sub, iss), eq(bookmarks.isDeleted, 0), filter));

  const feed = result.map((item) => ({ post: item.uri }));
  const lastPost = result[result.length - 1];
  const cursor = lastPost
    ? `${lastPost.updatedAt}::${lastPost.cid}`
    : undefined;
  return c.json({ cursor, feed });
}
