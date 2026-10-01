# Publicar Lector de Hojas en Google Play

Guía paso a paso y textos listos para copiar en Play Console.

## 0. Antes de empezar

- **Llave privada**: el archivo `lector-hojas-privada.jks` y su contraseña. Guárdalos
  en un lugar seguro (por ejemplo, una carpeta privada de Google Drive y otra
  copia en un pendrive). Sin ellos no se pueden subir actualizaciones.
- **Secretos en GitHub** (una sola vez): en el repositorio, *Settings → Secrets
  and variables → Actions → New repository secret*:
  - `KEYSTORE_BASE64`: el contenido completo de `keystore.base64`.
  - `KEYSTORE_PASSWORD`: la contraseña.

  Después, cada cambio que se sube genera en *Releases → app-android* dos
  archivos firmados: `LectorHojas.apk` (instalación directa) y
  `LectorHojas-GooglePlay.aab` (el que se sube a Play).

## 1. Cuenta de desarrollador

1. Entra a <https://play.google.com/console> con tu cuenta de Google.
2. Elige cuenta **personal**, paga el registro único (US$25) y verifica tu
   identidad (cédula) y tu teléfono.

## 2. Crear la app

*Crear app* → nombre **Lector de Hojas**, idioma **Español (Latinoamérica)**,
tipo **App**, **Gratis**. Acepta las declaraciones.

## 3. Configuración de la app (Panel → “Configura tu app”)

| Sección | Qué responder |
| --- | --- |
| Política de privacidad | `https://jesukrister.github.io/hojarespuestascsm/privacidad.html` |
| Acceso a la app | Toda la funcionalidad está disponible sin restricciones (no hay inicio de sesión). |
| Anuncios | No contiene anuncios. |
| Clasificación de contenido | Categoría **Utilidad, productividad, comunicación u otra**. Responde **No** a violencia, sexualidad, lenguaje, drogas, apuestas, interacción entre usuarios, compras digitales y ubicación. |
| Público objetivo | **18 años o más** (la app es para docentes; los estudiantes sólo rellenan una hoja de papel). No es atractiva para niños. |
| Seguridad de los datos | ¿Recopila o comparte datos? **No**. (Todo se procesa y guarda en el dispositivo; la cámara sólo se usa para fotografiar hojas y las fotos no salen del teléfono.) |
| Apps gubernamentales / financieras / de salud | No. |
| Categoría | **Educación**. Etiquetas: educación, productividad. |
| Datos de contacto | Tu correo de contacto (Play lo muestra en la ficha). |

## 4. Ficha de Play Store

**Nombre (30 caracteres):**

```
Lector de Hojas de Respuesta
```

**Descripción breve (80 caracteres):**

```
Crea pruebas, imprime hojas de respuesta y corrígelas con una foto del celular.
```

**Descripción completa:**

```
Lector de Hojas de Respuesta es una herramienta gratuita para docentes: crea tu prueba, imprime las hojas de respuesta, fotografíalas con el celular y obtén la corrección al instante.

CORRECCIÓN CON UNA FOTO
• Lee las alternativas marcadas y el número de lista de cada estudiante.
• Tolera fotos inclinadas, giradas, con sombras y hojas algo dobladas.
• Marca en amarillo las respuestas dudosas y permite corregirlas a mano.
• Nota automática con escala y exigencia configurables (1,0 a 7,0 con 60 %, u otra).

CREA LA PRUEBA
• Pega tus preguntas desde Word o PDF: se ordenan solas.
• Selección múltiple, verdadero o falso, desarrollo, respuesta breve, términos pareados, completación y ordenar secuencias.
• Membrete, logo, objetivos de aprendizaje e instrucciones.
• Imágenes, tablas, gráficos y fórmulas matemáticas.
• Filas A, B, C y D con preguntas y alternativas mezcladas para evitar la copia; cada fila se corrige con su propia clave.

HOJAS DE RESPUESTA
• 1, 2 o 4 hojas por página para ahorrar papel.
• Carta, A4 u oficio.

RESULTADOS Y EVIDENCIAS
• Resumen del curso, análisis por pregunta y logro por objetivo de aprendizaje (L, ML, NL).
• Exporta un Excel con enlaces a cada hoja corregida y las fotos originales.

PRIVACIDAD
Todo se procesa en tu teléfono: las fotos y las notas no se envían a ningún servidor. Sin publicidad y sin registro.
```

**Recursos gráficos:**

- Ícono 512 × 512: `docs/play/icono-512.png`.
- Gráfico de funciones 1024 × 500: `docs/play/grafico-1024x500.png`.
- Capturas de teléfono (mínimo 2): sácalas desde la app en tu celular
  (Prueba, Escanear con una hoja corregida, Resultados).

