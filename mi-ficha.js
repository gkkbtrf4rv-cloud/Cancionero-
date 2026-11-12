const form = document.querySelector('#profile-form');
const status = document.querySelector('#profile-status');
const save = form.querySelector('button');
const token = localStorage.getItem('cancionero_token');

async function request(action, details) {
  if (!token || localStorage.getItem('cancionero_token') !== token) {
    throw new Error('Inicia sesión en el cancionero para consultar tu ficha.');
  }
  const response = await fetch('/api/cancionero', {
    method: 'POST', cache: 'no-store',
    headers: {'Content-Type': 'application/json', Authorization: 'Bearer ' + token},
    body: JSON.stringify({action, details})
  });
  const data = await response.json();
  if (localStorage.getItem('cancionero_token') !== token) {
    throw new Error('La sesión cambió. Vuelve al cancionero.');
  }
  if (!response.ok) throw new Error(data.error || 'No se pudo abrir la ficha.');
  return data;
}

try {
  const profile = await request('profile-read');
  document.querySelector('#profile-mote').textContent = 'Mote: ' + profile.mote;
  for (const field of form.querySelectorAll('[name]')) field.value = profile.details[field.name] ?? '';
  form.hidden = false;
  status.textContent = '';
} catch (error) {
  status.textContent = error.message;
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  save.disabled = true;
  status.textContent = 'Guardando…';
  try {
    await request('profile-save', Object.fromEntries(new FormData(form)));
    status.textContent = 'Tu ficha se guardó.';
  } catch (error) {
    status.textContent = error.message;
  } finally {
    save.disabled = false;
  }
});

function clearProfile() {
  form.hidden = true;
  form.reset();
  status.textContent = '';
}
window.addEventListener('pagehide', clearProfile);
window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
window.addEventListener('storage', event => {
  if (event.key === 'cancionero_token' && event.newValue !== token) {
    clearProfile();
    status.textContent = 'La sesión cambió. Vuelve al cancionero.';
  }
});
