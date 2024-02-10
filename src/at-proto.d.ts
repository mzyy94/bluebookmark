import type { Hono } from 'hono';
import type { Env, ToSchema } from 'hono/types';

export type ResolveHandle = Hono<
  Env,
  ToSchema<
    'get',
    '/xrpc/com.atproto.identity.resolveHandle',
    {
      query: {
        handle: string;
      };
    },
    {
      did: string;
    }
  >,
  '/'
>;

export type CreateSession = Hono<
  Env,
  ToSchema<
    'post',
    '/xrpc/com.atproto.server.createSession',
    {
      json: {
        identifier: string;
        password: string;
      };
    },
    {
      did: string;
    }
  >,
  '/'
>;
