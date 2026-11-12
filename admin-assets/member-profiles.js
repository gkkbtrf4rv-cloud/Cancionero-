const root = document.querySelector('#member-directory');
const password = document.querySelector('#password');
const listing = root.querySelector('#member-directory-list');
const status = root.querySelector('[role="status"]');
const fileInput = root.querySelector('input[type="file"]');
const dialog = root.querySelector('dialog');
const dialogDetails = dialog.querySelector('dl');
const labels = {
  name: 'Nombre', rank: 'Rango', birthDate: 'Fecha de nacimiento', schoolId: 'Matrícula',
  contactEmail: 'Correo de contacto', emergencyContact: 'Contacto de emergencia',
  allergies: 'Alergias', conditions: 'Enfermedades o condiciones', medications: 'Medicamentos',
  bloodType: 'Tipo de sangre', notes: 'Información adicional'
};

async function request(action, payload = {}) {
  const response = await fetch('/api/cancionero', {
    method: 'POST', cache: 'no-store',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({action: 'profile-admin-' + action, password: password.value, ...payload})
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'No se pudo completar la acción.');
  return result;
}

function button(label, run) {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = 'secondary';
  element.textContent = label;
  element.onclick = async () => {
    status.textContent = '';
    element.disabled = true;
    try { await run(); }
    catch (error) { status.textContent = error.message; }
    finally { element.disabled = false; }
  };
  return element;
}

async function showProfile(id) {
  if (!window.confirm('¿Consultar esta ficha privada para atender una emergencia?')) return;
  const profile = await request('view', {id});
  dialog.querySelector('h3').textContent = 'Ficha de ' + profile.mote;
  dialogDetails.replaceChildren();
  for (const [key, label] of Object.entries(labels)) {
    const term = document.createElement('dt');
    term.textContent = label;
    const value = document.createElement('dd');
    value.textContent = profile.details[key] || 'Sin registrar';
    dialogDetails.append(term, value);
  }
  dialog.showModal();
}

async function refresh() {
  const result = await request('list');
  const rows = result.profiles.sort((a, b) => a.mote.localeCompare(b.mote, 'es')).map(profile => {
    const row = document.createElement('li');
    const label = document.createElement('p');
    label.textContent = [profile.mote, profile.name, profile.userId ? 'Cuenta vinculada' : 'Sin vincular'].filter(Boolean).join(' · ');
    row.append(label, button('Consultar ficha por emergencia', () => showProfile(profile.id)));
    if (profile.accounts.length) {
      const select = document.createElement('select');
      select.setAttribute('aria-label', 'Cuenta autorizada de ' + profile.mote);
      select.append(new Option('Selecciona la cuenta que verificaste', ''));
      for (const account of profile.accounts) select.append(new Option(account.email || account.mote, account.id));
      row.append(select, button('Vincular cuenta', async () => {
        if (!select.value) throw new Error('Selecciona la cuenta que verificaste.');
        if (!window.confirm('¿Confirmas que esta cuenta pertenece a ' + profile.mote + '?')) return;
        await request('link', {id: profile.id, userId: select.value});
        await refresh();
      }));
    }
    return row;
  });
  listing.replaceChildren(...rows);
  if (!rows.length) status.textContent = 'Todavía no hay fichas.';
}

root.querySelector('.actions').append(
  button('Consultar directorio', refresh),
  button('Importar fichas', async () => {
    const file = fileInput.files[0];
    if (!file || file.size > 500_000) throw new Error('Selecciona el archivo de fichas JSON de hasta 500 KB.');
    const profiles = JSON.parse(await file.text());
    const result = await request('import', {profiles});
    fileInput.value = '';
    await refresh();
    status.textContent = result.added + ' fichas importadas · ' + result.existing + ' ya existían.';
  })
);
dialog.addEventListener('close', () => dialogDetails.replaceChildren());
window.addEventListener('pagehide', () => {
  if (dialog.open) dialog.close();
  dialogDetails.replaceChildren();
  listing.replaceChildren();
  fileInput.value = '';
});
