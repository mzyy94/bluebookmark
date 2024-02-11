import { Hono } from 'hono';
import { wellKnown } from './well-known';
import { getFeedSkeleton } from './feed';
import { registerAccount, validateRegisterForm } from './register';
import {
  JwtAuth,
  handlePostBookmark,
  handleDeleteBookmark,
  validatePostURLForm,
} from './bookmark';
import { signUpPage } from './page';

const app = new Hono();
app.get('/', (c) => c.html(signUpPage));
app.get('/.well-known/did.json', wellKnown);
app.get('/xrpc/app.bsky.feed.getFeedSkeleton', getFeedSkeleton);
app.post('/api/register', validateRegisterForm, registerAccount);
app.use('/api/bookmark', JwtAuth, validatePostURLForm);
app.post('/api/bookmark', handlePostBookmark);
app.delete('/api/bookmark', handleDeleteBookmark);

export default app;
