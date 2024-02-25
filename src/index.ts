import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { deleteBookmarkHandlers, postBookmarkHandlers } from './api/bookmark';
import { registerAccount } from './api/register';
import { errorLogger } from './logger';
import { signUpPage } from './page';
import { wellKnown } from './well-known';
import { getFeedSkeletonHandlers } from './xrpc/feed';

const queryLogger = createMiddleware(async (c, next) => {
  const query = c.req.query();
  console.log('Request query:', query);
  return next();
});

const app = new Hono();
app.use(queryLogger);
app.use(errorLogger);
app.notFound((c) => c.json({ message: 'Not Found', error: 'not found' }, 404));
app.get('/', (c) => c.html(signUpPage));
app.get('/.well-known/did.json', ...wellKnown);
app.get('/xrpc/app.bsky.feed.getFeedSkeleton', ...getFeedSkeletonHandlers);
app.post('/api/register', ...registerAccount);
app.post('/api/bookmark', ...postBookmarkHandlers);
app.delete('/api/bookmark', ...deleteBookmarkHandlers);

export default app;
