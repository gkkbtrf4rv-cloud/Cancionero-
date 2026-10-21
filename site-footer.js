// Progressive enhancement: the footer and links also work with JavaScript disabled.
document.querySelectorAll('[data-footer-year]').forEach(el => { el.textContent = String(new Date().getFullYear()); });
