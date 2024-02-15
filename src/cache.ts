import type { DidDoc } from './at-proto';

const didDocCacheKey = (did: string) =>
  new Request(
    `https://bsky.social/xrpc/com.atproto.repo.describeRepo?repo=${did}`,
  );

export async function getDidDocFromCache(did: string) {
  const cache = await caches.open('pubkey');
  const req = didDocCacheKey(did);
  const res = await cache.match(req);
  return res?.json<DidDoc>();
}

export async function putDidDocToCache(didDoc: DidDoc) {
  const cache = await caches.open('pubkey');
  const req = didDocCacheKey(didDoc.id);
  const res = new Response(JSON.stringify(didDoc));
  return cache.put(req, res);
}

export async function openPostRecordCache(url: URL) {
  const cache = await caches.open('post-record');
  const req = new Request(url);
  return { req, cache };
}
