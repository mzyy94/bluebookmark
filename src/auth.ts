import type { Context, Next } from 'hono';
import { decode } from 'hono/jwt';
import { verifyJwt } from './verify';
import { fetchPubkey, getPubkey, savePubkey } from './pubkey';
import { HTTPException } from 'hono/http-exception';

// https://atproto.com/specs/xrpc#inter-service-authentication-temporary-specification
export async function XrpcAuth(c: Context, next: Next) {
  const jwt = c.req
    .header('Authorization')
    ?.match(/^Bearer\s+([\w-]+\.[\w-]+\.[\w-]+)/)?.[1];

  if (!jwt) {
    throw new HTTPException(400, {
      res: c.text('Bad Request', 400, {
        'WWW-Authenticate': `Bearer realm="${c.req.url}",error="invalid_request"`,
      }),
    });
  }

  const {
    payload: { iss, exp },
  } = decode(jwt);
  if (exp * 1000 < Date.now()) {
    // token expired
    throw new HTTPException(401, {
      res: c.text('Unauthorized', 401, {
        'WWW-Authenticate': `Bearer realm="${c.req.url}",error="invalid_token"`,
      }),
    });
  }

  const pubkey = await getPubkey(c, iss);
  if (!pubkey) {
    // not registered, return empty feed
    throw new HTTPException(200, { res: c.json({ feed: [] }) });
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
          'WWW-Authenticate': `Bearer realm="${c.req.url}",error="invalid_token"`,
        }),
      });
    }
    await savePubkey(c, iss, pubkey);
  }

  c.set('iss', iss);
  await next();
}
