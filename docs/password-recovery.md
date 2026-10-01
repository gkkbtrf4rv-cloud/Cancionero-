# Recuperación de contraseña

La pantalla de acceso incluye “¿Olvidaste tu contraseña?”. Escribe el correo y pulsa el botón: no necesitas completar la contraseña. El enlace permite guardar una nueva contraseña y confirmarla. Conserva aprobación, verificación y datos de la cuenta.

## Activación

1. Integrar esta rama en `main` y esperar el despliegue de Vercel.
2. En Vercel → proyecto → Settings → Environment Variables, definir `APP_URL` con la URL HTTPS estable de producción, por ejemplo `https://tu-cancionero.vercel.app`. No incluir `/admin.html` ni usar el dominio temporal de preview. Es obligatorio para recuperación; no se confía en el Host de la petición.
3. Mantener las variables ya utilizadas: `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `KV_REST_API_URL` y `KV_REST_API_TOKEN`. No poner secretos en GitHub ni compartirlos en el chat.
4. Si cambias variables, desplegar nuevamente. Para probar una preview, configurar también su `APP_URL` y preferir datos/correo de staging.
5. Abrir o reabrir la PWA conectada. El service worker pasa a v53 para entregar el nuevo botón.

El correo se envía en segundo plano mediante `@vercel/functions.waitUntil`. La respuesta neutra confirma la solicitud, no la entrega del correo. Ante fallos, revisar los logs de Vercel; la API no publica detalles de SMTP.

Se reutiliza `/api/login`: el GET sirve una página aislada de recuperación y el POST acepta las acciones `request-reset` / `confirm-reset`. No se añade una decimotercera función Vercel; el login normal conserva su formato.

## Pruebas

`npm install` y `node --test tests/password-reset.test.js`.

Las pruebas locales usan un doble de Redis, no un servicio Redis real. Antes de dar por activado el flujo, probar en staging:

- Solicitar enlace con una cuenta existente y otra inexistente: mismo mensaje. La segunda no recibe correo.
- Abrir el enlace en Safari/Chrome; escribir dos claves distintas: debe impedir el envío.
- Cambiar contraseña: la vieja deja de funcionar y la nueva funciona; aprobación y datos no cambian.
- Reutilizar enlace, usar otro enlace emitido antes del cambio, o esperar más de 30 minutos: deben rechazarse.
- Confirmar el mismo enlace simultáneamente desde dos pestañas: solo una operación debe tener éxito. Esto verifica el script Lua en Redis real.
- Comprobar que una sesión abierta anteriormente recibe 401 al consultar `/api/me`; iniciar sesión de nuevo funciona.
- Solicitar más de 3 enlaces en una hora para la misma cuenta: no se envían más; máximo 20 solicitudes por IP/hora.
- Comprobar que no se publica ni registra el token: viaja en fragmento, se elimina de la barra al abrir y se guarda en Redis únicamente su SHA-256.

## Límites

La invalidación afecta el acceso al servidor. No puede borrar a distancia las canciones ya guardadas en un dispositivo desconectado. La app vuelve a comprobar la sesión al abrir conectada.

Si perdió acceso al correo, no hay recuperación automática. El administrador debe verificar personalmente la identidad; esta implementación no añade un cambio de correo administrativo ni permite consultar contraseñas.

Los enlaces no verifican automáticamente un correo pendiente ni aprueban la cuenta. Cambiar contraseña y verificar correo siguen siendo pasos separados.
