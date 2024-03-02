// @ts-check
/// <reference no-default-lib="true"/>
/// <reference lib="es2015" />
/// <reference lib="dom" />

function copyToClipboard(noticeFailed = false) {
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

/** @type {any} */
let installPrompt;

function setupPwaInstallLink() {
  if (installPrompt) {
    const installLink = document.querySelector('#install-pwa[hidden]');
    installLink?.removeAttribute('hidden');
    installLink?.addEventListener('click', () => installPrompt.prompt());
  }
}

window.addEventListener('DOMContentLoaded', setupPwaInstallLink);
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPrompt = event;
  setupPwaInstallLink();
});

function replaceJaTexts() {
  if (window.navigator.language === 'ja') {
    // biome-ignore lint/complexity/noForEach: for...of w/ NodeListOf<Element> has type warning
    document.querySelectorAll('[data-lang-ja]').forEach((elm) => {
      elm.textContent = elm.getAttribute('data-lang-ja');
    });
  }
}

window.addEventListener('DOMContentLoaded', replaceJaTexts);
