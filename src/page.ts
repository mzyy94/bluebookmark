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
      const token = document.querySelector('#token').value;
      setTimeout(async () =>
        await navigator.clipboard.writeText(token).then(
          () => alert('Token copied!'),
          () => noticeFailed && alert('Token copy failed'),
        )
        , 0);
    }

    htmx.defineExtension("set-token", {
      onEvent: function (name, evt) {
        if (name === 'htmx:beforeSwap') {
          const res = JSON.parse(evt.detail.serverResponse)
          if (evt.detail.xhr.status != 200) {
            alert('Login error: ' + JSON.stringify(res.error))
          } else {
            evt.target.value = res.token;
            if (document.querySelector('#copyToken').checked) {
              copyToClipboard(true);
            }
          }
        }
      }
    });
  </script>
  <style>
    .container {
      margin-top: 20vh;
    }

    #token:placeholder-shown,
    #token:placeholder-shown~p {
      display: none;
    }

    #token:not(:placeholder-shown),
    #token:not(:placeholder-shown)~p {
      display: inherit !important;
    }
  </style>
</head>

<body>
  <div class="container">
    <h1>BlueBookmark</h1>
    <form hx-post="/api/register" autocapitalize="none" hx-target="#token">
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
    <div>
      <input id="token" hx-on:focus="this.select()" hx-on:click="copyToClipboard()" hx-ext="set-token" placeholder="token">
      <p>Copy this token and paste on to bookmark shortcut</p>
      <p>iOS shortcut: <a href="https://www.icloud.com/shortcuts/bf64334da98343f79d03bf012e48bf51" target="_blank">Download</a></p>
    </div>
  </div>
</body>

</html>`;
