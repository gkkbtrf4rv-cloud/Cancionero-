CANCIONERO TUNA DE DERECHO — VERSIÓN PRIVADA CON AUTORIZACIÓN

FLUJO DE ACCESO
1. El integrante entra al sitio.
2. Si no tiene cuenta, se registra con Mote + Usuario + Contraseña.
3. La cuenta se crea como PENDIENTE y NO puede ver el cancionero.
4. El administrador entra a /admin.html con ADMIN_PASSWORD.
5. En “Acceso al cancionero”, pulsa “Dar acceso” al integrante.
6. El integrante pulsa “Comprobar de nuevo” o vuelve a entrar.
7. Solo si está autorizado, la app descarga el contenido del cancionero desde /api/cancionero.

IMPORTANTE
- Las canciones ya NO están incrustadas en index.html. El contenido se entrega desde /api/cancionero únicamente a sesiones autorizadas.
- Si el administrador quita acceso, una sesión abierta deja de poder descargar el cancionero al volver a cargar. Las notificaciones también se omiten para usuarios sin acceso.
- Las contraseñas de integrantes se guardan con scrypt + salt, no en texto plano.

PANEL DE ADMINISTRACIÓN
Ruta: /admin.html
Permite:
- Dar o quitar acceso a usuarios.
- Ver mote, usuario, dispositivos y último acceso.
- Ver estado de suscripciones push.
- Enviar notificaciones y ver entregas/fallos.

VARIABLES EN VERCEL
ADMIN_PASSWORD=tu_contraseña_de_administrador
VAPID_PUBLIC_KEY=la misma clave pública usada por el index
VAPID_PRIVATE_KEY=tu clave privada VAPID
VAPID_SUBJECT=mailto:tu-correo@dominio.com (opcional)

BASE DE DATOS
El proyecto usa @vercel/kv según la configuración actual. Debe existir una integración KV/Redis compatible con esas variables en Vercel.

ARCHIVOS NUEVOS/IMPORTANTES
/api/register.js        crea cuentas pendientes
/api/login.js           inicia sesión
/api/me.js              valida la sesión y estado de acceso
/api/users.js           administración de autorizaciones
/api/cancionero.js      entrega canciones solo a usuarios autorizados
/api/subscribe.js       registra notificaciones solo para usuarios autorizados
/api/subscribers.js     lista dispositivos para admin
/api/send-notification.js envía y registra resultados
/lib/auth.js            sesiones y contraseñas
/lib/canciones.js       contenido protegido del cancionero

DESPUÉS DE SUBIR
1. Abre /admin.html y escribe tu contraseña de administrador.
2. Pulsa “Actualizar usuarios”.
3. Autoriza manualmente las cuentas que reconozcas por su mote.
4. Pide a cada integrante que vuelva a abrir la app y pulse “Comprobar de nuevo”.
5. Luego podrá activar notificaciones y quedará asociado a su mote.
