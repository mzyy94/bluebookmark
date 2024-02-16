import type { Context } from 'hono';
import { env } from 'hono/adapter';
import { ControlMode } from './schema';

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

const feedCacheKey = (c: Context, iss: string) => {
  const { FEED_HOST } = env<{ FEED_HOST: string }>(c);
  const url = new URL(
    `https://${FEED_HOST}/xrpc/app.bsky.feed.getFeedSkeleton?internal=2`,
  );
  url.searchParams.append('iss', iss);
  return new Request(url);
};

type AllFeed = { post: string; cid: string; updatedAt: number }[];

export async function getAllFeedFromCache(c: Context, iss: string) {
  const cache = await caches.open('feed-cache');
  const req = feedCacheKey(c, iss);
  const res = await cache.match(req);
  if (!res) {
    return { allFeed: null, lastUpdate: null };
  }
  const lastMod = res.headers.get('Last-Modified');
  return {
    allFeed: await res.json<AllFeed>(),
    lastUpdate: lastMod && Date.parse(lastMod) / 1000,
  };
}

export async function putAllFeedToCache(
  c: Context,
  iss: string,
  allFeed: AllFeed,
) {
  const cache = await caches.open('feed-cache');
  const req = feedCacheKey(c, iss);
  const res = new Response(JSON.stringify(allFeed));
  return cache.put(req, res);
}
