# Cancionero de Tuna · revisión v52

Tuna de Derecho FES Acatlán. Preparado el 16 de septiembre de 2026.

Estado: correcciones locales verificadas; despliegue privado y entrega push real pendientes. Este archivo no acredita un despliegue en Vercel.

## Base utilizada

- Proyecto recuperado: `cancionero-tuna-v51-rapido.zip`.
- El HTML recuperado coincidió byte por byte con el servido por `https://cancionero-ten.vercel.app/` durante esta revisión.
- SHA-256 del HTML original: `9ec583b36964891f7482c3dbb42103df89a353dd279c2838c5818966329db252`.
- No se pudo contrastar el código de las funciones desplegadas ni inspeccionar sus variables de entorno o registros. Los hallazgos del servidor corresponden a la copia recuperada.
- Se conservaron las canciones originales, identidad visual, buscador, lectura, favoritos, eventos y control de acceso. `lib/canciones.js` no fue modificado.

## Hallazgos y correcciones

1. La versión quedaba marcada globalmente como notificada incluso con envíos fallidos. Ahora se guarda la aceptación por dispositivo y versión. El administrador puede reintentar los pendientes; los envíos con confirmación guardada se omiten. Un bloqueo evita envíos concurrentes de la misma versión.
2. La clave pública VAPID estaba incrustada en el HTML. Ahora se obtiene del servidor a través de GET `/api/subscribe`; la clave privada permanece en variables de entorno. No se confirmó si existía un desajuste de claves en producción.
3. La comprobación de APIs precedía a las instrucciones de instalación de iPhone, por lo que Safari podía mostrar únicamente «no compatible». Se muestran las instrucciones antes de esa comprobación y se contempla el iPad con agente de escritorio.
4. La activación distingue permiso, suscripción del navegador y registro confirmado en el servidor. Las solicitudes tienen tiempo límite; los errores dejan disponible el reintento. El permiso se solicita directamente desde un toque, nunca automáticamente.
5. Al abrir la app se resincroniza una suscripción existente. Una clave cambiada se renueva después de una acción explícita. Al cambiar de cuenta se retira la asociación anterior; al cerrar sesión se desactiva la suscripción local.
6. Los envíos de una vista privada se limitan a dispositivos registrados en su propio origen. Los dispositivos antiguos deben volver a abrir la app para asociarse al origen. No se enviaron mensajes a integrantes durante esta revisión.
7. El service worker anterior podía servir el inicio al navegar a `/admin.html`, borrar cachés privados y forzar recargas. Ahora respeta las rutas, conserva portadas y avisos pendientes, y no interrumpe una lectura con una recarga forzada.
8. Los avisos de actualización se comunican también a ventanas abiertas. Al pulsar una notificación se abre su ruta dentro del sitio; se impiden destinos de otro origen.
9. El panel distingue «aceptado por el servicio» de «recibido por el teléfono». La aceptación del proveedor no prueba que el sistema operativo haya mostrado el aviso.
10. La actualización diaria solo queda registrada como completada si se obtuvo una respuesta de contenido en línea, no si se recurrió a una copia guardada.

## Validación realizada

- 16 pruebas automatizadas de servidor y service worker: aprobadas.
- 16 escenarios de interfaz en Chromium: aprobados. Incluyen activación, rechazo del servidor, reintento, permiso bloqueado o descartado, cuenta pendiente, clave renovada, navegador no compatible, instrucciones iPhone/iPad y búsqueda/lectura a 320, 390 y 412 px.
- Sin errores JavaScript en los escenarios de interfaz.
- Sintaxis de JavaScript de la aplicación e instrucciones incrustadas en HTML: comprobada.
- En pruebas se sustituyeron KV, solicitudes API y servicios de push por datos de prueba. No se utilizaron usuarios reales, claves de producción ni envíos reales.

Las pruebas de interfaz emulan tamaños móviles y los estados de las APIs. No sustituyen una prueba de entrega en un iPhone/iPad físico, Safari/WebKit o Android con notificaciones reales.

### Reproducir pruebas de servidor

Con Node.js 24 y las dependencias instaladas:

```sh
npm ci --ignore-scripts
npm test
```

Las pruebas usan un almacenamiento en memoria y un emisor simulado. No necesitan credenciales.

El paquete de revisión incluye también `validacion/mobile.cjs`, resultados JSON y una captura con contenido de prueba. Ese script requiere Playwright y un ejecutable Chromium; sus rutas de ejecución están documentadas en `validacion/README.md`.

## Pendiente antes de entregar una URL validada

- Acceder operativamente al proyecto y repositorio conectados, identificar el commit desplegado y contrastar las funciones actuales con esta copia.
- Preparar únicamente un deployment privado con protección de acceso real y comprobarla desde una sesión sin autenticar. Una URL de preview o `noindex` por sí solos no hacen privado un sitio.
- Verificar variables del entorno de preview: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, KV y la configuración privada ya existente. El cliente nunca recibe claves privadas. No regenerar las claves de producción.
- Mantener la configuración y los datos de producción fuera de las pruebas. Verificar que el preview no origine correos ni avisos a integrantes.
- Comprobar carga autenticada, instalación PWA, registro, recepción en segundo plano y apertura del aviso en dispositivos de prueba compatibles. No se autoriza enviar una difusión real a integrantes.
- Entregar la URL solo cuando ese despliegue y su privacidad estén verificados.

Vercel y GitHub constan conectados, pero en esta sesión no quedaron disponibles las operaciones para consultar repositorios o crear y verificar deployments. No se creó ningún despliegue, no se hizo push, no se modificó producción y no se amplió visibilidad.

## Referencias técnicas

- [WebKit: Web Push para aplicaciones en la pantalla de inicio de iOS/iPadOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).
- [MDN: PushManager.subscribe y gesto del usuario](https://developer.mozilla.org/en-US/docs/Web/API/PushManager/subscribe).

## Límite del acuse de entrega

La confirmación guardada refleja la aceptación del proveedor. Si el proveedor acepta un envío pero falla inmediatamente el almacenamiento del acuse, un reintento podría repetirlo; no se ofrece garantía de entrega exactamente una vez. Los avisos de actualización usan una etiqueta por versión para agruparse en los sistemas que la admiten.
