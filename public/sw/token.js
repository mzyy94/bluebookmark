// @ts-check
/// <reference no-default-lib="true"/>
/// <reference lib="es2015" />
/// <reference lib="webworker" />

/**
 * Save token into IndexedDB
 *
 * @param {string} token
 * @returns {Promise<null>}
 */
function saveTokenToIndexedDB(token) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('bluebookmark', 1);
    request.onupgradeneeded = (event) => {
      // @ts-ignore
      const db = /** @type {IDBDatabase} */ (event.target.result);
      db.createObjectStore('config', { keyPath: 'usage' });
    };
    request.onerror = reject;
    request.onsuccess = (event) => {
      // @ts-ignore
      const db = /** @type {IDBDatabase} */ (event.target.result);
      const put = db
        .transaction('config', 'readwrite')
        .objectStore('config')
        .put({ usage: 'token', token });
      put.onsuccess = () => {
        db.close();
        resolve(null);
      };
      put.onerror = (e) => {
        db.close();
        reject(e);
      };
    };
  });
}

/**
 * Get token from IndexedDB
 *
 * @returns {Promise<{token: string}>}
 */
function getTokenFromIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('bluebookmark', 1);
    request.onerror = reject;
    request.onsuccess = (event) => {
      // @ts-ignore
      const db = /** @type {IDBDatabase} */ (event.target.result);
      const get = db
        .transaction('config', 'readwrite')
        .objectStore('config')
        .get('token');
      get.onsuccess = (e) => {
        db.close();
        // @ts-ignore
        resolve(e.target.result);
      };
      get.onerror = (e) => {
        db.close();
        reject(e);
      };
    };
  });
}
