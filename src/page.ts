import { createMiddleware } from 'hono/factory';
import { html } from 'hono/html';

export const signUpPage = html`<!doctype html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bluesky Bookmark Feed</title>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Roboto:300,700">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/normalize/8.0.1/normalize.css">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/milligram/1.4.1/milligram.css">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/htmx/1.9.10/htmx.min.js" integrity="sha512-9qpauSP4+dDIldsrdNEZ2Z7JoyLZGfJsAP2wfXnc3drOh+5NXOBxjlq3sGXKdulmN9W+iwLxRt42zKMa8AHEeg==" crossorigin="anonymous" referrerpolicy="no-referrer"></script>

  <script>
    function copyToClipboard(noticeFailed) {
      const token = htmx.find('#token').value;
      setTimeout(async () =>
        await navigator.clipboard.writeText(token).then(
          () => alert('Token copied!'),
          () => noticeFailed && alert('Token copy failed'),
        )
        , 0);
    }
  </script>
</head>

<body>
  <div class="container" style="margin-top: 20vh">
    <h1>BlueBookmark</h1>
    <form hx-post="/api/register" autocapitalize="none" hx-target="#result">
      <fieldset>
        <label for="nameField">Handle Name</label>
        <input type="text" inputmode="url" autocomplete="url" placeholder="username.bsky.social" id="nameField" name="handle" required>
        <label for="passField">App Password</label>
        <input type="password" autocomplete="current-password" placeholder="bsky-app-pass-word" id="passField" name="password" required>
        <div class="float-right">
          <input type="checkbox" id="copyToken" checked>
          <label class="label-inline" for="copyToken">Copy token on complete</label>
        </div>
        <input class="button-primary" type="submit" value="Create Token">
      </fieldset>
    </form>
    <div id="result" hx-swap="innerHTML">
    </div>
  </div>
</body>

</html>`;

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
