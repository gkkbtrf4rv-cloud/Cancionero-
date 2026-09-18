# Pruebas de interfaz

Ejecutar desde la raíz del proyecto con Node.js 24:

```sh
npm ci --ignore-scripts
npm install --no-save playwright
npx playwright install chromium
node validacion/mobile.cjs
```

El servidor de prueba se limita a localhost. Las APIs, las cuentas y las notificaciones son simuladas: no se envían mensajes ni se accede a producción. La captura contiene canciones de prueba, no el repertorio real.

Se puede indicar un Chromium instalado mediante `CHROMIUM_EXECUTABLE`, una ruta a Playwright mediante `PLAYWRIGHT_MODULE`, y limitar escenarios mediante `QA_FILTER`.

Se verificaron 16 escenarios de interfaz. El archivo de resultados combina la ejecución inicial con la prueba adicional de sincronización diaria. Se repitieron además los tres tamaños de lectura tras corregir la sincronización diaria y se revisó la captura después de finalizar la transición de bienvenida.

Estas pruebas se ejecutaron en Chromium. Los estados iPhone/iPad se emulan mediante APIs y agente de usuario; no validan la recepción push real en Safari ni en un teléfono físico.
