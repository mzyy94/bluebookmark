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
import { ControlMode, bookmarks } from '../schema';

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

type PostRecord = Omit<typeof bookmarks.$inferInsert, 'sub'>;

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

    const { sub } = c.get('jwtPayload');
    const { DB } = env<{ DB: D1Database }>(c);
    const db = drizzle(DB);

    const record = await getPostRecord(url);
    if (!record) {
      return c.json({ error: 'post not found', params: { url } }, 404);
    }
    const { repo, rkey, uri, cid } = record;

    const [result] = await db
      .insert(bookmarks)
      .values({ uri, cid, repo, rkey, sub })
      .onConflictDoUpdate({
        target: [bookmarks.uri, bookmarks.sub],
        where: eq(bookmarks.control, ControlMode.Deleted),
        set: {
          control: ControlMode.Active,
          updatedAt: sql`(DATETIME('now', 'localtime'))`,
        },
      })
      .returning();

    if (result) {
      await db
        .insert(bookmarks)
        .values({ ...result, uri: 'added', control: ControlMode.LastAdded })
        .onConflictDoUpdate({
          target: [bookmarks.uri, bookmarks.sub],
          set: {
            updatedAt: sql`(DATETIME('now', 'localtime'))`,
          },
        });
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

    const { sub } = c.get('jwtPayload');
    const { DB } = env<{ DB: D1Database }>(c);
    const db = drizzle(DB);

    const record = await getPostRecord(url);
    if (!record) {
      return c.json({ error: 'post not found', params: { url } }, 404);
    }
    const { uri } = record;

    const [result] = await db
      .update(bookmarks)
      .set({
        control: ControlMode.Deleted,
        updatedAt: sql`(DATETIME('now', 'localtime'))`,
      })
      .where(
        and(
          eq(bookmarks.uri, uri),
          eq(bookmarks.sub, sub),
          eq(bookmarks.control, ControlMode.Active),
        ),
      )
      .returning();

    if (result) {
      await db
        .insert(bookmarks)
        .values({ ...result, uri: 'deleted', control: ControlMode.LastDeleted })
        .onConflictDoUpdate({
          target: [bookmarks.uri, bookmarks.sub],
          set: {
            updatedAt: sql`(DATETIME('now', 'localtime'))`,
          },
        });
      return c.json({ status: 'deleted', params: { url } }, 200);
    }
    return c.json({ error: 'bookmark not found', params: { url } }, 404);
  },
);
