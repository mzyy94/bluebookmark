import type { Context } from 'hono';
import { env } from 'hono/adapter';

export function wellKnown(c: Context) {
  const { FEED_HOST } = env<{ FEED_HOST: string }>(c);
  return c.json({
    '@context': ['https://www.w3.org/ns/did/v1'],
    id: `did:web:${FEED_HOST}`,
    alsoKnownAs: [],
    authentication: null,
    verificationMethod: [],
    service: [
      {
        id: '#bsky_fg',
        type: 'BskyFeedGenerator',
        serviceEndpoint: `https://${FEED_HOST}`,
      },
    ],
  });
}
