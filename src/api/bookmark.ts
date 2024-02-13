import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { jwt } from 'hono/jwt';
import { env } from 'hono/adapter';
import { GetRecord } from '../at-proto';
import { hc } from 'hono/client';
import { createFactory } from 'hono/factory';
import { DrizzleD1Database, drizzle } from 'drizzle-orm/d1';
import { bookmarks } from '../schema';
import { and, eq, sql } from 'drizzle-orm';

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

async function getPostUriCid(
  db: ReturnType<typeof drizzle>,
  repo: string,
  rkey: string,
) {
  const result = await db
    .select({ uri: bookmarks.uri, cid: bookmarks.cid })
    .from(bookmarks)
    .where(and(eq(bookmarks.repo, repo), eq(bookmarks.rkey, rkey)))
    .get();
  if (result) {
    return result;
  }
  const res = await hc<GetRecord>('https://bsky.social').xrpc[
    'com.atproto.repo.getRecord'
  ].$get({ query: { repo, collection: 'app.bsky.feed.post', rkey } });
  if (res.ok) {
    const { uri, cid } = await res.json();
    return { uri, cid };
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
    const [, , repo, , rkey] = url.pathname.split('/');

    const { sub } = c.get('jwtPayload');
    const { DB } = env<{ DB: D1Database }>(c);
    const db = drizzle(DB);

    const uricid = await getPostUriCid(db, repo, rkey);
    if (!uricid) {
      return c.json({ error: 'post not found', params: { url } }, 404);
    }
    const { uri, cid } = uricid;

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
    const [, , repo, , rkey] = url.pathname.split('/');

    const { sub } = c.get('jwtPayload');
    const { DB } = env<{ DB: D1Database }>(c);
    const db = drizzle(DB);

    const uricid = await getPostUriCid(db, repo, rkey);
    if (!uricid) {
      return c.json({ error: 'post not found', params: { url } }, 404);
    }
    const { uri } = uricid;

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
