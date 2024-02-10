import type { Context } from 'hono';

export function getFeedSkeleton(c: Context) {
  const feed = [
    {
      post: 'at://did:plc:tq2kkfw7mkrt7rnmih4iq5dn/app.bsky.feed.post/3kl2yskq2p22v',
    },
  ];
  const cid = 'bafyreiby2en7vjm2gp77peuosudy72bbhooycv7y45phtr4xdwltjlogdu';
  const cursor = `${new Date(0).getTime()}::${cid}`;
  return c.json({ cursor, feed });
}
