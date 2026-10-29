/* The same local appearance preference is used by every screen and offline. */
(() => {
  const key = 'cancionero_theme_v1';
  const themes = {
    vino: { label: 'Vino vibrante', color: '#09090c', scheme: 'dark' },
    luz: { label: 'Luz y color', color: '#faf7f2', scheme: 'light' },
    noche: { label: 'Noche en escena', color: '#0d101b', scheme: 'dark' }
  };
  const normalize = value => ({ default: 'vino', light: 'luz', dark: 'noche' }[value] || (themes[value] ? value : 'vino'));
  function apply(value, persist = false) {
    const name = normalize(value), theme = themes[name];
    document.documentElement.dataset.theme = name;
    document.documentElement.style.colorScheme = theme.scheme;
    document.body.dataset.theme = name;
    document.body.classList.remove('theme-light', 'theme-dark');
    if (name === 'luz') document.body.classList.add('theme-light');
    if (name === 'noche') document.body.classList.add('theme-dark');
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme.color);
    document.querySelectorAll('[data-theme-select]').forEach(select => { select.value = name; });
    document.querySelectorAll('[data-theme-choice]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.themeChoice === name));
    });
    document.querySelectorAll('[data-theme-status]').forEach(status => { status.textContent = theme.label + ' · guardado en este dispositivo'; });
    if (persist) { try { localStorage.setItem(key, name); } catch {} }
  }
  let saved;
  try { saved = localStorage.getItem(key); } catch {}
  apply(saved);
  document.querySelectorAll('[data-theme-select]').forEach(select => {
    select.addEventListener('change', () => apply(select.value, true));
  });
  document.querySelectorAll('[data-theme-choice]').forEach(button => {
    button.addEventListener('click', () => apply(button.dataset.themeChoice, true));
  });
  window.addEventListener('storage', event => { if (event.key === key) apply(event.newValue); });
})();
