import { createMiddleware } from 'hono/factory';

export const errorLogger = createMiddleware(async (c, next) => {
  await next();
  if (c.res.status >= 400) {
    if (c.res.headers.get('Content-Type')?.includes('json')) {
      const json = await c.res.clone().json();
      console.warn(json);
    } else {
      const text = await c.res.clone().text();
      console.warn(text);
    }
  }
});
