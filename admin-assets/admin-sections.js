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
    '<div class="admin-home-card" data-open="biblioteca"><div class="admin-home-icon">📚</div><strong>Biblioteca Tuna</strong><small>Libros para historia, tradición y Modo Pardillo.</small></div>' +
    '<div class="admin-home-card" data-open="integrantes"><div class="admin-home-icon">👥</div><strong>Integrantes</strong><small>Solicitudes, accesos y dispositivos.</small></div>' +
    '<div class="admin-home-card" data-open-ai="1"><div class="admin-home-icon">✨</div><strong>Probar IA</strong><small>Abrir el asistente como lo verá un integrante.</small></div>';
  nav.insertAdjacentElement('afterend', home);

  const library = document.createElement('div');
  library.className = 'card admin-library-card';
  library.dataset.adminSection = 'biblioteca';
  library.innerHTML =
    '<h2>📚 Biblioteca Tuna</h2>' +
    '<p class="hint">Sube libros y documentos para que la IA responda usando esas fuentes. El archivo queda privado y el texto se indexa para búsqueda.</p>' +
    '<label>Contraseña de administrador</label><input id="libraryPassword" type="password" autocomplete="current-password" placeholder="La misma contraseña del administrador">' +
    '<div class="row"><div><label>Título del libro</label><input id="libraryTitle" maxlength="160" placeholder="Ej. Historia de la Tuna"></div>' +
    '<div><label>Autor (opcional)</label><input id="libraryAuthor" maxlength="120" placeholder="Nombre del autor"></div></div>' +
    '<div class="library-drop"><label>Archivo</label><input id="libraryFile" type="file" accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown">' +
    '<p class="hint">PDF, TXT o MD. Límite inicial: 3 MB. Si el PDF es un escaneo sin texto, necesitará OCR.</p></div>' +
    '<div class="actions"><button type="button" id="btnLibraryUpload">➕ Agregar a Biblioteca</button>' +
    '<button type="button" class="secondary" id="btnLibraryList">Actualizar lista</button>' +
    '<button type="button" class="secondary" id="btnLibraryAI">✨ Probar asistente</button></div>' +
    '<div class="admin-library-meter">💡 La IA busca primero los fragmentos relacionados y solo envía esos al modelo. Eso reduce costo y respuestas inventadas.</div>' +
    '<div id="libraryMsg" class="msg"></div><div id="libraryList" class="admin-library-list"><div class="hint">Pulsa “Actualizar lista” para ver los libros cargados.</div></div>';

  const firstIntegrantes = cards.find(card => card.dataset.adminSection === 'integrantes');
  if (firstIntegrantes) firstIntegrantes.insertAdjacentElement('beforebegin', library);
  else document.querySelector('.wrap').appendChild(library);

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

  async function extractPdfPages(file) {
    const pdfjs = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
    const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    const pages = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items.map(item => item.str || '').join(' ').replace(/\\s+/g, ' ').trim();
      pages.push({ page: pageNumber, text });
    }
    return pages;
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

    const response = await fetch('/api/library', {
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
    if (file.size > 3000000) {
      msg.className = 'msg err';
      msg.textContent = '❌ El archivo supera 3 MB en esta primera versión.';
      return;
    }

    const button = byId('btnLibraryUpload');
    button.disabled = true;
    msg.className = 'msg';
    msg.textContent = 'Leyendo, subiendo e indexando el libro…';

    try {
      const isPdf = file.type === 'application/pdf' || /\\.pdf$/i.test(file.name);
      const pages = isPdf ? await extractPdfPages(file) : [];
      const text = isPdf ? '' : await file.text();
      const data = await libraryPost({
        action: 'upload',
        title,
        author: byId('libraryAuthor').value.trim(),
        filename: file.name,
        fileData: await fileAsDataUrl(file),
        pages,
        text
      });
      msg.className = 'msg ok';
      msg.textContent = '✅ “' + data.book.title + '” agregado con ' + data.book.chunks + ' fragmentos' +
        (data.book.pages ? ' y ' + data.book.pages + ' páginas detectadas.' : '.');
      byId('libraryTitle').value = '';
      byId('libraryAuthor').value = '';
      byId('libraryFile').value = '';
      await loadBooks();
    } catch (err) {
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