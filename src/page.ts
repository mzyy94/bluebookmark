import { createMiddleware } from 'hono/factory';
import { html } from 'hono/html';

const tokenResult = (token: string) => html`
<input id="token" value="${token}" hx-on:focus="this.select()" hx-on:click="copyToClipboard()">
`;

const errorResult = (error: string) => html`
<b>Error</b>
<span>${error}</span>
`;

export const htmxResponse = createMiddleware(async (c, next) => {
  await next();
  if (c.req.header('HX-Request')) {
    const body: { token: string; error: string } = await c.res.json();
    if (c.res.status === 200) {
      c.res = await c.html(tokenResult(body.token));
    } else {
      c.res = await c.html(errorResult(body.error));
    }
  }
});
