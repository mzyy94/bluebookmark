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

type DidDoc = {
  '@context': string[];
  id: string;
  verificationMethod: {
    id: string;
    type: string;
    controller: string;
    publicKeyMultibase: strnig;
  }[];
};

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
      didDoc: DidDoc;
      handle: string;
    }
  >,
  '/'
>;

export type GetRecord = Hono<
  Env,
  ToSchema<
    'get',
    '/xrpc/com.atproto.repo.getRecord',
    {
      query: {
        repo: string;
        collection: string;
        rkey: string;
      };
    },
    {
      uri: string;
      cid: string;
      value: {
        text: string;
        $type: string;
        createdAt: string;
      };
    }
  >,
  '/'
>;
