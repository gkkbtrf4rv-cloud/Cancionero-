// Expand the existing dialog without the native Fullscreen API, which rejects dialogs.
export function setupReaderFullscreen(reader, button) {
  const sync = () => {
    const expanded = reader.classList.contains('reader-expanded');
    button.textContent = expanded ? 'Salir de pantalla completa' : 'Pantalla completa';
    button.setAttribute('aria-pressed', String(expanded));
  };
  button.onclick = () => {
    if (!reader.open) return;
    reader.classList.toggle('reader-expanded');
    sync();
  };
  reader.addEventListener('close', () => {
    reader.classList.remove('reader-expanded');
    sync();
  });
  sync();
}
