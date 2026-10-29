/* Vino vibrante is the single visual identity, online and offline. */
(() => {
  const key = 'cancionero_theme_v1';
  function apply() {
    document.documentElement.dataset.theme = 'vino';
    document.documentElement.style.colorScheme = 'dark';
    document.body.dataset.theme = 'vino';
    document.body.classList.remove('theme-light', 'theme-dark');
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', '#09090c');
  }
  apply();
  // Replace saved selections from the retired themes, without touching user data.
  try { localStorage.setItem(key, 'vino'); } catch {}
  window.addEventListener('storage', event => { if (event.key === key) apply(); });
})();
