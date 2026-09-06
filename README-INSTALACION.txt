CANCIONERO TUNA DE DERECHO — ACCESO PRIVADO + VERIFICACIÓN DE CORREO

FLUJO DE ACCESO
1. El integrante entra al sitio.
2. Se registra con Mote + Correo electrónico + Contraseña.
3. La cuenta queda SIN VERIFICAR y NO puede ver el cancionero.
4. El sistema envía un correo con un enlace único de verificación, válido por 48 horas.
5. El integrante pulsa “Verificar mi correo”.
6. Solo entonces la cuenta pasa a PENDIENTE y el administrador recibe un correo avisando que hay una nueva solicitud.
7. La cuenta verificada aparece en /admin.html.
8. El administrador pulsa “Dar acceso”.
9. El integrante recibe un segundo correo avisando que su acceso fue autorizado.
10. El integrante inicia sesión con correo + contraseña y ya puede consultar el cancionero.

IMPORTANTE
- Una cuenta nueva NO aparece al administrador hasta que verifica su correo.
- El endpoint de administración tampoco permite aprobar una cuenta no verificada.
- El enlace de verificación es de un solo uso y caduca en 48 horas.
- Si caduca, el usuario puede usar “Reenviar verificación” desde la pantalla de inicio de sesión.
- El contenido de las canciones NO está incrustado en index.html. Se entrega desde /api/cancionero únicamente a sesiones autorizadas.
- Las contraseñas se guardan con scrypt + salt, nunca en texto plano.
- Las notificaciones push solo se registran para usuarios autorizados.
- Las cuentas creadas antes de esta versión que no tengan el campo emailVerified se consideran verificadas para no bloquear usuarios existentes.

CORREOS AUTOMÁTICOS
Se usa la API de Resend sin agregar una dependencia npm adicional.
Se envían estos correos:
- Al integrante: “Verifica tu correo”.
- Al administrador: “Nueva solicitud de acceso”, solo después de la verificación.
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
APP_URL se usa para construir tanto el botón de verificación como los enlaces de los demás correos.

BASE DE DATOS
El proyecto conserva la integración actual de @vercel/kv / Redis compatible con Vercel.

PANEL DE ADMINISTRACIÓN
Ruta: /admin.html
Permite:
- Dar o quitar acceso a integrantes con correo ya verificado.
- Ver mote, correo, dispositivos y último acceso.
- Al dar acceso, enviar automáticamente el correo de autorización.
- Ver estado de suscripciones push.
- Enviar notificaciones y ver entregas/fallos.

ARCHIVOS IMPORTANTES
/api/register.js             crea cuenta no verificada y envía enlace único
/api/verify-email.js         verifica el enlace y avisa al administrador
/api/resend-verification.js  genera y envía un nuevo enlace
/api/login.js                impide entrar a cuentas nuevas no verificadas
/api/me.js                   valida la sesión y estado de acceso
/api/users.js                lista solo cuentas verificadas y autoriza/revoca
/api/cancionero.js           entrega canciones solo a usuarios autorizados
/api/subscribe.js            registra push ligado a mote + correo
/api/subscribers.js          lista dispositivos para admin
/api/send-notification.js    envía push y registra resultados
/lib/auth.js                 sesiones, correo e hash de contraseñas
/lib/email.js                plantillas y envío de correos con Resend
/lib/canciones.js            contenido protegido del cancionero

PASOS PARA PUBLICAR
1. Reemplaza el proyecto actual por el contenido de esta carpeta.
2. Conserva/configura las variables de entorno anteriores en Vercel.
3. Haz Redeploy.
4. Registra una cuenta de prueba con un correo real.
5. Verifica que llegue el correo “Verifica tu correo”.
6. Antes de pulsar el enlace, comprueba que la cuenta NO aparezca en admin.html y que ADMIN_EMAIL no haya recibido la solicitud.
7. Pulsa el enlace de verificación.
8. Comprueba que ahora ADMIN_EMAIL reciba la solicitud y que la cuenta aparezca en admin.html.
9. Autoriza la cuenta y comprueba que llegue el correo “Acceso autorizado”.
10. Inicia sesión y verifica que el cancionero se desbloquee.
