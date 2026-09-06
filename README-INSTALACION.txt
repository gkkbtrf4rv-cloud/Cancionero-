CANCIONERO TUNA DE DERECHO — INSTALACIÓN
========================================

1) Sube TODO el contenido de esta carpeta al proyecto de Vercel.

2) Variables de entorno obligatorias en Vercel:

ADMIN_PASSWORD=tu_contraseña_de_admin
ADMIN_EMAIL=tu_correo_real@dominio.com
APP_URL=https://cancionero-ten.vercel.app
RESEND_API_KEY=re_...
EMAIL_FROM=Cancionero Tuna <notificaciones@TU-DOMINIO-VERIFICADO.com>
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:tu_correo@dominio.com

3) MUY IMPORTANTE SOBRE RESEND
- Para enviar a cualquier integrante, el dominio usado en EMAIL_FROM debe estar VERIFICADO en Resend.
- Un dominio vercel.app no sirve como dominio remitente propio.
- En Resend > Domains agrega tu dominio y copia los registros DNS que te indique (SPF/DKIM).
- Espera a que Resend muestre el dominio como Verified.
- Después usa una dirección de ese dominio en EMAIL_FROM.
- onboarding@resend.dev sirve para pruebas limitadas y normalmente no es apropiado para enviar a todos los integrantes.

4) Prueba antes de registrar integrantes
- Abre /admin.html
- Escribe ADMIN_PASSWORD
- Pulsa “✉️ Probar correo”
- Debe mostrar un ID de mensaje de Resend y el correo debe llegar a ADMIN_EMAIL.
- Si falla, el panel ahora muestra el motivo exacto que devolvió Resend.

5) Flujo de registro
- El sistema SOLO crea la cuenta si Resend acepta el correo de verificación.
- Si el correo falla, la cuenta se revierte automáticamente y se muestra el error exacto; así se puede corregir la configuración y volver a registrar sin quedar atorado.
- El usuario verifica su correo.
- Entonces ADMIN_EMAIL recibe la solicitud de acceso.
- Al autorizar desde /admin.html, el integrante recibe el correo de acceso autorizado.

6) Navegación móvil
- Al abrir una canción se oculta la barra de búsqueda y el contador.
- El botón Atrás nativo del celular/navegador vuelve a la lista de canciones.
- La flecha integrada usa el mismo historial nativo.
