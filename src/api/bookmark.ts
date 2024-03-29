import { zValidator } from '@hono/zod-validator';
import { and, eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { env } from 'hono/adapter';
import { hc } from 'hono/client';
import { createFactory } from 'hono/factory';
import { jwt } from 'hono/jwt';
import { z } from 'zod';
import type { GetRecord } from '../at-proto';
import { openPostRecordCache } from '../cache';
import { bookmarks, operations, users } from '../schema';

const factory = createFactory();

const JwtAuth = factory.createMiddleware(async (c, next) => {
  const { JWT_SECRET } = env<{ JWT_SECRET: string }>(c);
  const jwtMiddleware = jwt({
    secret: JWT_SECRET,
  });
  return jwtMiddleware(c, next);
});

const JwtAuthErrorJson = factory.createMiddleware(async (c, next) => {
  await next();
  if (c.res.status === 401) {
    const body = await c.res.text();
    c.res = c.json({ error: body.toLowerCase() }, c.res);
  }
});

const validatePostURLForm = zValidator(
  'form',
  z.object({
    url: z
      .string()
      .url()
      .regex(
        /\/\/bsky.(app|social)\/profile\/[a-zA-Z0-9\.-]+\/post\/\w+/,
        'invalid post url',
      ),
  }),
);

type PostRecord = Omit<typeof bookmarks.$inferInsert, 'user'>;

async function getPostRecord(url: URL) {
  url.search = '';
  url.hash = '';
  const { cache, req } = await openPostRecordCache(url);
  const cached = await cache.match(req);
  if (cached) {
    return cached.json<PostRecord>();
  }

  const [, , repo, , rkey] = url.pathname.split('/');
  const res = await hc<GetRecord>('https://bsky.social').xrpc[
    'com.atproto.repo.getRecord'
  ].$get({ query: { repo, collection: 'app.bsky.feed.post', rkey } });

  if (res.ok) {
    const result = await res.json();
    const record: PostRecord = { repo, rkey, ...result };
    const resp = new Response(JSON.stringify(record));
    await cache.put(req, resp);
    return record;
  }
  return null;
}

export const postBookmarkHandlers = factory.createHandlers(
  JwtAuthErrorJson,
  JwtAuth,
  validatePostURLForm,
  async (c) => {
    const form = c.req.valid('form');
    const url = new URL(form.url);

    const { sub: user, iat } = c.get('jwtPayload');
    const { DB } = env<{ DB: D1Database }>(c);
    const db = drizzle(DB, { logger: true });

    const record = await getPostRecord(url);
    if (!record) {
      return c.json({ error: 'post not found', params: { url } }, 404);
    }
    const { repo, rkey, uri, cid } = record;

    const userdata = await db
      .select({ count: users.bookmarkCount, iat: users.issuedAt })
      .from(users)
      .where(eq(users.user, user))
      .get();

    if (!userdata || (userdata.iat !== 0 && iat !== userdata.iat)) {
      return c.text('unauthorized', 401);
    }
    if (userdata.count > 200) {
      // bookmark limit reached. only DELETE request is allowed for this user at this momen.
      return c.json({ error: 'bookmark limit reached', params: { url } }, 405);
    }

    const [result] = await db
      .insert(bookmarks)
      .values({ uri, cid, repo, rkey, user })
      .onConflictDoNothing()
      .returning({
        bookmarkId: sql<number>`rowid`,
        user: bookmarks.user,
        uri: bookmarks.uri,
        cid: bookmarks.cid,
      });

    if (result) {
      await db.batch([
        db.insert(operations).values({ opcode: 'add', ...result }),
        db
          .update(users)
          .set({ bookmarkCount: userdata.count + 1 })
          .where(eq(users.user, user)),
      ]);
      return c.json({ status: 'created', params: { url } }, 201);
    }
    return c.json({ error: 'already bookmarked', params: { url } }, 409);
  },
);

export const deleteBookmarkHandlers = factory.createHandlers(
  JwtAuthErrorJson,
  JwtAuth,
  validatePostURLForm,
  async (c) => {
    const form = c.req.valid('form');
    const url = new URL(form.url);

    const { sub: user } = c.get('jwtPayload');
    const { DB } = env<{ DB: D1Database }>(c);
    const db = drizzle(DB, { logger: true });

    const record = await getPostRecord(url);
    if (!record) {
      return c.json({ error: 'post not found', params: { url } }, 404);
    }
    const { uri } = record;

    const [result] = await db
      .delete(bookmarks)
      .where(and(eq(bookmarks.uri, uri), eq(bookmarks.user, user)))
      .returning({
        bookmarkId: sql<number>`rowid`,
        user: bookmarks.user,
        uri: bookmarks.uri,
        cid: bookmarks.cid,
      });

    if (result) {
      await db.batch([
        db.insert(operations).values({ opcode: 'delete', ...result }),
        db
          .update(users)
          .set({ bookmarkCount: sql`${users.bookmarkCount} - 1` })
          .where(eq(users.user, user)),
      ]);
      return c.json({ status: 'deleted', params: { url } }, 200);
    }
    return c.json({ error: 'bookmark not found', params: { url } }, 404);
  },
);
