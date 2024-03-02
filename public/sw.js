// @ts-check
/// <reference no-default-lib="true"/>
/// <reference lib="es2015" />
/// <reference lib="webworker" />

/**
 *
 * @param {Array.<string>} resources
 */
const addToCache = async (resources) => {
  const cache = await caches.open('v1');
  await cache.addAll(resources);
};

// @ts-expect-error force cast
/** @type {ServiceWorkerGlobalScope} */ (self).addEventListener(
  'install',
  (event) => {
    event.waitUntil(
      Promise.all([
        addToCache([
          '/',
          '/index.html',
          '/index.js',
          '/success.html',
          '/error.html',
          '/confirm.html',
        ]),
        // @ts-expect-error force cast
        /** @type {ServiceWorkerGlobalScope} */ (self).skipWaiting(),
      ]),
    );
  },
);

self.addEventListener('message', async (event) => {
  const token = event.data.token;
  if (token) {
    await saveTokenToIndexedDB(token);
  }
});

// @ts-expect-error force cast
/** @type {ServiceWorkerGlobalScope} */ (self).addEventListener(
  'activate',
  (event) => {
    event.waitUntil(
      // @ts-expect-error force cast
      /** @type {ServiceWorkerGlobalScope} */ (self).clients.claim(),
    );
  },
);

importScripts('./sw/token.js', './sw/fetch.js');
