import { createMiddleware } from 'hono/factory';
import { html } from 'hono/html';

const tokenResult = (token: string) => html`
<input id="token" value="${token}" hx-on:focus="this.select()" hx-on:click="copyToClipboard()" hx-on::load="htmx.find('#copyToken').checked && copyToClipboard(true)">
<p>Copy this token and paste on to bookmark shortcut</p>
<p>iOS shortcut: <a href="https://www.icloud.com/shortcuts/bf64334da98343f79d03bf012e48bf51" target="_blank">Download</a></p>
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
