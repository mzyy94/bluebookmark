import { html } from 'hono/html';

export const signUpPage = html`<!doctype html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bluesky Bookmark Feed</title>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Roboto:300,700">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/normalize/8.0.1/normalize.css">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/milligram/1.4.1/milligram.css">

  <script>
  async function register() {
    const form = document.querySelector('form');
    const formData = new FormData(form);
    const request = new Request(form.action, {
      method: form.method,
      body: formData,
    });
    const res = await fetch(request)
    if (res.ok) {
      const { token } = await res.json();
      document.querySelector('#token').value = token;
      document.querySelector('#token').setAttribute('value', token);
      if (document.querySelector('#copyToken').checked) {
        setTimeout(async () =>
          await navigator.clipboard.writeText(token).then(
            () => alert('Token copied!'),
            () => alert('Token copy failed'),
          )
        , 0);
      }
    } else {
      const { error } = await res
        .json()
        .catch(() => ({ error: 'unknown error' }));
      alert('Login error: ' + error);
    }
  }
  </script>
  <style>
    .container {
      margin-top: 20vh;
    }
    #token, #token ~ p {
      display: none;
    }
    #token[value], #token[value] ~ p {
      display: inherit !important;
    }
    </style>
</head>

<body>
  <div class="container">
    <h1>BlueBookmark</h1>
    <form action="/api/register" method="post" autocapitalize="none" onsubmit="register(); return false">
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
      <input id="token" onfocus="this.select()">
      <p>Copy this token and paste on to bookmark shortcut</p>
      <p>iOS shortcut: <a href="https://www.icloud.com/shortcuts/bf64334da98343f79d03bf012e48bf51" target="_blank">Download</a></p>
    </div>
  </div>
</body>

</html>`;
