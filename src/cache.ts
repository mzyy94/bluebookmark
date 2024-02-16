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

const feedCacheKey = (
  c: Context,
  iss: string,
  marker: { control: ControlMode; updatedAt: number }[],
) => {
  const added =
    marker.find((m) => m.control === ControlMode.LastAdded)?.updatedAt ?? 0;
  const deleted =
    marker.find((m) => m.control === ControlMode.LastDeleted)?.updatedAt ?? 0;
  const { FEED_HOST } = env<{ FEED_HOST: string }>(c);
  const url = new URL(
    `https://${FEED_HOST}/xrpc/app.bsky.feed.getFeedSkeleton?internal`,
  );
  url.searchParams.append('iss', iss);
  url.searchParams.append('added', added.toString(10));
  url.searchParams.append('deleted', deleted.toString(10));
  return new Request(url);
};

type AllFeed = { post: string; cid: string; updatedAt: number }[];

export async function getAllFeedFromCache(
  c: Context,
  iss: string,
  marker: { control: ControlMode; updatedAt: number }[],
) {
  const cache = await caches.open('feed-cache');
  const req = feedCacheKey(c, iss, marker);
  const res = await cache.match(req);
  return res?.json<AllFeed>();
}

export async function putAllFeedToCache(
  c: Context,
  iss: string,
  marker: { control: ControlMode; updatedAt: number }[],
  allFeed: AllFeed,
) {
  const cache = await caches.open('feed-cache');
  const req = feedCacheKey(c, iss, marker);
  const res = new Response(JSON.stringify(allFeed));
  return cache.put(req, res);
}
