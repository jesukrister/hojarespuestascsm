# Nube de la versión Pro: cómo activar el servidor

La versión Pro tiene la opción **☁️ Guardar en la nube** (pestaña *Cursos*): cada docente crea
una cuenta con su correo y sus cursos, notas y pruebas se guardan solos. Para que funcione hace
falta un pequeño servidor gratuito en Cloudflare y un script de Google que envía los códigos por
correo. Se configura **una sola vez** (unos 20 minutos).

Se usa la misma cuenta de Cloudflare del sitio del colegio: es un servidor **aparte** (otro
nombre y otra base de datos), así que no toca nada del colegio.

> **Secretos:** las claves que inventes en esta guía se pegan **sólo** en Cloudflare y en el
> script de Google. No las pegues en el chat, en GitHub ni en el código.

## 1. Crear el servidor
1. Entra a <https://dash.cloudflare.com> → **Compute (Workers) → Workers y Pages → Crear → Worker**
   («Comenzar con Hello World»).
2. Nombre: `lector-nube`. Presiona **Implementar** (Deploy).
   La dirección queda así: `https://lector-nube.colegiosm.workers.dev`
   (si tu subdominio de workers.dev no es `colegiosm`, lee el paso 8).
3. Presiona **Editar código**. Borra todo lo que aparece y pega el contenido completo del archivo
   [`nube/lector-nube.mjs`](lector-nube.mjs) de este repositorio. Presiona **Implementar**.

## 2. Crear la base de datos
1. Menú izquierdo: **Almacenamiento y bases de datos → D1 → Crear base de datos**.
2. Nombre: `lector-nube`. Presiona **Crear**. (Las tablas se crean solas.)

## 3. Unir el servidor con la base de datos
1. **Workers y Pages → lector-nube → Configuración → Enlaces (Bindings) → Agregar**.
2. Elige **Base de datos D1**. Nombre de la variable: `DB` (en mayúsculas). Base de datos: `lector-nube`.
3. Guarda / **Implementar**.

## 4. Secreto para las sesiones
1. **lector-nube → Configuración → Variables y secretos → Agregar**.
2. Tipo **Secreto**. Nombre: `CLAVE_SESION`. Valor: inventa una clave larga (40 letras y números
   al azar, por ejemplo con un generador de contraseñas). **Implementar**.
   - Si algún día la cambias, todas las personas tendrán que volver a entrar (sus datos no se pierden).

## 5. Script de Google que envía los códigos
1. Entra a <https://script.google.com> con la cuenta de Google desde la que saldrán los correos
   (puede ser tu Gmail; conviene una cuenta tipo `lectordehojas@gmail.com`).
2. **Nuevo proyecto**. Ponle de nombre `Correos Lector de Hojas`.
3. Borra lo que aparece y pega el contenido completo de [`nube/correo.gs`](correo.gs).
4. En la línea `const CLAVE = "cambia-esta-clave";` cambia el texto por **otra** clave larga
   inventada (sin espacios). Guarda (💾).
5. Arriba elige la función **probar** y presiona **Ejecutar**. Google pedirá permisos: acepta
   («Configuración avanzada → Ir a Correos Lector de Hojas»). Te debe llegar un correo de prueba.
6. **Implementar → Nueva implementación** → tipo **Aplicación web**:
   - Ejecutar como: **Yo**.
   - Quién tiene acceso: **Cualquier usuario**.
   - Presiona **Implementar** y copia la **URL de la aplicación web** (termina en `/exec`).

## 6. Conectar el servidor con el script
En Cloudflare, **lector-nube → Configuración → Variables y secretos → Agregar** (dos veces, tipo **Secreto**):

| Nombre | Valor |
| --- | --- |
| `CORREO_URL` | la URL `/exec` del paso 5 |
| `CORREO_CLAVE` | la **misma** clave que escribiste en `CLAVE` del script |

Presiona **Implementar**.

## 7. Probar
1. Abre `https://lector-nube.colegiosm.workers.dev/estado`. Debe decir `"ok":true` y
   `"correoConfigurado":true`.
2. En la versión Pro: **Cursos → ☁️ Guardar en la nube → Crear cuenta**. Debe llegarte el código.
3. Si el código no llega, vuelve a abrir `/estado`: en `ultimoCorreo.causa` aparece qué falló
   (clave distinta, acceso del script que no es «Cualquier usuario», URL que no termina en `/exec`…).
4. La página para borrar la cuenta (la pide Google Play) es
   `https://lector-nube.colegiosm.workers.dev/borrar-cuenta`.

## 8. Si la dirección es otra (o cuando compres un dominio)
La app usa `https://lector-nube.colegiosm.workers.dev`. Si tu servidor quedó con otra dirección,
o cuando conectes un dominio propio (en **lector-nube → Configuración → Dominios y rutas**), hay
que cambiarla en tres lugares y subir el cambio:
- `js/pro/nube.js` → `DEFAULT_URL`.
- `privacidad.html` → enlace de «Cómo borrar la cuenta».
- `docs/google-play.md` y Play Console → *Seguridad de los datos* → enlace para borrar la cuenta.

Cambiar la dirección no borra nada: la base de datos sigue siendo la misma.

## Límites del plan gratis
- **Cloudflare Workers:** 100.000 solicitudes al día. Cada docente usa unas pocas decenas al día.
- **D1:** 5 GB en total. Cada cuenta puede usar hasta 40 MB (un curso con su libro de notas ocupa
  pocos cientos de KB; las fotos de las hojas no se suben).
- **Correos (Gmail):** unos 100 por día con una cuenta gratis (Google Workspace: 1.500). Sólo se
  envían al crear cuenta, olvidar la contraseña o borrar la cuenta. Cada correo puede pedir un
  código por minuto y 6 al día.

## Seguridad
- La contraseña nunca viaja: la app manda una huella (PBKDF2, 100.000 vueltas) y el servidor
  guarda otra huella de esa huella con sal propia.
- Tras 5 contraseñas equivocadas para un mismo correo (o 20 desde una misma conexión) hay que
  esperar 15 minutos, y cada vez más.
- Al cambiar la contraseña con «Olvidé mi contraseña» se cierra la sesión en los demás equipos.
- Los datos no van cifrados de extremo a extremo: quien administra la cuenta de Cloudflare podría
  verlos. Trátalos con el mismo cuidado que los del colegio.

## Actualizar el servidor
Cuando cambie `nube/lector-nube.mjs`: **lector-nube → Editar código**, borra todo, pega el archivo
nuevo y presiona **Implementar**. Los datos se conservan. Si cambia `nube/correo.gs`: pégalo en el
script (manteniendo tu CLAVE) e **Implementar → Gestionar implementaciones → ✏️ → Nueva versión**.
