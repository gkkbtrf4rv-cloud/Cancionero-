CANCIONERO TUNA DE DERECHO — ACTUALIZACIÓN DE CUENTAS Y NOTIFICACIONES

ESTRUCTURA A SUBIR A VERCEL
/
  index.html
  admin.html
  sw.js
  manifest.json
  icon-192.png
  icon-512.png
  package.json
  vercel.json
  /api
    register.js
    login.js
    me.js
    logout.js
    subscribe.js
    subscribers.js
    send-notification.js
  /lib
    auth.js

VARIABLES DE ENTORNO EN VERCEL
- VAPID_PUBLIC_KEY
- VAPID_PRIVATE_KEY
- ADMIN_PASSWORD
- VAPID_SUBJECT (opcional; ejemplo: mailto:correo@dominio.com)
- Las variables de conexión de @vercel/kv / Redis que ya use tu proyecto.

IMPORTANTE
1. VAPID_PUBLIC_KEY debe ser EXACTAMENTE la misma que aparece en index.html.
2. Tras desplegar, los integrantes deben crear cuenta o iniciar sesión.
3. Para identificar a quién recibe notificaciones, cada dispositivo debe abrir el Cancionero con su cuenta y activar notificaciones.
4. Las suscripciones antiguas pueden aparecer como "Sin identificar" hasta que el integrante abra la nueva versión e inicie sesión.
5. En iPhone: abrir en Safari > Compartir > Añadir a pantalla de inicio > abrir desde el icono > iniciar sesión > activar notificaciones.
6. Las contraseñas de integrantes NO se guardan en texto plano: se derivan con scrypt + salt.
7. Las sesiones duran 30 días y se guardan mediante token aleatorio.
8. El panel /admin.html permite ver mote, usuario, dispositivo, última actividad y resultado del último push.

PRUEBA RECOMENDADA
- Crear una cuenta de prueba.
- Activar notificaciones.
- Entrar a /admin.html y pulsar “Actualizar estado de integrantes”.
- Confirmar que aparece el mote de prueba.
- Enviar una notificación.
- Confirmar que el panel indica “enviado”.
