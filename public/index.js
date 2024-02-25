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
  setTimeout(
    async () =>
      await navigator.clipboard.writeText(token).then(
        () => alert('Token copied!'),
        () => noticeFailed && alert('Token copy failed'),
      ),
    0,
  );
}
