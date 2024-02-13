import type { Context, Next } from 'hono';
import { decode } from 'hono/jwt';
import { verifyJwt } from './verify';
import { fetchPubkey, getPubkey, savePubkey } from './pubkey';
import { HTTPException } from 'hono/http-exception';

type Option =
  | {
      allowGuest?: boolean;
    }
  | undefined;

// https://atproto.com/specs/xrpc#inter-service-authentication-temporary-specification
export const XrpcAuth = (opt: Option) => async (c: Context, next: Next) => {
  const jwt = c.req
    .header('Authorization')
    ?.match(/^Bearer\s+([\w-]+\.[\w-]+\.[\w-]+)/)?.[1];

  if (!jwt) {
    throw new HTTPException(400, {
      res: c.text('Bad Request', 400, {
        'WWW-Authenticate': `Bearer realm="${c.req.url}",error="invalid_request",error_description="no authorization header"`,
      }),
    });
  }

  let iss: string | undefined;
  let exp: number | undefined;
  try {
    const { payload } = decode(jwt);
    iss = payload.iss;
    exp = payload.exp;
  } catch {
    throw new HTTPException(401, {
      res: c.text('Unauthorized', 401, {
        'WWW-Authenticate': `Bearer realm="${c.req.url}",error="invalid_token",error_description="malformed token"`,
      }),
    });
  }

  if (!exp || !iss || exp * 1000 < Date.now()) {
    // invalid jwt
    throw new HTTPException(401, {
      res: c.text('Unauthorized', 401, {
        'WWW-Authenticate': `Bearer realm="${c.req.url}",error="invalid_token",error_description="invalid token payload"`,
      }),
    });
  }

  const pubkey = await getPubkey(c, iss);
  if (!pubkey) {
    if (opt?.allowGuest) {
      // not registered. handle next handler with undefined 'iss'
      await next();
      return;
    }
    throw new HTTPException(403, { message: 'Forbidden' });
  }

  const verified = await verifyJwt(jwt, pubkey);
  if (!verified) {
    // refresh did key and re-verify
    const pubkey = await fetchPubkey(iss);
    if (!pubkey) {
      // error on xrpc request to bsky server
      throw new HTTPException(502, {
        message: 'failed to request describeRepo',
      });
    }
    const verified = await verifyJwt(jwt, pubkey);
    if (!verified) {
      throw new HTTPException(401, {
        res: c.text('Unauthorized', 401, {
          'WWW-Authenticate': `Bearer realm="${c.req.url}",error="invalid_token",error_description="token verification failure"`,
        }),
      });
    }
    await savePubkey(c, iss, pubkey);
  }

  c.set('iss', iss);
  await next();
};
