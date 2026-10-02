(() => {
  const byId = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const cards = [...document.querySelectorAll('.wrap > .card')];

  function sectionFor(heading='') {
    const text = heading.toLowerCase();
    if (text.includes('aviso') || text.includes('pop-up')) return 'comunicacion';
    if (text.includes('evento') || text.includes('viaje')) return 'eventos';
    if (text.includes('cancion')) return 'canciones';
    if (text.includes('dispositivos') || text.includes('acceso') || text.includes('solicitudes') || text.includes('integrantes')) return 'integrantes';
    return 'otros';
  }

  cards.forEach(card => {
    card.dataset.adminSection = sectionFor(card.querySelector('h2')?.textContent || '');
  });

  const hero = document.querySelector('.admin-hero');
  if (!hero) return;

  const nav = document.createElement('div');
  nav.className = 'admin-section-nav';
  nav.innerHTML = '<div class="admin-nav-scroll">' +
    '<button type="button" class="admin-nav-btn active" data-go="inicio">⌂ Inicio</button>' +
    '<button type="button" class="admin-nav-btn" data-go="comunicacion">📣 Avisos</button>' +
    '<button type="button" class="admin-nav-btn" data-go="eventos">📅 Eventos</button>' +
    '<button type="button" class="admin-nav-btn" data-go="canciones">🎼 Canciones</button>' +
    '<button type="button" class="admin-nav-btn" data-go="permiso">📄 Permiso de ensayo</button>' +
    '<button type="button" class="admin-nav-btn" data-go="biblioteca">📚 Biblioteca</button>' +
    '<button type="button" class="admin-nav-btn" data-go="integrantes">👥 Integrantes</button>' +
    '</div>';
  hero.insertAdjacentElement('afterend', nav);

  const home = document.createElement('div');
  home.className = 'admin-home';
  home.id = 'adminHome';
  home.innerHTML =
    '<div class="admin-home-card" data-open="comunicacion"><div class="admin-home-icon">📣</div><strong>Avisos</strong><small>Notificaciones y pop-up para integrantes.</small></div>' +
    '<div class="admin-home-card" data-open="eventos"><div class="admin-home-icon">📅</div><strong>Eventos</strong><small>Viajes, presentaciones, portadas y setlists.</small></div>' +
    '<div class="admin-home-card" data-open="canciones"><div class="admin-home-icon">🎼</div><strong>Canciones</strong><small>Agregar, editar, portadas y repertorio.</small></div>' +
    '<div class="admin-home-card" data-open="permiso"><div class="admin-home-icon">📄</div><strong>Permiso de ensayo</strong><small>Subir o reemplazar la autorización de FES Acatlán.</small></div>' +
    '<div class="admin-home-card" data-open="biblioteca"><div class="admin-home-icon">📚</div><strong>Biblioteca Tuna</strong><small>Libros para historia, tradición y Modo Pardillo.</small></div>' +
    '<div class="admin-home-card" data-open="integrantes"><div class="admin-home-icon">👥</div><strong>Integrantes</strong><small>Solicitudes, accesos y dispositivos.</small></div>' +
    '<div class="admin-home-card" data-open-ai="1"><div class="admin-home-icon">✨</div><strong>Ver Biblioteca</strong><small>Abrir la búsqueda y el lector para integrantes.</small></div>';
  nav.insertAdjacentElement('afterend', home);

  const library = document.createElement('div');
  library.className = 'card admin-library-card';
  library.dataset.adminSection = 'biblioteca';
  library.innerHTML =
    '<h2>📚 Biblioteca Tuna</h2>' +
    '<p class="hint">Sube libros y documentos para que los integrantes puedan buscarlos y leerlos. El archivo queda privado y el texto se indexa para búsqueda.</p>' +
    '<label>Contraseña de administrador</label><input id="libraryPassword" type="password" autocomplete="current-password" placeholder="La misma contraseña del administrador">' +
    '<div class="row"><div><label>Título del libro</label><input id="libraryTitle" maxlength="160" placeholder="Ej. Historia de la Tuna"></div>' +
    '<div><label>Autor (opcional)</label><input id="libraryAuthor" maxlength="120" placeholder="Nombre del autor"></div></div>' +
    '<div class="library-drop"><label>Archivo</label><input id="libraryFile" type="file" accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown">' +
    '<p class="hint">PDF, TXT o MD. Hasta 100 MB por libro. La carga es privada y muestra su progreso. Si el PDF es un escaneo sin texto, necesitará OCR.</p></div>' +
    '<div class="actions"><button type="button" id="btnLibraryUpload">➕ Agregar a Biblioteca</button>' +
    '<button type="button" class="secondary" id="btnLibraryList">Actualizar lista</button>' +
    '<button type="button" class="secondary" id="btnLibraryAI">✨ Probar asistente</button></div>' +
    '<div class="admin-library-meter">🔎 La búsqueda es interna: muestra fragmentos del texto y abre el libro en su página. No necesita créditos de IA.</div>' +
    '<div id="libraryMsg" class="msg"></div><div id="libraryList" class="admin-library-list"><div class="hint">Pulsa “Actualizar lista” para ver los libros cargados.</div></div>';

  const firstIntegrantes = cards.find(card => card.dataset.adminSection === 'integrantes');
  if (firstIntegrantes) firstIntegrantes.insertAdjacentElement('beforebegin', library);
  else document.querySelector('.wrap').appendChild(library);

  const permission = document.createElement('div');
  permission.className = 'card';
  permission.dataset.adminSection = 'permiso';
  permission.innerHTML = '<h2>📄 Permiso de ensayo</h2><p class="hint">Hoja de autorización para entrar a FES Acatlán. Al reemplazarla, los integrantes reciben la nueva versión al conectarse al Cancionero.</p><label for="permissionPassword">Contraseña de administrador</label><input id="permissionPassword" type="password" autocomplete="current-password"><label for="permissionFile">Hoja de autorización</label><input id="permissionFile" type="file" accept="application/pdf,image/jpeg,image/png,image/webp"><p class="hint">PDF o imagen JPEG, PNG o WebP, hasta 3 MB. Se aceptan documentos escaneados; no requieren extraer texto.</p><div class="actions"><button type="button" id="permissionUpload">Subir / reemplazar permiso</button><button type="button" class="secondary" id="permissionRefresh">Consultar documento actual</button></div><div id="permissionAdminMsg" class="msg" role="status"></div><div id="permissionCurrent" class="hint">Consulta el documento actual con tu contraseña.</div>';
  library.insertAdjacentElement('afterend',permission);
  async function permissionPost(payload) {
    const password = byId('permissionPassword').value;
    if(!password) throw new Error('Escribe la contraseña de administrador.');
    const response = await fetch('/api/cancionero',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password,...payload})});
    const data = await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(data.error || 'No se pudo guardar el permiso.');
    return data;
  }
  function renderPermission(doc) {
    byId('permissionCurrent').textContent = doc ? doc.filename + ' · ' + formatBytes(doc.size) + ' · actualizado ' + new Date(doc.updatedAt).toLocaleString('es-MX') : 'Todavía no hay autorización cargada. Selecciona el documento y pulsa Subir / reemplazar permiso.';
  }
  async function permissionTask(upload) {
    const msg = byId('permissionAdminMsg'), button = byId(upload ? 'permissionUpload' : 'permissionRefresh');
    button.disabled = true; msg.className='msg'; msg.textContent=upload ? 'Guardando autorización…' : 'Consultando autorización…';
    try {
      let payload={action:'permission-admin'};
      if(upload) {
        const file=byId('permissionFile').files?.[0];
        if(!file) throw new Error('Selecciona un PDF o una imagen.');
        if(file.size>3000000) throw new Error('El archivo supera 3 MB.');
        payload={action:'permission-upload',filename:file.name,fileData:await fileAsDataUrl(file)};
      }
      const data=await permissionPost(payload); renderPermission(data.permission);
      msg.className='msg ok'; msg.textContent=upload ? '✅ Permiso guardado. Ya está disponible en el Cancionero.' : '✅ Estado actualizado.';
      if(upload) byId('permissionFile').value='';
    }catch(err){msg.className='msg err';msg.textContent=err.message;}
    finally{button.disabled=false;}
  }
  byId('permissionUpload').onclick=()=>permissionTask(true);
  byId('permissionRefresh').onclick=()=>permissionTask(false);

  function showSection(section) {
    const isHome = section === 'inicio';
    home.classList.toggle('admin-section-hidden', !isHome);
    [...document.querySelectorAll('[data-admin-section]')].forEach(card => {
      card.classList.toggle('admin-section-hidden', isHome || card.dataset.adminSection !== section);
    });
    [...nav.querySelectorAll('.admin-nav-btn')].forEach(button => {
      button.classList.toggle('active', button.dataset.go === section);
    });
    localStorage.setItem('admin_section_v2', section);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  nav.addEventListener('click', event => {
    const button = event.target.closest('[data-go]');
    if (button) showSection(button.dataset.go);
  });

  home.addEventListener('click', event => {
    const card = event.target.closest('[data-open]');
    if (card) showSection(card.dataset.open);
    if (event.target.closest('[data-open-ai]')) location.href = '/ia.html';
  });

  byId('btnLibraryAI').onclick = () => location.href = '/ia.html';

  async function extractPdfPages(file, progress) {
    const pdfjs = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
    const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    try {
      if (pdf.numPages > 10000) throw new Error('El PDF supera 10 000 páginas. Divide el libro en volúmenes.');
      const chunks = []; let characters = 0;
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
        progress('Leyendo página ' + pageNumber + ' de ' + pdf.numPages + '…');
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        const text = content.items.map(item => item.str || '').join(' ').replace(/\s+/g, ' ').trim();
        characters += text.length;
        if (characters > 9000000) throw new Error('El texto es demasiado extenso. Divide el libro en volúmenes.');
        chunks.push(...splitBookText(text, pageNumber));
        page.cleanup();
      }
      return chunks;
    } finally { await pdf.destroy(); }
  }

  function splitBookText(text, page = null) {
    const source = String(text || '').trim();
    const chunks = [];
    for (let start = 0, part = 1; start < source.length; start += 1980, part++) {
      const body = source.slice(start, start + 2200).trim();
      if (body) chunks.push({text:body,page,part});
      if (start + 2200 >= source.length) break;
    }
    return chunks;
  }

  const fileAsDataUrl = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
    reader.readAsDataURL(file);
  });

  async function libraryPost(payload) {
    const password = byId('libraryPassword').value.trim();
    if (!password) throw new Error('Escribe la contraseña de administrador.');

    const response = await fetch('/api/cancionero', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ password, ...payload })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Ocurrió un error.');
    return data;
  }

  function formatBytes(bytes) {
    const n = Number(bytes) || 0;
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(1) + ' MB';
  }

  function renderBooks(books) {
    const box = byId('libraryList');
    if (!books.length) {
      box.innerHTML = '<div class="hint">Todavía no hay libros cargados.</div>';
      return;
    }
    box.innerHTML = books.map(book =>
      '<div class="admin-book"><div class="admin-book-main"><div class="admin-book-icon">📖</div><div><strong>' +
      esc(book.title || book.filename || 'Libro') + '</strong><small>' +
      (book.author ? esc(book.author) + ' · ' : '') +
      (book.pages ? esc(book.pages) + ' pág. · ' : '') +
      esc(book.chunks || 0) + ' fragmentos · ' + esc(formatBytes(book.size)) +
      '</small></div></div><button type="button" class="danger mini" data-delete-book="' +
      esc(book.id) + '">Eliminar</button></div>'
    ).join('');
  }

  async function loadBooks() {
    const msg = byId('libraryMsg');
    msg.className = 'msg';
    msg.textContent = 'Cargando biblioteca…';
    try {
      const data = await libraryPost({ action: 'list' });
      renderBooks(data.books || []);
      msg.className = 'msg ok';
      msg.textContent = '✅ ' + (data.books || []).length + ' libro(s) cargado(s).';
    } catch (err) {
      msg.className = 'msg err';
      msg.textContent = '❌ ' + err.message;
    }
  }

  byId('btnLibraryList').onclick = loadBooks;

  byId('btnLibraryUpload').onclick = async () => {
    const msg = byId('libraryMsg');
    const file = byId('libraryFile').files?.[0];
    const title = byId('libraryTitle').value.trim();

    if (!title) {
      msg.className = 'msg err';
      msg.textContent = '❌ Escribe el título del libro.';
      return;
    }
    if (!file) {
      msg.className = 'msg err';
      msg.textContent = '❌ Selecciona un PDF, TXT o MD.';
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      msg.className = 'msg err';
      msg.textContent = '❌ El archivo supera 100 MB.';
      return;
    }

    const button = byId('btnLibraryUpload');
    button.disabled = true;
    msg.className = 'msg';
    msg.textContent = 'Leyendo, subiendo e indexando el libro…';

    let uploadId = null, finishing = false;
    try {
      const password = byId('libraryPassword').value.trim();
      if (!password) throw new Error('Escribe la contraseña de administrador.');
      const isPdf = /\.pdf$/i.test(file.name) || file.type === 'application/pdf';
      if (!isPdf && !/\.(txt|md)$/i.test(file.name)) throw new Error('Solo PDF, TXT o MD.');
      const mimeType = isPdf ? 'application/pdf' : /\.md$/i.test(file.name) ? 'text/markdown' : 'text/plain';
      const progress = message => { msg.textContent = message; };
      // Verify administrator credentials before reading a large book.
      await libraryPost({action:'library-list'});
      const chunks = isPdf ? await extractPdfPages(file, progress) : splitBookText(await file.text());
      if (!chunks.length) throw new Error('No pude extraer texto. Si el PDF es un escaneo, necesita OCR antes de subirlo.');
      const index = new Blob([JSON.stringify(chunks)], {type:'application/json'});
      if (index.size > 16 * 1024 * 1024 || chunks.length > 15000) throw new Error('El texto es demasiado extenso. Divide el libro en volúmenes.');
      const ticket = await libraryPost({action:'library-upload-start',title,author:byId('libraryAuthor').value.trim(),filename:file.name,size:file.size,mimeType});
      uploadId = ticket.id;
      const {put} = await import('/admin-assets/blob-client.mjs');
      const options = (token, type, label) => ({access:'private',token,contentType:type,multipart:true,onUploadProgress:({percentage})=>progress(label + ' ' + Math.round(percentage) + '%…')});
      await put(ticket.originalPath, file, options(ticket.originalToken, mimeType, 'Subiendo libro'));
      await put(ticket.chunksPath, index, options(ticket.indexToken, 'application/json', 'Preparando índice de búsqueda'));
      progress('Verificando y registrando el libro…');
      finishing = true;
      const data = await libraryPost({action:'library-upload-finish',id:ticket.id});
      msg.className = 'msg ok';
      msg.textContent = '✅ “' + data.book.title + '” agregado con ' + data.book.chunks + ' fragmentos' +
        (data.book.pages ? ' y ' + data.book.pages + ' páginas detectadas.' : '.');
      byId('libraryTitle').value = '';
      byId('libraryAuthor').value = '';
      byId('libraryFile').value = '';
      await loadBooks();
    } catch (err) {
      if (uploadId && !finishing) await libraryPost({action:'library-upload-abort',id:uploadId}).catch(()=>{});
      msg.className = 'msg err';
      msg.textContent = '❌ ' + err.message;
    } finally {
      button.disabled = false;
    }
  };

  byId('libraryList').addEventListener('click', async event => {
    const button = event.target.closest('[data-delete-book]');
    if (!button) return;
    if (!confirm('¿Eliminar este libro de la Biblioteca Tuna?')) return;
    try {
      await libraryPost({ action: 'delete', id: button.dataset.deleteBook });
      await loadBooks();
    } catch (err) {
      byId('libraryMsg').className = 'msg err';
      byId('libraryMsg').textContent = '❌ ' + err.message;
    }
  });

  showSection(localStorage.getItem('admin_section_v2') || 'inicio');
})();