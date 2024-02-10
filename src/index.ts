import { Hono } from 'hono';
import { wellKnown } from './well-known';

const app = new Hono();
app.get('/', (c) => c.text('Hello World!!'));
app.get('/.well-known/did.json', wellKnown);

export default app;
