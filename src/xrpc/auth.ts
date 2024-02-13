import type { Context } from 'hono';
import { decode } from 'hono/jwt';
import { verifyJwt } from './verify';
import { fetchPubkey, getPubkey, savePubkey } from '../pubkey';
import { HTTPException } from 'hono/http-exception';
import { createMiddleware } from 'hono/factory';
import { ClientErrorStatusCode } from 'hono/utils/http-status';
import { env } from 'hono/adapter';

type Option =
  | {
      allowGuest?: boolean;
    }
  | undefined;

// https://atproto.com/specs/xrpc#inter-service-authentication-temporary-specification
export const XrpcAuth = (opt: Option) =>
  createMiddleware(async (c, next) => {
    const jwt = c.req
      .header('Authorization')
      ?.match(/^Bearer\s+([\w-]+\.[\w-]+\.[\w-]+)/)?.[1];

    if (!jwt) {
      throw clientError(c, 400, 'bad request', 'no authorization header');
    }

    let iss: string | undefined;
    let aud: string | undefined;
    let exp: number | undefined;
    try {
      ({
        payload: { iss, exp, aud },
      } = decode(jwt));
    } catch {
      throw clientError(c, 401, 'unauthorized', 'malformed token');
    }

    if (!exp || !iss || exp * 1000 < Date.now()) {
      // invalid jwt
      throw clientError(c, 401, 'unauthorized', 'invalid token payload');
    }

    const { FEED_HOST } = env<{ FEED_HOST: string }>(c);
    if (aud !== `did:web:${FEED_HOST}`) {
      throw clientError(c, 401, 'unauthorized', 'malformed token');
    }

    const pubkey = await getPubkey(c, iss);
    if (!pubkey) {
      if (opt?.allowGuest) {
        // not registered. handle next handler with undefined 'iss'
        await next();
        return;
      }
      throw clientError(c, 403, 'forbidden', 'access forbidden');
    }

    const verified = await verifyJwt(jwt, pubkey);
    if (!verified) {
      // refresh did key and re-verify
      const pubkey = await fetchPubkey(iss);
      if (!pubkey) {
        // error on xrpc request to bsky server
        throw new HTTPException(502, {
          res: c.json({ error: 'request public key failure' }, 502),
        });
      }
      const verified = await verifyJwt(jwt, pubkey);
      if (!verified) {
        throw clientError(c, 401, 'unauthorized', 'token verification failure');
      }
      await savePubkey(c, iss, pubkey);
    }

    c.set('iss', iss);
    await next();
  });

function clientError(
  c: Context,
  code: ClientErrorStatusCode,
  message: string,
  description: string,
) {
  const reason = code === 401 ? 'invalid_token' : 'invalid_request';
  return new HTTPException(code, {
    res: c.json({ error: message }, code, {
      'WWW-Authenticate': `Bearer realm="${c.req.url}",error="${reason}",error_description="${description}"`,
    }),
  });
}
