# Biblioteca de integrantes

La Biblioteca ofrece catálogo privado, búsqueda de palabras en los índices de libros y lectura de los originales. No usa OpenAI ni consume créditos o cuota diaria de IA. Se conserva /ia.html para los enlaces existentes.

Todas las operaciones reutilizan /api/cancionero, manteniendo 12 funciones. El catálogo, la búsqueda y la apertura requieren una sesión aprobada. El lector PDF.js con navegación por páginas y zoom recibe un acceso aleatorio limitado a un libro durante una hora, que revalida la sesión en cada petición; una sesión revocada o un libro eliminado bloquea nuevas lecturas. Los originales continúan en Blob privado. Se transmiten en streaming y se admiten rangos para PDFs grandes. No se guardan libros automáticamente para uso offline.

El administrador sigue subiendo PDF con texto (OCR para escaneos), TXT o MD de hasta 100 MB. Los índices actuales y los archivos ya subidos se conservan. Las páginas de los resultados corresponden al número de página del PDF.

Validación: catálogo y lectura sin sesión (401), cuenta pendiente (403), ticket inválido/vencido/otro libro (401), sesión revocada (401), libro eliminado (404), rango parcial (206), rango inválido (416), búsqueda sin clave OpenAI y sin escrituras de cuota.

Integrantes recupera el botón Actualizar usuarios (la tarjeta Acceso al cancionero se estaba clasificando incorrectamente como Canciones), suma Actualizar dispositivos y conserva contraseña y mensajes visibles al cambiar de sección.
