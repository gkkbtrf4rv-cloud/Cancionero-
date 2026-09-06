CANCIONERO TUNA DE DERECHO — ACCESO PRIVADO + CORREO

FLUJO DE ACCESO
1. El integrante entra al sitio.
2. Se registra con Mote + Correo electrónico + Contraseña.
3. La cuenta queda PENDIENTE y NO puede ver el cancionero.
4. El sistema envía un correo al integrante confirmando que su registro fue recibido.
5. El sistema envía un correo al administrador avisando que hay una nueva solicitud de acceso.
6. El administrador entra a /admin.html y pulsa “Dar acceso”.
7. Al aprobarlo, el sistema envía un segundo correo al integrante avisando que ya puede entrar.
8. El integrante abre el Cancionero e inicia sesión con correo + contraseña.

IMPORTANTE
- El contenido de las canciones NO está incrustado en index.html. Se entrega desde /api/cancionero únicamente a sesiones autorizadas.
- Las contraseñas se guardan con scrypt + salt, nunca en texto plano.
- Las notificaciones push solo se registran para usuarios autorizados.
- Esta versión usa el correo electrónico como identificador de inicio de sesión. Las cuentas antiguas de prueba creadas solo con “usuario” deben registrarse nuevamente con correo.

CORREOS AUTOMÁTICOS
Se usa la API de Resend sin agregar una dependencia npm adicional.
Se envían estos correos:
- Al integrante: “Registro recibido”.
- Al administrador: “Nueva solicitud de acceso”.
- Al integrante: “Acceso autorizado” cuando el administrador pulsa Dar acceso.

VARIABLES EN VERCEL
ADMIN_PASSWORD=tu_contraseña_de_administrador
ADMIN_EMAIL=correo-del-administrador@dominio.com
RESEND_API_KEY=tu_api_key_de_resend
EMAIL_FROM=Cancionero Tuna <notificaciones@tu-dominio.com>
APP_URL=https://tu-sitio.vercel.app

VAPID_PUBLIC_KEY=la misma clave pública usada por index.html
VAPID_PRIVATE_KEY=tu_clave_privada_vapid
VAPID_SUBJECT=mailto:tu-correo@dominio.com

EMAIL_FROM debe ser un remitente permitido por tu cuenta de Resend. Para producción conviene usar un dominio verificado.
APP_URL se usa en los botones de los correos. Si se omite, el servidor intenta detectar la URL automáticamente.

BASE DE DATOS
El proyecto conserva la integración actual de @vercel/kv / Redis compatible con Vercel.

PANEL DE ADMINISTRACIÓN
Ruta: /admin.html
Permite:
- Dar o quitar acceso a integrantes.
- Ver mote, correo, dispositivos y último acceso.
- Al dar acceso, enviar automáticamente el correo de autorización.
- Ver estado de suscripciones push.
- Enviar notificaciones y ver entregas/fallos.

ARCHIVOS IMPORTANTES
/api/register.js        crea cuenta pendiente y envía los correos de registro
/api/login.js           inicia sesión con correo + contraseña
/api/me.js              valida la sesión y estado de acceso
/api/users.js           autoriza/revoca y envía el correo de acceso autorizado
/api/cancionero.js      entrega canciones solo a usuarios autorizados
/api/subscribe.js       registra push ligado a mote + correo
/api/subscribers.js     lista dispositivos para admin
/api/send-notification.js envía push y registra resultados
/lib/auth.js            sesiones, correo e hash de contraseñas
/lib/email.js           plantillas y envío de correos con Resend
/lib/canciones.js       contenido protegido del cancionero

PASOS PARA PUBLICAR
1. Sube todo el contenido de esta carpeta al proyecto en Vercel.
2. Configura las variables de entorno anteriores en Vercel.
3. Redeploy del proyecto.
4. Registra una cuenta de prueba con un correo real.
5. Verifica que llegue el correo de registro y que ADMIN_EMAIL reciba la solicitud.
6. Abre /admin.html, autoriza la cuenta y comprueba que llegue el correo de acceso autorizado.
7. Inicia sesión y verifica que el cancionero se desbloquee.
