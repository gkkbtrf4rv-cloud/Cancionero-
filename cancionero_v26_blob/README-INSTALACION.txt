CANCIONERO TUNA DE DERECHO — INSTALACIÓN
========================================

1) Sube TODO el contenido de esta carpeta al proyecto de Vercel.

2) Variables de entorno obligatorias en Vercel:

ADMIN_PASSWORD=tu_contraseña_de_admin
ADMIN_EMAIL=tu_correo_real@gmail.com
APP_URL=https://cancionero-ten.vercel.app
GMAIL_USER=tu_correo_remitente@gmail.com
GMAIL_APP_PASSWORD=contraseña_de_aplicacion_de_16_caracteres_sin_espacios
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:tu_correo@gmail.com

3) CORREO CON GMAIL
- GMAIL_USER es la cuenta de Gmail desde la que saldrán los correos.
- GMAIL_APP_PASSWORD NO es tu contraseña normal de Google: es la contraseña de aplicación creada con la verificación en 2 pasos.
- Puedes pegar la contraseña de aplicación con o sin espacios; el código elimina los espacios automáticamente.
- Ya no hace falta RESEND_API_KEY ni EMAIL_FROM para esta versión.
- Las variables antiguas de Resend pueden quedarse en Vercel, pero esta versión no las usa.

4) Prueba antes de registrar integrantes
- Haz un redeploy después de subir esta versión.
- Abre /admin.html.
- Escribe ADMIN_PASSWORD.
- Pulsa “✉️ Probar correo”.
- Debe llegar un correo a ADMIN_EMAIL.
- Si falla, el panel mostrará el error devuelto por Gmail.

5) Flujo de registro
- El sistema SOLO crea la cuenta si Gmail logra enviar el correo de verificación.
- El usuario recibe el enlace de verificación.
- Después de verificarlo, ADMIN_EMAIL recibe la solicitud de acceso.
- Al autorizar desde /admin.html, el integrante recibe el correo de acceso autorizado.

6) Seguridad
- Nunca subas GMAIL_APP_PASSWORD a GitHub ni la escribas dentro del código.
- Debe existir solamente como Environment Variable en Vercel.
- Si alguna vez se expone, revócala desde tu cuenta de Google y crea otra.

ACTUALIZACIONES Y MODO SIN CONEXIÓN
------------------------------------
Se conserva la lógica de actualización/offline de la versión anterior y el sistema de accesos agrupados por mote.

NOTA V17 GMAIL
--------------
Esta versión sustituye Resend por Gmail SMTP mediante Nodemailer. Mantiene las 12 funciones de Vercel del proyecto anterior.


=== COPIA DE AVISOS ADMINISTRATIVOS (v20) ===
Si quieres que los avisos administrativos lleguen también a un segundo correo, agrega en Vercel:
ADMIN_CC_EMAIL=segundo-correo@ejemplo.com

Esta copia se usa para:
- correo de prueba del panel de administrador
- aviso de nueva solicitud de acceso después de verificar el correo

No se copia el correo de verificación ni el correo de acceso autorizado que se envían al integrante.

Para cambiar el Gmail desde el que salen los correos, actualiza en Vercel:
GMAIL_USER=nuevo-correo@gmail.com
GMAIL_APP_PASSWORD=contraseña-de-aplicación-del-nuevo-Gmail
Luego haz Redeploy.

NUEVO v25 — EVENTOS Y ÁLBUM GRUPAL
- El inicio muestra una sección claramente separada "Próximos eventos" encima de las canciones.
- El administrador puede crear/editar/ocultar/eliminar eventos y viajes desde admin.html.
- Cada evento puede mostrar cuenta regresiva, ubicación y descripción.
- Los integrantes autorizados pueden comentar si el administrador lo permite.
- Álbum grupal opcional: el administrador elige un máximo de 3, 4 o 5 fotos POR INTEGRANTE y por evento.
- Las fotos se comprimen en el dispositivo antes de subirlas y se guardan por separado en KV para evitar una respuesta gigante.
- El álbum carga fotos por páginas de 12.
- Comentarios y fotos requieren conexión; la lista/resumen de eventos viaja con la copia offline del cancionero.
- Los cambios de datos del evento cuentan como una nueva versión para "Comprobar cambios / Notificar actualización".

NUEVO v26 — ÁLBUM EN VERCEL PRIVATE BLOB
-----------------------------------------
- Las fotos NUEVAS de eventos ya no se guardan dentro de KV/Redis.
- Se guardan en Vercel Blob con acceso PRIVADO.
- KV conserva únicamente el índice/metadatos (mote, fecha, pie, ruta del archivo).
- Solo un integrante con sesión aprobada puede pedir las URLs temporales del álbum.
- Las URLs de visualización expiran aproximadamente a los 30 minutos.
- Las fotos antiguas que ya estuvieran en KV siguen siendo compatibles; no se borran ni se migran automáticamente.
- Al eliminar una foto o borrar un evento, el sistema intenta borrar también el archivo correspondiente de Blob.

ANTES DE PROBAR FOTOS:
1. En Vercel, abre el proyecto y crea/conecta un Blob Store PRIVADO.
2. En proyectos nuevos, Vercel Blob usa OIDC por defecto; normalmente no necesitas copiar una clave manual al código.
3. Haz Redeploy después de conectar el Store.
4. Prueba con una sola foto desde un integrante autorizado.