## 5. Prueba cerrada (obligatoria en cuentas personales nuevas)

1. *Pruebas → Prueba cerrada → Crear pista*.
2. Sube `LectorHojas-GooglePlay.aab` (desde *Releases → app-android*).
3. Agrega una lista de testers con los correos Gmail de **al menos 12 personas**
   (por ejemplo, colegas).
4. Cada tester acepta la invitación con el enlace que entrega Play Console e
   instala la app desde Play Store.
5. Deben seguir inscritos **14 días seguidos**. Pídeles que la usen y, si
   pueden, que dejen comentarios.
6. Después, en el Panel aparece **Solicitar acceso a producción**: responde el
   cuestionario sobre la prueba.

## 6. Producción

*Producción → Crear versión* → sube el `.aab` más reciente → notas de la
versión → *Revisar y lanzar*. La revisión de Google suele tardar entre unas
horas y algunos días.

### Firma de apps de Play

Al subir el primer `.aab`, acepta **Firma de apps de Play**: Google guarda la
llave final de la app y tu llave privada queda como “llave de subida”. Si algún
día pierdes tu llave, puedes pedir a Google que registre una nueva.

La app instalada desde Play queda firmada por Google, así que **no se actualiza
sobre el APK instalado desde GitHub** (y al revés). Cuando esté en Play, pide a
quienes usan el APK que exporten sus datos (Resultados → Descargar evidencias;
Prueba → Exportar configuración), desinstalen el APK e instalen desde Play.

### Actualizaciones

Cada cambio que se sube al repositorio genera un `.aab` nuevo con número de
versión mayor. Con la **publicación automática** (sección 9) llega solo a
Play Console; si no la configuras, súbelo a mano en *Crear versión* de la
prueba que corresponda.

## 7. Donaciones

En la versión de Google Play **no hay botón de donación**: Google exige usar su
sistema de pagos para donaciones al desarrollador. El botón aparece sólo en la
página web, y se activa pegando el enlace en `js/donaciones.js`.

## 8. Versión Pro (una segunda ficha)

La versión Pro es **otra app** para Google Play (identificador
`cl.lectorhojas.app.pro`), así que tiene su propia ficha. Se publica igual que
la normal, con estas diferencias:

- En *Crear app*: nombre **Lector de Hojas Pro**, gratis.
- Archivo a subir: **`LectorHojasPro-GooglePlay.aab`** (Releases → `app-android`).
- Íconos y gráfico: `docs/play/pro/icono-512.png` y `docs/play/pro/grafico-1024x500.png`.
- Descripción breve (máx. 80): *Corrige pruebas con la cámara y lleva el libro de notas de tus cursos.*
- Descripción completa: la misma de la app normal, agregando al final:

  > **Versión Pro**: cursos con su lista de estudiantes y libro de notas. Las
  > notas de cada prueba escaneada se guardan en el libro con un toque; también
  > puedes agregar notas manuales (trabajos, disertaciones), usar ponderaciones,
  > ver promedios por semestre y el promedio final, con aviso de notas
  > limítrofes. Copia las notas en orden de lista para pegarlas en el libro
  > digital del colegio, descarga el libro en Excel y crea un respaldo completo
  > para pasar tu trabajo a otro equipo (guárdalo en Google Drive con un toque;
  > la app te recuerda respaldar y guarda copias automáticas). Además: casillas de puntaje para
  > preguntas de desarrollo, tickets de salida (8 por página), hojas con el
  > nombre de cada estudiante y lectura del PDF de la fotocopiadora o de
  > varias hojas en una misma foto. Escaneo continuo: deja la cámara abierta y
  > pasa las hojas una tras otra. Análisis de la calidad de cada pregunta
  > (discriminación, distractores, cuáles anular), versión adecuada para
  > estudiantes PIE (Decreto 83) con su propia exigencia, e informe para UTP
  > listo para imprimir o guardar en PDF.

- *Seguridad de los datos*: igual que la normal (no se recopilan datos; las
  notas, nombres y respaldos quedan en el teléfono).
- Si tu cuenta es personal y nueva, esta app también necesita su propia prueba
  cerrada (12 testers durante 14 días).

## 9. Publicación automática desde GitHub

Con esto, **cada cambio que se sube al repositorio llega solo a Play
Console**: GitHub compila las dos apps y sube cada `.aab` a la **prueba
cerrada que estés usando** (la que ya tiene versiones), con el nombre de la
versión (por ejemplo `1.0.15`) y las novedades de `docs/play/novedades.txt`
(app normal) y `docs/play/pro/novedades.txt` (Pro). Google la revisa y les
llega a los testers como actualización.

