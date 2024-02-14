import { env } from 'hono/adapter';
import { cache } from 'hono/cache';
import { createFactory } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';

const factory = createFactory();

export const wellKnown = factory.createHandlers(
  cache({ cacheName: 'well-known' }),
  (c) => {
    const { FEED_HOST } = env<{ FEED_HOST: string }>(c);
    if (new URL(c.req.url).host !== FEED_HOST) {
      throw new HTTPException(404, {
        res: c.json({ message: 'Not Found', error: 'not found' }, 404),
      });
    }

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
  },
);
