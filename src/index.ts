import { Hono } from 'hono';
import { wellKnown } from './well-known';
import { getFeedSkeleton } from './feed';
import { registerAccount, validateRegisterForm } from './register';
import { JwtAuth, handlePostBookmark, validatePostURLForm } from './bookmark';

const app = new Hono();
app.get('/', (c) => c.text('Hello World!!'));
app.get('/.well-known/did.json', wellKnown);
app.get('/xrpc/app.bsky.feed.getFeedSkeleton', getFeedSkeleton);
app.post('/api/register', validateRegisterForm, registerAccount);
app.post('/api/bookmark', JwtAuth, validatePostURLForm, handlePostBookmark);

export default app;
