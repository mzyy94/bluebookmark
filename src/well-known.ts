import type { Context } from 'hono';

export function wellKnown(c: Context) {
  return c.json({
    '@context': ['https://www.w3.org/ns/did/v1'],
    id: `did:web:${c.req.header('host')}`,
    alsoKnownAs: [],
    authentication: null,
    verificationMethod: [],
    service: [
      {
        id: '#bsky_fg',
        type: 'BskyFeedGenerator',
        serviceEndpoint: `https://${c.req.header('host')}`,
      },
    ],
  });
}
