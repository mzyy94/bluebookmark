import { Hono } from 'hono';
import { wellKnown } from './well-known';
import { getFeedSkeletonHandlers } from './xrpc/feed';
import { registerAccount } from './api/register';
import { postBookmarkHandlers, deleteBookmarkHandlers } from './api/bookmark';
import { signUpPage } from './page';

const app = new Hono();
app.notFound((c) => c.json({ message: 'Not Found', error: 'not found' }, 404));
app.get('/', (c) => c.html(signUpPage));
app.get('/.well-known/did.json', ...wellKnown);
app.get('/xrpc/app.bsky.feed.getFeedSkeleton', ...getFeedSkeletonHandlers);
app.post('/api/register', ...registerAccount);
app.post('/api/bookmark', ...postBookmarkHandlers);
app.delete('/api/bookmark', ...deleteBookmarkHandlers);

export default app;
