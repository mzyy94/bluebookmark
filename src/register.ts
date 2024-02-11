import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { hc } from 'hono/client';
import type { CreateSession } from './at-proto';
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
  const res = await hc<CreateSession>('https://bsky.social').xrpc[
    'com.atproto.server.createSession'
  ].$post({ json: { identifier: handle, password } });

  if (!res.ok) {
    return c.json({ error: 'authentication failed' }, 400);
  }

  const { did, handle: handleName, didDoc } = await res.json();
  if (handle !== handleName) {
    return c.json({ error: 'unexpected handle name' }, 400);
  }

  for (const method of didDoc.verificationMethod) {
    if (method.type === 'Multikey' && method.publicKeyMultibase) {
      const { did_key_store } = env<{ did_key_store: KVNamespace }>(c);
      await did_key_store.put(did, method.publicKeyMultibase);
      break;
    }
  }

  const { JWT_SECRET } = env<{ JWT_SECRET: string }>(c);
  const token = await sign(
    { sub: did, iat: Math.floor(Date.now() / 1000) },
    JWT_SECRET,
  );

  return c.json({ token });
}
