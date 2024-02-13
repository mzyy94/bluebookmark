import { drizzle } from 'drizzle-orm/d1';
import type { Context, Next } from 'hono';
import { env } from 'hono/adapter';
import { bookmarks } from './schema';
import { and, desc, eq, lte, ne, sql } from 'drizzle-orm';
import { decode } from 'hono/jwt';
import { verifyJwt } from './verify';
import { fetchPubkey, getPubkey, savePubkey } from './pubkey';
import { HTTPException } from 'hono/http-exception';

// https://atproto.com/specs/xrpc#inter-service-authentication-temporary-specification
export async function XrpcAuth(c: Context, next: Next) {
  const jwt = c.req
    .header('Authorization')
    ?.match(/^Bearer\s+([\w-]+\.[\w-]+\.[\w-]+)/)?.[1];

  if (!jwt) {
    throw new HTTPException(400, {
      res: c.text('Bad Request', 400, {
        'WWW-Authenticate': `Bearer realm="${c.req.url}",error="invalid_request"`,
      }),
    });
  }

  const {
    payload: { iss, exp },
  } = decode(jwt);
  if (exp * 1000 < Date.now()) {
    // token expired
    throw new HTTPException(401, {
      res: c.text('Unauthorized', 401, {
        'WWW-Authenticate': `Bearer realm="${c.req.url}",error="invalid_token"`,
      }),
    });
  }

  const pubkey = await getPubkey(c, iss);
  if (!pubkey) {
    // not registered, return empty feed
    throw new HTTPException(200, { res: c.json({ feed: [] }) });
  }

  const verified = await verifyJwt(jwt, pubkey);
  if (!verified) {
    // refresh did key and re-verify
    const pubkey = await fetchPubkey(iss);
    if (!pubkey) {
      // error on xrpc request to bsky server
      throw new HTTPException(502, {
        message: 'failed to request describeRepo',
      });
    }
    const verified = await verifyJwt(jwt, pubkey);
    if (!verified) {
      throw new HTTPException(401, {
        res: c.text('Unauthorized', 401, {
          'WWW-Authenticate': `Bearer realm="${c.req.url}",error="invalid_token"`,
        }),
      });
    }
    await savePubkey(c, iss, pubkey);
  }

  c.set('iss', iss);
  await next();
}

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
