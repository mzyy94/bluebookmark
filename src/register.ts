import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { hc } from 'hono/client';
import { ResolveHandle, CreateSession } from './at-proto';
import { sign } from 'hono/jwt';
import { env } from 'hono/adapter';

export const validateRegisterForm = zValidator(
  'form',
  z.object({
    handle: z.string(),
    password: z.string(),
  }),
);

type ValidatedFormContext = Parameters<typeof validateRegisterForm>[0];
export async function registerAccount(c: ValidatedFormContext) {
  const { handle, password } = c.req.valid('form');
  let res = await hc<ResolveHandle>('https://bsky.social').xrpc[
    'com.atproto.identity.resolveHandle'
  ].$get({ query: { handle } });

  if (!res.ok) {
    return c.json({ error: 'invalid handle' }, 400);
  }
  const { did } = await res.json();

  res = await hc<CreateSession>('https://bsky.social').xrpc[
    'com.atproto.server.createSession'
  ].$post({ json: { identifier: did, password } });

  if (!res.ok) {
    return c.json({ error: 'authentication failed' }, 400);
  }

  const { did: sub } = await res.json();
  if (did !== sub) {
    return c.json({ error: 'unexpected handle' }, 400);
  }

  const { JWT_SECRET } = env<{ JWT_SECRET: string }>(c);
  const token = await sign({ sub }, JWT_SECRET);

  return c.json({ token });
}
