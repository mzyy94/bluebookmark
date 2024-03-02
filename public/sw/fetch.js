// @ts-check
/// <reference no-default-lib="true"/>
/// <reference lib="es2015" />
/// <reference lib="webworker" />

/**
 * call /api/bookmark
 *
 * @param {string} method
 * @param {string} url
 * @returns {Promise<{error: string, status: string}>}
 */
async function callBookmarkAPI(method, url) {
  const body = new FormData();
  body.append('url', url);
  const { token } = await getTokenFromIndexedDB();
  const res = await fetch('/api/bookmark', {
    method,
    body,
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return res.json();
}

/**
 * Find Blueksy URL in FormData
 *
 * @param {FormData} formData
 * @returns {string | undefined}
 */
function findPostURL(formData) {
  /** @type {string | undefined} */
  let url;
  formData.forEach((data, _) => {
    if (typeof data !== 'string') return;
    const matched =
      data.match(
        /https:\/\/bsky.(app|social)\/profile\/[a-zA-Z0-9\.-]+\/post\/\w+/,
      ) ?? [];
    url = url ?? matched[0];
  });
  return url;
}

// @ts-expect-error force cast
/** @type {ServiceWorkerGlobalScope} */ (self).addEventListener(
  'fetch',
  (event) => {
    const url = new URL(event.request.url);
    if (event.request.method === 'POST' && url.pathname === '/bookmark') {
      event.respondWith(
        (async () => {
          const formData = await event.request.formData();
          const postURL = findPostURL(formData);
          const method = formData.get('method')?.toString() ?? 'POST';
          if (postURL) {
            const json = await callBookmarkAPI(method, postURL);
            switch (json.status) {
              case 'created':
                return Response.redirect('/success.html?Bookmark%20Added');
              case 'deleted':
                return Response.redirect('/success.html?Bookmark%20Deleted');
            }
            switch (json.error) {
              case 'already bookmarked':
                return Response.redirect(
                  `/confirm.html?url=${encodeURIComponent(postURL)}`,
                );
              default:
                return Response.redirect(
                  `/error.html?${encodeURIComponent(json.error)}`,
                );
            }
          }
          return Response.redirect('/error.html');
        })(),
      );
    }
  },
);
