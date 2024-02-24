import { zValidator } from '@hono/zod-validator';
import { drizzle } from 'drizzle-orm/d1';
import { env } from 'hono/adapter';
import { hc } from 'hono/client';
import { createFactory } from 'hono/factory';
import { sign } from 'hono/jwt';
import { z } from 'zod';
import type { CreateSession, GetProfiles } from '../at-proto';
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

async function checkValidUser(
  self: string,
  owner: string,
  token: string,
  emailOk: boolean,
) {
  if (!emailOk) {
    return false;
  }
  const res = await hc<GetProfiles>('https://bsky.social').xrpc[
    'app.bsky.actor.getProfiles'
  ].$get({
    query: { actors: [self, owner] },
    header: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    return false;
  }

  const { profiles } = await res.json();
  const [{ labels }, { viewer }] = profiles;
  const unacceptable = ['hate', 'spam', 'impersonation', 'illegal'];

  if (labels.find(({ val }) => unacceptable.includes(val))) {
    return false;
  }
  if (viewer.blockedBy || viewer.muted || viewer.blocking) {
    return false;
  }
  return true;
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
    const { did, didDoc, accessJwt, emailConfirmed: email } = await res.json();

    const { FEED_OWNER, DB } = env<{ FEED_OWNER: string; DB: D1Database }>(c);
    if (identifier !== FEED_OWNER) {
      const ok = await checkValidUser(did, FEED_OWNER, accessJwt, email);
      if (!ok) {
        return c.json({ error: 'forbidden' }, 403);
      }
    }

    const now = Math.floor(Date.now() / 1000);

    const db = drizzle(DB, { logger: true });
    await db
      .insert(users)
      .values({ handle: identifier, user: did })
      .onConflictDoUpdate({
        target: users.user,
        set: { handle: identifier, issuedAt: now },
      });
    await savePubkey(c, didDoc.id, findPubkey(didDoc) ?? '');

    const { JWT_SECRET } = env<{ JWT_SECRET: string }>(c);
    const token = await sign(
      { sub: did, iat: now, exp: now + 30 * 24 * 60 * 60 },
      JWT_SECRET,
    );

    return c.json({ token });
  },
);
