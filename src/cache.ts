import type { Context } from 'hono';
import { env } from 'hono/adapter';

const pubkeyCacheKey = (did: string) =>
  new Request(
    `https://bsky.social/xrpc/com.atproto.repo.describeRepo?repo=${did}&pubkey`,
  );

export async function getPubkeyFromCache(did: string) {
  const cache = await caches.open('pubkey');
  const req = pubkeyCacheKey(did);
  const res = await cache.match(req);
  return res?.text() ?? null;
}

export async function putPubkeyToCache(did: string, pubkey: string) {
  const cache = await caches.open('pubkey');
  const req = pubkeyCacheKey(did);
  const res = new Response(pubkey);
  return cache.put(req, res);
}

export async function openPostRecordCache(url: URL) {
  const cache = await caches.open('post-record');
  const req = new Request(url);
  return { req, cache };
}

const feedCacheKey = (c: Context, iss: string, latest: boolean) => {
  const { FEED_HOST } = env<{ FEED_HOST: string }>(c);
  const url = new URL(
    `https://${FEED_HOST}/xrpc/app.bsky.feed.getFeedSkeleton?internal=3`,
  );
  url.searchParams.append('latest', `${latest}`);
  url.searchParams.append('iss', iss);
  return new Request(url);
};

type BookmarkFeed = {
  post: string;
  cid: string;
  updatedAt: number;
  rowid: number;
}[];

export async function getFeedFromCache(
  c: Context,
  iss: string,
  isLatest: boolean,
) {
  const cache = await caches.open('feed-cache');
  const req = feedCacheKey(c, iss, isLatest);
  const res = await cache.match(req);
  if (!res) {
    return { feed: null, opId: 0 };
  }
  const opId = parseInt(res.headers.get('X-OperationId') ?? '0', 10);
  return {
    feed: await res.json<BookmarkFeed>(),
    opId,
  };
}

export async function putFeedToCache(
  c: Context,
  iss: string,
  feed: BookmarkFeed,
  operationId: number,
  isLatest: boolean,
) {
  const cache = await caches.open('feed-cache');
  const req = feedCacheKey(c, iss, isLatest);
  const res = new Response(JSON.stringify(feed));
  res.headers.set('X-OperationId', `${operationId}`);
  return cache.put(req, res);
}
