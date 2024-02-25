function copyToClipboard(noticeFailed) {
  const token = htmx.find('#token').value;
  setTimeout(
    async () =>
      await navigator.clipboard.writeText(token).then(
        () => alert('Token copied!'),
        () => noticeFailed && alert('Token copy failed'),
      ),
    0,
  );
}
