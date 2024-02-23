import { zValidator } from '@hono/zod-validator';
import { drizzle } from 'drizzle-orm/d1';
import { env } from 'hono/adapter';
import { hc } from 'hono/client';
import { createFactory } from 'hono/factory';
import { sign } from 'hono/jwt';
import { z } from 'zod';
import type { CreateSession, GetProfile } from '../at-proto';
import { findPubkey, savePubkey } from '../pubkey';
import { users } from '../schema';

const validateRegisterForm = zValidator(
  'form',
  z.object({
    handle: z.string().min(3).includes('.'),
    password: z.string().min(1),
  }),
);

const factory = createFactory();

async function checkFollowingFeedOwner(actor: string, token: string) {
  const res = await hc<GetProfile>('https://bsky.social').xrpc[
    'app.bsky.actor.getProfile'
  ].$get({
    query: { actor },
    header: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    return false;
  }
  const { viewer } = await res.json();
  if (viewer.blockedBy || viewer.muted || viewer.blocking) {
    return false;
  }
  return !!viewer.following;
}

export const registerAccount = factory.createHandlers(
  validateRegisterForm,
  async (c) => {
    const { handle, password } = c.req.valid('form');
    const identifier = handle.startsWith('@') ? handle.slice(1) : handle;
    const res = await hc<CreateSession>('https://bsky.social').xrpc[
      'com.atproto.server.createSession'
    ].$post({ json: { identifier, password } });

    if (!res.ok) {
      return c.json({ error: 'authentication failed' }, 400);
    }

    const { did, handle: handleName, didDoc, accessJwt } = await res.json();
    if (identifier !== handleName) {
      return c.json({ error: 'unexpected handle name' }, 400);
    }

    const { FEED_OWNER, DB } = env<{ FEED_OWNER: string; DB: D1Database }>(c);
    if (identifier !== FEED_OWNER) {
      const ok = await checkFollowingFeedOwner(FEED_OWNER, accessJwt);
      if (!ok) {
        return c.json({ error: 'forbidden' }, 403);
      }
    }

    const db = drizzle(DB);
    await db
      .insert(users)
      .values({ handle: handleName, sub: did })
      .onConflictDoNothing();

    await savePubkey(c, didDoc.id, findPubkey(didDoc) ?? '');

    const { JWT_SECRET } = env<{ JWT_SECRET: string }>(c);
    const now = Math.floor(Date.now() / 1000);
    const token = await sign(
      { sub: did, iat: now, exp: now + 30 * 24 * 60 * 60 },
      JWT_SECRET,
    );

    return c.json({ token });
  },
);
