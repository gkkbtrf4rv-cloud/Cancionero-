/* Local glass controls: no network, pointer tracking, or continuous animation. */
(() => {
  const nav = document.querySelector('.premium-bottom-nav, .bottom-nav');
  if (!nav) return;
  let pending = false;
  function refresh() {
    pending = false;
    const active = nav.querySelector('button.active, a.active');
    if (!active || !nav.offsetWidth || !active.offsetWidth) return;
    const box = nav.getBoundingClientRect(), item = active.getBoundingClientRect();
    nav.style.setProperty('--glass-left', (item.left - box.left - nav.clientLeft) + 'px');
    nav.style.setProperty('--glass-width', item.width + 'px');
    if (!nav.classList.contains('glass-ready')) nav.classList.add('glass-ready');
  }
  function schedule() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(refresh);
  }
  new MutationObserver(schedule).observe(nav, {subtree: true, attributes: true, attributeFilter: ['class']});
  if ('ResizeObserver' in window) new ResizeObserver(schedule).observe(nav);
  window.addEventListener('resize', schedule, {passive: true});
  window.addEventListener('pageshow', schedule);
  schedule();
})();
