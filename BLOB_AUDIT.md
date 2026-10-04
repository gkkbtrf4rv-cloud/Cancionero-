# Auditoría de lecturas Blob — Cancionero

Base auditada: `e43d3b4bd47e1ebc9ac534c1d213cf48e99efd71` (main y producción al iniciar). Proyecto `prj_NDGQrMydolpLe1a2Zi5qolyudlhG`, Node 24, sin framework. Vercel confirma `cancionero-blob`, privado, activo, 102 objetos / 313,188,566 bytes, cuota no excedida; conectado solamente a cancionero, production + preview. No se consultó el contenido de los archivos ni se alteraron secretos o contenido de producción.

## Causa y alcance

Las lecturas normales de imágenes e índices usaban `useCache:false`: cada visita no satisfecha por la caché local volvía a consultar Blob sin aprovechar su caché. Además, el administrador descargaba todas las portadas al listar eventos, cada búsqueda recorría todos los índices de libros (incluso al filtrar por uno), solicitudes simultáneas de miniatura/hero podían duplicarse y cada activación del service worker borraba la caché local de imágenes.

Son causas confirmadas en el código, no una atribución medida de las 7,500 operaciones del aviso. La conexión proporciona metadatos del almacén y despliegues pero no se obtuvo un desglose histórico de Simple Operations por archivo. La afirmación de que el almacenamiento privado por sí solo provoca el consumo es incompleta: Vercel permite caché privada; el problema aquí es desactivarla. Las búsquedas de biblioteca también pueden generar lecturas de Blob sin consumir tokens de OpenAI.

## Inventario completo del código activo

| Ruta / acción | Lectura Blob | Momento y cambio |
|---|---|---|
| GET `/api/cancionero` (listado principal) | Ninguna | Canciones, eventos, popup y permiso: metadatos en KV; URLs locales versionadas, sin `head`, `list` o firma |
| GET `asset=song-cover`, `asset=cover`, `asset=photo` | `getPrivateBlob` → `get` | Tras sesión aprobada y localizar referencia vigente en KV; habilitar caché Blob; rechazar versiones antiguas de portadas |
| POST `get-song-cover-admin` | `getSongCoverBlob` → `get` | Al editar canción; habilitar caché Blob |
| POST `list-events-admin` | Antes un `get` por portada | Ahora solo KV; miniaturas y edición solicitan `get-event-cover-admin` con contraseña, carga diferida y promesas reutilizadas por pathname |
| POST `get-event-cover-admin` | `getPrivateBlob` → `get` | Nueva acción autenticada, incluye eventos ocultos solo para admin |
| GET `asset=permission` | `getPermissionBlob` → `get` | Bajo demanda, sesión y versión vigentes; habilitar caché Blob, respuesta sigue `private,no-store` |
| GET/POST `library-catalog`, POST `library-list` | Ninguna | Catálogo KV; sin PDFs ni índices |
| POST `library-open` | Ninguna | Emite ticket limitado al libro, con vencimiento |
| GET `asset=book` | `get(originalPath)` | Solo al abrir lector; sesión y existencia revalidadas, Range conservado; caché SDK habilitada por defecto; respuesta privada con caché de navegador de 5 minutos, sin caché compartida |
| POST `library-search` / `ai-ask` | `getKnowledgeChunks` → `readPrivateJson` → `get` por índice | Caché Blob + memoria por ruta única (5 minutos, máximo 8 MiB, solicitudes simultáneas agrupadas); filtro bookId antes de leer; catálogo vivo evita devolver libros eliminados |
| POST `library-upload-finish` | Dos `head` + `get` del índice recién subido | Se conservan para validar tamaño, tipo, contenido y permisos de la subida; lectura sin caché intencional en finalización, no navegación |
| `signedPhotoUrl` en event-store | `issueSignedToken` / `presignUrl` | Función interna sin llamadas; el álbum usa endpoints autenticados estables, no firmas por listado |

No hay `list()` del SDK ni `getDownloadUrl()` en el código activo. `getPhotoPage`, índices de fotos y resúmenes de eventos leen KV; fotos antiguas siguen usando data URI de KV. Las subidas (`put`) y borrados (`del`) conservan su comportamiento. `cancionero_v26_blob/` es una copia histórica sin endpoints `api/` en la raíz activa del despliegue; no se modificó. El bundle admin-assets contiene cliente de subida, no lecturas automáticas.

