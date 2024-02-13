import type { Context, Next } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { jwt } from 'hono/jwt';
import { env } from 'hono/adapter';
import { GetRecord } from './at-proto';
import { hc } from 'hono/client';
import { drizzle } from 'drizzle-orm/d1';
import { bookmarks } from './schema';
import { and, eq, sql } from 'drizzle-orm';

export const JwtAuth = (c: Context, next: Next) => {
  const { JWT_SECRET } = env<{ JWT_SECRET: string }>(c);
  const jwtMiddleware = jwt({
    secret: JWT_SECRET,
  });
  return jwtMiddleware(c, next);
};

export const validatePostURLForm = zValidator(
  'form',
  z.object({
    url: z
      .string()
      .url()
      .regex(/\/\/bsky.(app|social)\//, 'host must be bsky.app or bsky.social'),
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

type ValidatedFormContext = Parameters<typeof validatePostURLForm>[0];
export async function handlePostBookmark(c: ValidatedFormContext) {
  const form = c.req.valid('form');
  const url = new URL(form.url);

  const [, , repo, collection, rkey] = url.pathname.split('/');
  if (collection !== 'post') {
    return c.json({ error: 'invalid post url', params: { url } }, 400);
  }

  const { sub } = c.get('jwtPayload');
  const { DB } = env<{ DB: D1Database }>(c);
  const db = drizzle(DB);

  const uricid = await getPostUriCid(db, repo, rkey);
  if (!uricid) {
    return c.json({ error: 'post not found', params: { url } }, 404);
  }
  const { uri, cid } = uricid;

  // Check whether already bookmarked
  {
    const result = await db
      .select()
      .from(bookmarks)
      .where(and(eq(bookmarks.sub, sub), eq(bookmarks.uri, uri)))
      .get();

    if (result) {
      if (result.isDeleted) {
        await db
          .update(bookmarks)
          .set({
            isDeleted: false,
            updatedAt: sql`(DATETIME('now', 'localtime'))`,
          })
          .where(and(eq(bookmarks.uri, uri), eq(bookmarks.sub, sub)));
        return c.json({ status: 'created', params: { url } }, 201);
      }
      return c.json({ error: 'already bookmarked', params: { url } }, 409);
    }
  }

  await db.insert(bookmarks).values({ uri, cid, repo, rkey, sub });
  return c.json({ status: 'created', params: { url } }, 201);
}

export async function handleDeleteBookmark(c: ValidatedFormContext) {
  const form = c.req.valid('form');
  const url = new URL(form.url);

  const [, , repo, collection, rkey] = url.pathname.split('/');
  if (collection !== 'post') {
    return c.json({ error: 'invalid post url', params: { url } }, 400);
  }

  const { sub } = c.get('jwtPayload');
  const { DB } = env<{ DB: D1Database }>(c);
  const db = drizzle(DB);

  const uricid = await getPostUriCid(db, repo, rkey);
  if (!uricid) {
    return c.json({ error: 'post not found', params: { url } }, 404);
  }
  const { uri } = uricid;

  const result = await db
    .select()
    .from(bookmarks)
    .where(and(eq(bookmarks.sub, sub), eq(bookmarks.uri, uri)))
    .get();

  if (result && !result.isDeleted) {
    await db
      .update(bookmarks)
      .set({
        isDeleted: true,
        updatedAt: sql`(DATETIME('now', 'localtime'))`,
      })
      .where(and(eq(bookmarks.uri, uri), eq(bookmarks.sub, sub)));
    return c.json({ status: 'deleted', params: { url } }, 200);
  }
  return c.json({ error: 'bookmark not found', params: { url } }, 404);
}
