import { Context } from 'hono';
import type { DescribeRepo, DidDoc } from './at-proto';
import { env } from 'hono/adapter';
import { hc } from 'hono/client';

export function findPubkey(didDoc: DidDoc): string | null {
  for (const method of didDoc.verificationMethod) {
    if (method.type === 'Multikey' && method.publicKeyMultibase) {
      return method.publicKeyMultibase;
    }
  }
  return null;
}

export async function savePubkey(c: Context, did: string, pubkey: string) {
  if (!did || !pubkey) {
    return;
  }

  const { did_key_store, FEED_HOST } = env<{
    did_key_store: KVNamespace;
    FEED_HOST: string;
  }>(c);

  const cache = await caches.open('pubkey');
  const req = new Request(`https://${FEED_HOST}/api/pubkey?did=${did}`);
  const res = new Response(pubkey);
  await cache.put(req, res);

  await did_key_store.put(did, pubkey);
}

export async function getPubkey(c: Context, did: string) {
  const { did_key_store, FEED_HOST } = env<{
    did_key_store: KVNamespace;
    FEED_HOST: string;
  }>(c);

  const cache = await caches.open('pubkey');
  const req = new Request(`https://${FEED_HOST}/api/pubkey?did=${did}`);
  const res = await cache.match(req);
  if (res?.ok) {
    return res.text();
  }
  return did_key_store.get(did);
}

export async function fetchPubkey(did: string) {
  const res = await hc<DescribeRepo>('https://bsky.social').xrpc[
    'com.atproto.repo.describeRepo'
  ].$get({
    query: { repo: did },
  });
  if (!res.ok) {
    return null;
  }
  const { didDoc } = await res.json();
  return findPubkey(didDoc);
}
