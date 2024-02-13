import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { hc } from 'hono/client';
import type { CreateSession, GetProfile } from '../at-proto';
import { sign } from 'hono/jwt';
import { env } from 'hono/adapter';
import { savePubkey } from '../pubkey';

export const validateRegisterForm = zValidator(
  'form',
  z.object({
    handle: z.string().min(3).includes('.'),
    password: z.string().min(1),
  }),
);

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
  return viewer.followedBy && viewer.following;
}

type ValidatedFormContext = Parameters<typeof validateRegisterForm>[0];
export async function registerAccount(c: ValidatedFormContext) {
  const { handle, password } = c.req.valid('form');
  const res = await hc<CreateSession>('https://bsky.social').xrpc[
    'com.atproto.server.createSession'
  ].$post({ json: { identifier: handle, password } });

  if (!res.ok) {
    return c.json({ error: 'authentication failed' }, 400);
  }

  const { did, handle: handleName, didDoc, accessJwt } = await res.json();
  if (handle !== handleName) {
    return c.json({ error: 'unexpected handle name' }, 400);
  }

  const { FEED_OWNER } = env<{ FEED_OWNER: string }>(c);
  if (handle !== FEED_OWNER) {
    const ok = await checkFollowingFeedOwner(FEED_OWNER, accessJwt);
    if (!ok) {
      return c.json({ error: 'forbidden' }, 403);
    }
  }

  await savePubkey(c, didDoc);

  const { JWT_SECRET } = env<{ JWT_SECRET: string }>(c);
  const token = await sign(
    { sub: did, iat: Math.floor(Date.now() / 1000) },
    JWT_SECRET,
  );

  return c.json({ token });
}
