// @ts-check
/// <reference no-default-lib="true"/>
/// <reference lib="es2015" />
/// <reference lib="dom" />

/**
 *
 * @param {boolean} noticeFailed
 */
function copyToClipboard(noticeFailed) {
  const token = /** @type {HTMLInputElement} */ (
    document.querySelector('#token')
  ).value;
  navigator.serviceWorker.getRegistration().then((reg) => {
    reg?.active?.postMessage({ token });
  });
  setTimeout(
    async () =>
      await navigator.clipboard.writeText(token).then(
        () => alert('Token copied!'),
        () => noticeFailed && alert('Token copy failed'),
      ),
    0,
  );
}

const registerServiceWorker = async () => {
  if (!('serviceWorker' in navigator)) return;

  const registration = await navigator.serviceWorker.getRegistration();
  if (registration) {
    registration.update();
  } else {
    await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    });
  }
};

registerServiceWorker();
