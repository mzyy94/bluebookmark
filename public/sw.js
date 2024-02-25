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

self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      addToCache([
        '/',
        '/index.html',
        '/index.js',
        '/success.html',
        '/error.html',
      ]),
      self.skipWaiting(),
    ]),
  );
});

self.addEventListener('message', async (event) => {
  const token = event.data.token;
  if (token) {
    await saveTokenToIndexedDB(token);
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

importScripts('./sw/token.js', './sw/fetch.js');