## Seguridad y UX

Se mantienen archivos privados y autorización antes de cada lectura del servidor. No se añade caché pública/CDN al endpoint autenticado. Las rutas de subidas llevan fecha o UUID, por lo que activar la caché no confunde versiones. Las portadas de canciones ya tenían IntersectionObserver; se conserva. Las fotos del álbum ahora también esperan a estar visibles; el visor se carga inmediatamente. La caché local sobrevive a actualizaciones del shell v59, y el cierre de sesión elimina caché y URLs temporales; una descarga terminada tras cambiar de sesión no se publica en memoria. Las solicitudes fallidas se pueden reintentar y no quedan guardadas como índices vacíos.

No se migran portadas a almacenamiento público: no hay evidencia que permita clasificar cada una como no sensible; hay eventos ocultos y fotografías privadas. Un almacén público también contabiliza misses. Una futura migración selectiva a archivos estáticos podría eliminar operaciones Blob para esas portadas, pero requiere clasificar los archivos y sincronizar altas/cambios. La optimización actual no necesita una migración ni cambia el acceso al contenido.

Antes de finalizar, main avanzó a `d21655c` con otra optimización. Se integró: caché Blob ya activada, rangos de lector de 4 MiB y caché privada de navegador para PDFs de 5 minutos se conservan. La caché global de índices de main se sustituye por caché acotada por pathname para soportar filtros de libro, agrupar concurrencia y reintentar fallos sin congelar resultados parciales. El ahorro estimado se compara con la base inicial e43d3b4; parte de él ya estaba en main al integrar. La caché de navegador de PDF puede reutilizar bytes hasta 5 minutos tras revocar acceso; toda petición nueva revalida sesión y ticket.

## Estimación (escenarios, no medición histórica)

- Listado principal: ya tenía **0 lecturas Blob de metadatos**, se mantiene en 0. Las portadas solo se leen cuando son visibles o se abre el detalle.
- Imagen duplicada miniatura/hero: **2 → 1 solicitudes** concurrentes en caché fría (50%); visitas con imagen local: 0 solicitudes adicionales. Navegador nuevo sigue necesitando obtenerla.
- Admin con 40 portadas y 6 visibles: **40 → 6 lecturas** iniciales (85% menos solicitudes); si se recorren todas habrá hasta 40, pero posteriores recargas en la misma página reutilizan resultados.
- Búsqueda filtrada en biblioteca con 20 libros: **20 → 1 índice** (95% menos solicitudes). Diez búsquedas globales consecutivas en una misma instancia caliente: **200 → 20** hasta que caduque la caché (90%); instancias nuevas, expiraciones o índices mayores al presupuesto pueden volver a leer.
- Lecturas que antes evitaban caché Blob: con 90% de aciertos efectivos, **1,000 → ~100 Simple Operations** (90%). Esto depende de TTL/regiones/evicción; no equivale a prometer un ahorro global del 90%. Los aciertos aún pueden generar solicitudes CDN y transferencia.
- PDFs: 0 antes de abrir; rangos del lector y validación de subidas siguen siendo necesarios.

Fuente: https://vercel.com/docs/vercel-blob/using-blob-sdk (`useCache` por defecto true); https://vercel.com/docs/vercel-blob/usage-and-pricing (Simple Operations = misses + head; list = Advanced Operations). Medir antes/después durante el mismo volumen de uso, revisando misses, Simple Operations, CDN requests y transferencias en Observability. No se recupera la cuota ya consumida.

## Validación

26 pruebas pasan con Node 24: caché y concurrencia, caducidad y presupuesto de índices, reintentos, carga diferida de álbum y admin, reutilización de portadas, persistencia de caché en actualización, sintaxis de scripts, catálogo sin descarga de archivos, autenticación/aprobación, tickets, rangos PDF y subida de biblioteca. `git diff --check` sin errores. Las dependencias se instalaron en /tmp por un fallo de reflink en la carpeta del workspace; no se modifican dependencias ni lockfile. No se ejecutó migración de archivos.
