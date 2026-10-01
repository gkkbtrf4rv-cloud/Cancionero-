export const passwordResetPage = `<!doctype html>
<html lang="es-MX"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer"><title>Nueva contraseña · Cancionero</title>
<style>body{margin:0;background:#240a10;color:#fff;font-family:system-ui,sans-serif;min-height:100vh;display:grid;place-items:center}main{max-width:420px;margin:24px;padding:28px;background:#40101b;border-radius:18px}h1{font-size:26px}label{display:block;margin:18px 0}input{display:block;box-sizing:border-box;width:100%;padding:12px;margin-top:8px;border-radius:8px;border:1px solid #ae8390;font:inherit}button{padding:13px;width:100%;border:0;border-radius:8px;background:#e4c874;font:inherit;font-weight:700}a{color:#e4c874}#status{line-height:1.5}button:disabled{opacity:.6}</style></head>
<body><main><h1>Crea tu nueva contraseña</h1><p>Tu cuenta y su autorización se conservan. El enlace caduca en 30 minutos.</p>
<form id="resetForm"><label>Nueva contraseña<input id="password" type="password" autocomplete="new-password" minlength="8" maxlength="128" required></label><label>Repite la contraseña<input id="confirmation" type="password" autocomplete="new-password" minlength="8" maxlength="128" required></label><button id="submit" type="submit">Guardar contraseña</button></form>
<p id="status" role="status" aria-live="polite"></p><a href="/">Volver al Cancionero</a></main>
<script>
const token = new URLSearchParams(location.hash.slice(1)).get('token') || '';
history.replaceState(null, '', location.pathname);
const form = document.getElementById('resetForm'), status = document.getElementById('status'), button = document.getElementById('submit');
if (!/^[A-Za-z0-9_-]{43}$/.test(token)) { form.hidden = true; status.textContent = 'El enlace no es válido. Solicita uno nuevo en “¿Olvidaste tu contraseña?”.'; }
form.addEventListener('submit', async event => {
  event.preventDefault();
  const password = document.getElementById('password').value;
  if (password !== document.getElementById('confirmation').value) { status.textContent = 'Las contraseñas no coinciden.'; return; }
  button.disabled = true; status.textContent = 'Guardando…';
  try {
    const response = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'confirm-reset', token, password }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo guardar la contraseña.');
    form.reset(); form.hidden = true;
    status.textContent = 'Contraseña actualizada. Vuelve al Cancionero e inicia sesión con tu nueva contraseña.';
  } catch (error) { status.textContent = error.message; }
  finally { button.disabled = false; }
});
</script></body></html>`;