Se configura **una sola vez** y sólo lo puedes hacer tú, porque se necesita
entrar con tu cuenta de Google.

### 9.1 Crear la cuenta de servicio (Google Cloud)

1. Entra a <https://console.cloud.google.com> con la misma cuenta de Play
   Console y crea un proyecto (arriba, *Seleccionar proyecto → Proyecto
   nuevo*), por ejemplo **lector-hojas-play**.
2. *APIs y servicios → Biblioteca* → busca **Google Play Android Developer
   API** → **Habilitar**.
3. *IAM y administración → Cuentas de servicio → Crear cuenta de servicio*:
   nombre **publicador-github** → *Crear y continuar* → no le des ningún rol →
   *Listo*.
4. Abre la cuenta creada → pestaña *Claves* → *Agregar clave → Crear clave
   nueva* → **JSON** → *Crear*. Se descarga un archivo `.json`: es una
   contraseña, **no lo subas al repositorio ni lo compartas**.
5. Copia el correo de la cuenta de servicio (termina en
   `.iam.gserviceaccount.com`).

### 9.2 Darle permiso en Play Console

1. En Play Console, en el menú de la izquierda de la **cuenta** (no de una
   app): *Usuarios y permisos → Invitar usuarios nuevos*.
2. Pega el correo de la cuenta de servicio.
3. En *Permisos de la app* → *Agregar app* → elige **Lector de Hojas** y
   **Lector de Hojas Pro**, y marca:
   - **Ver información de la app** (sólo lectura) — en inglés *View app
     information*;
   - **Lanzar en segmentos de prueba** — *Release to testing tracks*;
   - (sólo si algún día quieres publicar en producción desde GitHub) **Lanzar
     a producción** — *Release to production, exclude devices, and use Play
     App Signing*.
4. *Invitar usuario*. La cuenta de servicio no necesita aceptar la invitación.
   El permiso puede tardar unas horas (a veces hasta un día) en funcionar.

### 9.3 Guardar la clave en GitHub

1. En el repositorio: *Settings → Secrets and variables → Actions → New
   repository secret*.
2. Nombre: **`PLAY_SERVICE_ACCOUNT_JSON`**. Valor: abre el archivo `.json` con
   el Bloc de notas, copia **todo** su contenido y pégalo.
3. *Add secret*. Después borra el archivo `.json` de tu computador (si se
   pierde o se filtra, en Google Cloud se borra esa clave y se crea otra).

### 9.4 Probar

- En *Actions → App Android (APK) → Run workflow* (deja *Segmento* vacío) →
  *Run workflow*. Al terminar, el resumen de la ejecución muestra el
  recuadro **Google Play** con lo que se publicó en cada app.
- Desde ahí, cada cambio que se sube al repositorio se publica solo.

### Qué hace en cada caso

| Situación | Qué pasa |
| --- | --- |
| Todo configurado | Sube la versión a la prueba cerrada en uso y la envía a revisión de Google. |
| La app nunca se ha publicado (por ejemplo la Pro recién creada) | Google sólo acepta borradores: queda como **borrador** en la prueba cerrada y la primera vez la lanzas a mano (*Revisar versión → Lanzar*). |
| La app todavía no tiene ningún `.aab` en Play Console | Aviso «Play Console no encontró la app»: sube el primer `.aab` a mano; desde la siguiente versión se publica sola. |
| Google pide no enviar a revisión automáticamente | La versión queda lista y el aviso dice que entres a *Resumen de publicación → Enviar cambios a revisión*. |
| Falta el secreto | Compila y publica en *Releases* como siempre, pero no sube nada a Play. |

### Cambiar a qué prueba se publica

Por omisión se usa la prueba cerrada que ya tiene versiones (o *Alpha* si
ninguna tiene). Para cambiarlo, en *Settings → Secrets and variables →
Actions → Variables → New repository variable* crea **`PLAY_TRACK`** con uno
de estos valores:

- `internal`: prueba interna;
- `alpha`: prueba cerrada *Alpha*, o el nombre exacto de otra pista cerrada;
- `beta`: prueba abierta;
- `production`: producción (necesita el permiso de producción del paso 9.2);
- `ninguno`: no publicar en Play.

Al ejecutar el flujo a mano (*Run workflow*) también se puede elegir el
segmento sólo para esa vez.

**Novedades:** antes de subir un cambio importante, actualiza
`docs/play/novedades.txt` y `docs/play/pro/novedades.txt` (máximo 500
caracteres cada uno): es lo que ven los testers en Play Store.

