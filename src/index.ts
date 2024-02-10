import { Hono } from 'hono';
import { wellKnown } from './well-known';
import { getFeedSkeleton } from './feed';

const app = new Hono();
app.get('/', (c) => c.text('Hello World!!'));
app.get('/.well-known/did.json', wellKnown);
app.get('/xrpc/app.bsky.feed.getFeedSkeleton', getFeedSkeleton);

export default app;
