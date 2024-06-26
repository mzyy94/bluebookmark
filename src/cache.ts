import type { Context } from 'hono';
import { env } from 'hono/adapter';
import { Range } from './xrpc/range';

const pubkeyCacheKey = (did: string) =>
  new Request(
    `https://bsky.social/xrpc/com.atproto.repo.describeRepo?repo=${did}&pubkey`,
  );

export async function getPubkeyFromCache(did: string) {
  const cache = await caches.open('pubkey');
  const req = pubkeyCacheKey(did);
  const res = await cache.match(req);
  if (!res) {
    return null;
  }
  console.debug(`public key cache hit! ${did}`);
  return res.text();
}

export async function putPubkeyToCache(did: string, pubkey: string) {
  const cache = await caches.open('pubkey');
  const req = pubkeyCacheKey(did);
  const res = new Response(pubkey);
  console.debug(`put new public key for '${did}' to cache`);
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
    `https://${FEED_HOST}/xrpc/app.bsky.feed.getFeedSkeleton?internal=4`,
  );
  url.searchParams.append('latest', `${latest}`);
  url.searchParams.append('iss', iss);
  return new Request(url);
};

type BookmarkFeed = {
  post: string;
  cid: string;
  createdAt: number;
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
    return { feedItems: null, opId: 0, range: new Range([]) };
  }
  const opId = Number.parseInt(res.headers.get('X-OperationId') ?? '0', 10);
  const range = new Range(JSON.parse(res.headers.get('X-Range') ?? '[]'));
  console.debug('feed cache hit!', { iss, isLatest, opId, range });
  return {
    feedItems: await res.json<BookmarkFeed>(),
    opId,
    range,
  };
}

export async function putFeedToCache(
  c: Context,
  iss: string,
  feed: BookmarkFeed,
  opId: number,
  range: Range,
  isLatest: boolean,
) {
  const cache = await caches.open('feed-cache');
  const req = feedCacheKey(c, iss, isLatest);
  const res = new Response(JSON.stringify(feed));
  res.headers.set('X-OperationId', `${opId}`);
  res.headers.set('X-Range', range.toString());
  console.debug('put feed cache', { iss, isLatest, opId, range });
  return cache.put(req, res);
}
