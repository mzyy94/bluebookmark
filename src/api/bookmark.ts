import { zValidator } from '@hono/zod-validator';
import { and, count, eq, sql } from 'drizzle-orm';
import { DrizzleD1Database, drizzle } from 'drizzle-orm/d1';
import { env } from 'hono/adapter';
import { hc } from 'hono/client';
import { createFactory } from 'hono/factory';
import { jwt } from 'hono/jwt';
import { z } from 'zod';
import type { GetRecord } from '../at-proto';
import { bookmarks } from '../schema';

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
    const res = c.res.clone();
    const body = await res.text();
    c.res = c.json({ error: body.toLowerCase() }, res);
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

type PostRecord = {
  uri: string;
  cid: string;
  repo: string;
  rkey: string;
};

async function getPostRecord(db: DrizzleD1Database, url: URL) {
  const cache = await caches.open('post-record');
  const req = new Request(url);
  const cached = await cache.match(req);
  if (cached) {
    return cached.json<PostRecord>();
  }

  const [, , repo, , rkey] = url.pathname.split('/');
  const result = await db
    .select({ uri: bookmarks.uri, cid: bookmarks.cid })
    .from(bookmarks)
    .where(and(eq(bookmarks.repo, repo), eq(bookmarks.rkey, rkey)))
    .get();

  if (result) {
    const record: PostRecord = { repo, rkey, ...result };
    const res = new Response(JSON.stringify(record));
    await cache.put(req, res);
    return record;
  }

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

function findBookmark(db: DrizzleD1Database, sub: string, uri: string) {
  return db
    .select()
    .from(bookmarks)
    .where(
      and(
        eq(bookmarks.sub, sub),
        eq(bookmarks.uri, uri),
        eq(bookmarks.isDeleted, false),
      ),
    )
    .get();
}

export const postBookmarkHandlers = factory.createHandlers(
  JwtAuthErrorJson,
  JwtAuth,
  validatePostURLForm,
  async (c) => {
    const form = c.req.valid('form');
    const url = new URL(form.url);

    const { sub } = c.get('jwtPayload');
    const { DB } = env<{ DB: D1Database }>(c);
    const db = drizzle(DB);

    const total = await db
      .select({ value: count() })
      .from(bookmarks)
      .where(eq(bookmarks.sub, sub));
    if (total[0].value > 1000) {
      // bookmark limit reached. only DELETE request is allowed for this user.
      return c.json({ error: 'bookmark limit reached', params: { url } }, 405);
    }

    const record = await getPostRecord(db, url);
    if (!record) {
      return c.json({ error: 'post not found', params: { url } }, 404);
    }
    const { repo, rkey, uri, cid } = record;

    // Check whether already bookmarked
    const result = await findBookmark(db, sub, uri);

    if (result) {
      return c.json({ error: 'already bookmarked', params: { url } }, 409);
    }

    await db
      .insert(bookmarks)
      .values({ uri, cid, repo, rkey, sub })
      .onConflictDoUpdate({
        target: [bookmarks.uri, bookmarks.sub],
        set: {
          isDeleted: false,
          updatedAt: sql`(DATETIME('now', 'localtime'))`,
        },
      });
    return c.json({ status: 'created', params: { url } }, 201);
  },
);

export const deleteBookmarkHandlers = factory.createHandlers(
  JwtAuthErrorJson,
  JwtAuth,
  validatePostURLForm,
  async (c) => {
    const form = c.req.valid('form');
    const url = new URL(form.url);

    const { sub } = c.get('jwtPayload');
    const { DB } = env<{ DB: D1Database }>(c);
    const db = drizzle(DB);

    const record = await getPostRecord(db, url);
    if (!record) {
      return c.json({ error: 'post not found', params: { url } }, 404);
    }
    const { uri } = record;

    const result = await findBookmark(db, sub, uri);
    if (!result) {
      return c.json({ error: 'bookmark not found', params: { url } }, 404);
    }

    await db
      .update(bookmarks)
      .set({
        isDeleted: true,
        updatedAt: sql`(DATETIME('now', 'localtime'))`,
      })
      .where(and(eq(bookmarks.uri, uri), eq(bookmarks.sub, sub)));
    return c.json({ status: 'deleted', params: { url } }, 200);
  },
);
