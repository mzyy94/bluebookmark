// @ts-expect-error only available on production workers
import manifest from '__STATIC_CONTENT_MANIFEST';
import { Hono } from 'hono';
import { serveStatic } from 'hono/cloudflare-workers';
import { deleteBookmarkHandlers, postBookmarkHandlers } from './api/bookmark';
import { registerAccount } from './api/register';
import { errorLogger, queryLogger } from './middleware/logger';
import { wellKnown } from './well-known';
import { getFeedSkeletonHandlers } from './xrpc/feed';

const app = new Hono();
app.use(queryLogger);
app.use(errorLogger);
app.notFound((c) => c.json({ message: 'Not Found', error: 'not found' }, 404));
app.get('/*', serveStatic({ root: './', manifest }));
app.get('/.well-known/did.json', ...wellKnown);
app.get('/xrpc/app.bsky.feed.getFeedSkeleton', ...getFeedSkeletonHandlers);
app.post('/api/register', ...registerAccount);
app.post('/api/bookmark', ...postBookmarkHandlers);
app.delete('/api/bookmark', ...deleteBookmarkHandlers);

export default app;
