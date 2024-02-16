import type { Context } from 'hono';
import { env } from 'hono/adapter';
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

const feedSkeletonCacheKey = (
  c: Context,
  iss: string,
  limit: number,
  begin: string | undefined,
  end: string,
) => {
  const { FEED_HOST } = env<{ FEED_HOST: string }>(c);
  const url = new URL(
    `https://${FEED_HOST}/xrpc/app.bsky.feed.getFeedSkeleton?internal`,
  );
  url.searchParams.append('iss', iss);
  url.searchParams.append('limit', limit.toString(10));
  if (begin) {
    url.searchParams.append('begin', begin);
  }
  url.searchParams.append('end', end);
  return new Request(url);
};

export async function getFeedSkeletonFromCache(
  c: Context,
  iss: string,
  limit: number,
  begin: string | undefined,
  end: string,
) {
  const cache = await caches.open('feed-skeleton');
  const req = feedSkeletonCacheKey(c, iss, limit, begin, end);
  return cache.match(req);
}

export async function putFeedSkeletonToCache(
  c: Context,
  iss: string,
  limit: number,
  begin: string | undefined,
  end: string,
  res: Response,
) {
  const cache = await caches.open('feed-skeleton');
  const req = feedSkeletonCacheKey(c, iss, limit, begin, end);
  return cache.put(req, res);
}
