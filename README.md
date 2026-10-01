# Lector de hojas de respuesta

Aplicación web para **corregir pruebas de selección múltiple con una foto**.
Genera la hoja de respuestas imprimible, la lee desde una fotografía tomada con
el celular (o desde imágenes escaneadas), identifica las alternativas marcadas,
las compara con la clave y calcula puntaje y nota.

Es una página web estática: no necesita servidor ni base de datos, y **todo el
procesamiento ocurre en el navegador** (las fotos de los estudiantes no se
envían a ningún lado). Por eso se puede publicar gratis en GitHub Pages o en
cualquier hosting de archivos estáticos.

## Funcionalidades

- **Configuración de la prueba**: título, 1–120 preguntas, 2–6 alternativas
  (A–F), papel carta, A4 u oficio y 0–10 dígitos de identificación (N° de
  lista o código del estudiante).
- **Generador de evaluaciones**: se pegan las preguntas y alternativas tal como
  vengan (de Word, PDF, correo…, incluso desordenadas) y la plataforma las
  ordena y arma la evaluación imprimible con membrete (establecimiento, logo,
  asignatura, profesor, curso), campos a elección (nombre, curso, fecha, RUT,
  puntaje, nota), recuadro de **Objetivos de Aprendizaje**, instrucciones,
  tipo y tamaño de letra, una o dos columnas. Admite preguntas de **selección
  múltiple, verdadero o falso, desarrollo y respuesta breve** (con el espacio
  para responder a elección: líneas, recuadro o en blanco), **términos
  pareados**, **completación** (con banco de palabras) y **ordenar
  secuencias**, organizadas en ítems, y **fórmulas matemáticas** con un
  editor visual opcional. Con un clic se traspasan a la hoja de
  respuestas las preguntas de selección múltiple, la clave y los objetivos de
  aprendizaje. También imprime la **pauta de respuestas**.
- **Filas A, B, C y D** para evitar la copia: se generan de 2 a 4 versiones de
  la prueba en las que cambia automáticamente el orden de las preguntas (dentro
  de cada ítem) y de las alternativas. Cada fila tiene su hoja de respuestas
  con la fila impresa; el lector la reconoce y corrige con la clave de esa
  fila, y los resultados se analizan en el orden de la fila A.
- **Imágenes, tablas, gráficos y textos en las preguntas**: cada pregunta de
  la vista previa tiene un botón **＋ Añadir elemento** para insertar una
  imagen (subida, arrastrada o pegada con Ctrl+V), una tabla (pegada desde
  Excel o Word), un gráfico de columnas, barras, líneas o circular (a partir
  de datos, en color o en blanco y negro para fotocopiar) o un texto con
  recuadro opcional, antes o después del enunciado.
- **Objetivos de aprendizaje (OA)**: las preguntas se agrupan por objetivo
  (`OA12: 1-4`, `OA13: 5-6`…) para ver el logro de cada OA por estudiante y
  del curso, con niveles Logrado / Medianamente logrado / No logrado.
- **Clave de respuestas**: se ingresa haciendo clic en las burbujas, escribiendo
  `ABCDA BCD…` o **fotografiando una hoja rellenada con las respuestas
  correctas**. Una pregunta sin clave (`-`) queda anulada y no se considera.
- **Hoja imprimible** (SVG a tamaño exacto), con marcas de registro, marca de
  orientación y un código que identifica la configuración. Se puede imprimir
  **1, 2 o 4 hojas de respuestas por página** (media hoja o cuarto de hoja,
  con líneas de corte) para ahorrar papel y tinta, y elegir los campos del
  encabezado (curso, fecha, RUT).
- **Escaneo** desde la cámara del celular o subiendo varias imágenes a la vez
  (también se pueden arrastrar). Tolera fotos inclinadas, giradas (incluso
  al revés), en perspectiva, con iluminación irregular y con la hoja algo
  curvada.
- **Hojas dañadas**: si una hoja está doblada, rayada o rota y no se puede
  escanear, el docente transcribe lo que marcó el estudiante (tocando las
  letras o escribiéndolas seguidas) y la plataforma genera la hoja rellenada
  —con el nombre, el N° de lista y la fila—, la corrige y la agrega a los
  resultados con la etiqueta *transcrita* (también en el Excel). La hoja se
  puede imprimir o guardar en PDF, y se puede adjuntar la foto de la hoja
  original como evidencia.
- **Revisión**: se muestra la hoja enderezada con la corrección superpuesta
  (verde = correcta, rojo = incorrecta, azul = respuesta correcta) y se marcan
  en amarillo las marcas dudosas. Cualquier respuesta se puede corregir a mano.
- **Puntaje y nota**: puntos por correcta, descuento opcional por incorrecta,
  escala de nota con exigencia configurable (por defecto 1,0–7,0 con 60 %).
- **Resultados**: tabla del curso con estadísticas y análisis por pregunta
  (% de acierto y distribución de respuestas).
- **Evidencias para el docente**: descarga una carpeta con la planilla Excel
  (`resultados.xlsx`), la hoja corregida de cada estudiante en JPG y la foto
  original. En el Excel, cada estudiante tiene hipervínculos que abren sus
  imágenes. También se puede exportar sólo un CSV.
- **Lista del curso** opcional: el número de lista marcado en la hoja se asocia
  automáticamente con el nombre del estudiante.
- **Manual de uso** (pestaña *Manual*): guía paso a paso en lenguaje simple,
  con un espacio para un video en cada parte, buscador, enlaces “¿Cómo se usa
  esta pestaña?” en cada pestaña y versión para imprimir.

## Versión Pro

La **versión Pro** (`pro.html`, y en Android la app *Lector Hojas Pro*) tiene
todo lo anterior más herramientas para llevar los cursos. Es gratuita, se
publica junto a la normal y **no la cambia**: son dos páginas (y dos apps)
distintas, con sus datos guardados por separado. Todo lo común (lector,
pestañas, manual…) es el mismo código, así que las mejoras llegan a las dos.

- **Cursos y libro de notas** (pestaña *Cursos*): cada curso tiene su lista
  (N° de lista, nombre y RUT, pegada desde Excel) y sus evaluaciones. Las
  notas de una prueba escaneada se guardan en el libro desde *Resultados* (cada
  hoja va al estudiante del N° de lista marcado); también se agregan **notas
  manuales** (trabajos, disertaciones…) escribiéndolas o pegando una columna de
  Excel. Calcula el promedio de cada semestre o trimestre con **ponderaciones**
  (0 = formativa), el **promedio final**, aproximando o truncando a un decimal,
  y destaca los promedios **limítrofes** (3,9) y bajo 4,0. Las notas
  cambiadas a mano quedan marcadas y no se reemplazan al volver a guardar.
  **Copiar notas** / **Copiar promedios** deja una columna en orden de lista
  para pegar en el libro digital del colegio, y **Excel del curso** descarga el
  libro completo. Para un estudiante que rinde la prueba después, *Usar esta
  prueba de nuevo* recupera la clave y la configuración.
- **Respaldo completo**: un archivo `.zip` con la prueba, las hojas escaneadas
  (con sus imágenes), los cursos y el libro de notas, para guardarlo en Drive o
  el correo y restaurarlo en otro equipo (el libro se combina con el que ya
  hay; la prueba se reemplaza). En el navegador, la primera vez se puede traer
  la prueba de la versión normal.
- **Respaldo más seguro**: **Guardar en Google Drive** (en el celular abre el
  menú Compartir, donde aparece Drive; en el computador usa el menú Compartir
  del sistema o descarga el archivo), un **recordatorio** cuando hace días que
  no se respalda y hay cambios (cada 3, 7, 14 o 30 días, o nunca) y un
  **respaldo automático**: en la app, un archivo sin imágenes en
  *Descargas/LectorHojas* que se reemplaza como máximo una vez por hora; en
  Chrome o Edge, el respaldo completo en una carpeta elegida (por ejemplo la de
  Google Drive para escritorio). Además, **copias automáticas** en el equipo
  (al empezar el día, cada 2 horas con cambios y antes de borrar resultados,
  eliminar un curso o una evaluación o restaurar), con *Volver a esta copia* y
  descarga como respaldo; se conservan las 10 más recientes y una por día del
  último mes (máximo 20).
- **Casillas de desarrollo**: hasta 7 preguntas de desarrollo con una fila de
  casillas 0, 1, 2… (máximo 10 puntos cada una) al final de la hoja. El docente
  corrige la pregunta y marca el puntaje; el lector lo suma a las alternativas
  (se puede corregir a mano en el detalle) y aparece en la tabla, el Excel, las
  evidencias y el análisis. Se pueden crear desde las preguntas de desarrollo
  de la evaluación.
- **Tickets de salida**: formato de 8 por página (medio cuarto de hoja,
  apaisado) para mini controles de 3 a 10 preguntas, que se crean en un paso
  (clave, objetivo y curso) y se guardan en el libro como formativos. En
  *Resultados*, **Para reforzar** lista por objetivo a quienes quedaron en No
  logrado o Medianamente logrado.
- **Hojas con nombre**: una hoja (o ticket) por estudiante con su nombre, el
  curso y el N° de lista ya marcado; con filas, se asignan alternadas según el
  N° de lista y se imprime la lista de reparto.
- **PDF y varias hojas por foto**: se sube el PDF de la fotocopiadora (con
  [pdf.js](https://mozilla.github.io/pdf.js/), incluido en `vendor/pdf` y
  cargado sólo al usarse) y cada página se lee como una foto; en una foto o
  página con varias hojas (tickets, medias hojas) se leen todas.
- **Calidad de las preguntas** (en *Resultados*): dificultad (% de acierto),
  **discriminación** (27 % de mejor puntaje menos 27 % más bajo, y
  punto-biserial corregida), respuestas por alternativa en cada grupo,
  **confiabilidad KR-20** y una sugerencia por pregunta: revisar la clave (los
  mejores eligieron otra alternativa, o la mayoría eligió el mismo distractor),
  discriminación negativa, considerar anularla, distractores que nadie eligió,
  preguntas muy omitidas. **Anular** una pregunta (deja de contar y baja el
  puntaje máximo) o **cambiar su clave** recalcula las notas; ambas cosas se
  deshacen con *Restaurar*. Con menos de 10 hojas sólo se muestran el acierto y
  los avisos de clave.
- **Estudiantes PIE (Decreto 83)**: en *Cursos → Estudiantes* se marca a los
  estudiantes PIE, cuya nota se calcula con la **exigencia PIE** de la prueba
  (50 % por omisión, en *Prueba → Puntaje y nota*) o con una propia. En
  *Evaluación*, la **versión adecuada** imprime la prueba con letra más grande
  (una alternativa por línea) y **una alternativa incorrecta menos** en cada
  pregunta, elegida a mano (o al azar las que falten), y su propia hoja de
  respuestas con una alternativa menos y una marca que el lector reconoce: se
  corrige con su clave, también mezclada con hojas normales en una foto o PDF.
  Las hojas con nombre les dan la hoja PIE a los estudiantes PIE.
- **Escaneo continuo con la cámara** (en *Escanear*): la cámara queda abierta
  y cada hoja que se le pone delante se lee y se guarda sola, con un pitido
  (se guarda cuando dos cuadros seguidos dan la misma lectura; la misma hoja no
  se guarda dos veces). Con linterna si el celular la tiene.
- **Informe para UTP**: desde *Resultados* (de una prueba) o *Cursos* (de un
  curso en un semestre, trimestre o el año), un informe para imprimir o
  guardar en PDF con el resumen, la distribución de notas, el logro por OA y
  por pregunta, los estudiantes que requieren apoyo (con su OA más
  descendido), los estudiantes PIE, la calidad del instrumento, sugerencias,
  las observaciones del docente y espacio para firmas.

`pro.html` se genera a partir de `index.html` y de las partes de
`pro/partes.html` (`npm run build:pro`); `npm test` avisa si quedó
desactualizado. En `index.html`, los comentarios `<!-- pro:… -->` marcan dónde
van las partes Pro y no cambian nada en la versión normal.

## Uso

1. **Prueba**: configura la cantidad de preguntas, alternativas, la clave y
   (opcional) los objetivos de aprendizaje.
2. **Evaluación** (opcional): pega las preguntas, ajusta el membrete y el
   formato, imprime la prueba y usa “Usar estas preguntas en la hoja de
   respuestas” para cargar la cantidad de preguntas, la clave y los OA.
3. **Hoja**: elige cuántas hojas por página (1, 2 o 4) e imprime (a escala
   100 %, sin encabezados del navegador). Con 2 o 4 por página, recorta por la
   línea punteada. Puedes descargar un *ejemplo rellenado* para probar el
   lector sin imprimir.
4. **Escanear**: toma una foto de cada hoja respondida. Consejos:
   - la hoja completa en la foto, con las **cuatro esquinas visibles**;
   - buena luz, sin sombras fuertes ni reflejos;
   - hoja lo más plana posible (una leve curvatura se corrige sola).

   Si una hoja no se puede escanear, usa **✍️ Transcribir una hoja dañada**.
5. **Resultados**: revisa las hojas marcadas “revisar”, corrige si es necesario,
   revisa el logro por OA y descarga las evidencias.

### Texto que reconoce el generador de evaluaciones

- Preguntas numeradas como `1.`, `1)`, `1.-`, `Pregunta 1:` o sin número.
- Alternativas `a)`, `A)`, `a.`, `(a)`, una por línea o varias en la misma
  línea, incluso en desorden.
- Líneas cortadas por el PDF se vuelven a unir; los listados `I.`, `II.`,
  `III.` se respetan.
- Un texto separado por una línea en blanco antes de una pregunta (una
  lectura, por ejemplo) se imprime junto a esa pregunta.
- Alternativa correcta: marcada con `*` (`*b) Santiago` o `b) Santiago *`), o
  una línea final `Clave: 1A 2C 3B…`.
- `OA12` en una línea sola asigna las preguntas siguientes a ese objetivo.
- Si los números vienen desordenados, las preguntas se ordenan según su
  número (se puede desactivar). Se avisa si faltan preguntas, hay números
  repetidos o alguna tiene menos alternativas que las demás.

### Tipos de pregunta: selección múltiple, verdadero o falso y desarrollo

La forma más simple es separar la prueba en ítems con encabezados:

```
I. Selección múltiple
1. ¿Quién fue el primer presidente de Chile?
a) Manuel Blanco Encalada  b) Bernardo O'Higgins  c) José Miguel Carrera

II. Verdadero o falso: Escribe V o F. Justifica las falsas.
1. ____ La Primera Junta de Gobierno se formó en 1810. (V)
2. ____ La batalla de Rancagua fue una victoria patriota. (F)

III. Desarrollo (10 puntos)
1. Explica dos causas de la independencia de Chile. [8 líneas]
2. Elabora una línea de tiempo con cuatro hitos. [recuadro 10]
```

- Las líneas bajo un encabezado son las instrucciones del ítem (si no hay, se
  usan unas por defecto).
- Sin encabezados, una pregunta **sin alternativas** es de desarrollo, y una
  afirmación que empieza con `____` o `( )` (o cuyas alternativas son
  “Verdadero / Falso”) es de verdadero o falso; si se mezclan tipos, los
  ítems se arman solos.
- En la vista previa, cada pregunta tiene un selector para **cambiar su
  tipo** y, en las de desarrollo, la **cantidad de espacio** (2 a 30 líneas)
  y si va **con líneas, en recuadro o en blanco**. En el formato se elige el
  espacio por defecto, cuántas líneas dejar para **justificar** en verdadero o
  falso, la numeración (reiniciada en cada ítem o continua) y el puntaje total.
- A la hoja de respuestas sólo van las preguntas de **selección múltiple**; las
  de verdadero o falso y desarrollo se responden en la misma prueba. Si la
  numeración impresa no coincide con la de la hoja, la plataforma lo advierte.
- El campo **Objetivos de Aprendizaje** del formato (uno por línea) se imprime
  en un recuadro antes de las instrucciones; el botón “Usar los OA definidos en
  la prueba” lo completa con los objetivos de la pestaña Prueba.

### Términos pareados, completación y ordenar

```
III. Términos pareados
Fotosíntesis = Proceso por el cual las plantas producen su alimento
Mitocondria = Organelo que produce energía
Núcleo - Contiene el material genético
Ribosoma

IV. Completación
Banco de palabras: nitrógeno
1. La capital de Chile es [Santiago].
2. El agua se compone de [hidrógeno] y [oxígeno].

V. Ordenar secuencia
1. Ordena cronológicamente los hechos:
a) Descubrimiento de América
b) Independencia de Chile
c) Guerra del Pacífico

VI. Respuesta breve
1. ¿Qué es un ecosistema?
```

- **Términos pareados**: un par por línea, separado por `=`, `:`, `-`, `→`,
  `|` o una tabulación (una tabla pegada de Word o Excel). Dos o más líneas
  seguidas `Término = Definición` se reconocen aunque no tengan encabezado. Se imprime la columna A
  numerada y la columna B desordenada, con una línea para escribir el número.
  Un término sin pareja queda como distractor. También se pueden escribir
  `Columna A` y `Columna B` por separado; la respuesta se indica al final del
  término (`1. Fotosíntesis (b)`) o en la clave (`Clave: 1b 2a`).
- **Completación**: la respuesta va entre corchetes (`[Santiago]`) o se deja
  `____`. Todos los espacios tienen el mismo largo (no delatan la respuesta)
  y las respuestas forman el **banco de palabras** en orden alfabético, al que
  se agregan distractores con `Banco de palabras: …`.
- **Ordenar secuencia**: los elementos se escriben en el orden correcto y se
  imprimen desordenados, con un recuadro para numerarlos.
- **Respuesta breve**: preguntas abiertas con 2 líneas por defecto.
- **Imprimir pauta** genera la tabla de respuestas correctas de cada fila.

### Fórmulas matemáticas (opcional)

En **Evaluación → Más herramientas** (bajo el cuadro de texto) se puede
activar el **editor de fórmulas**. Viene desactivado para no recargar la página
a quien no lo necesita. Al activarlo aparece el botón **∑ Insertar fórmula**,
que abre un editor visual (MathLive) con botones para fracciones, raíces,
potencias y símbolos, y un teclado en pantalla. La fórmula se guarda en el
texto entre `\(` y `\)` (LaTeX) y se dibuja en la vista previa y al imprimir
con KaTeX. Para editar una fórmula, se pone el cursor sobre ella y se presiona
el mismo botón. Sirve en enunciados, alternativas, términos pareados y
oraciones para completar.

Las librerías están incluidas en `vendor/math/` (licencia MIT) y sólo se
descargan cuando se usan: al activar el editor o si el texto tiene fórmulas.

### Filas A, B, C y D

En **Evaluación → Filas** se elige la cantidad de filas (2 a 4) y si se cambia
el orden de las preguntas, de las alternativas o ambos. La fila A conserva el
orden original; en las otras filas:

- las preguntas cambian de lugar **dentro de su ítem** (la numeración de cada
  ítem se mantiene), procurando que ninguna fila repita el orden de otra;
- las alternativas se reordenan procurando que la respuesta correcta no quede
  en la misma letra que en otra fila; “Todas/Ninguna de las anteriores” se
  mantiene en su lugar y las preguntas con alternativas del tipo “A y B” no se
  reordenan;
- se reordenan las columnas de los términos pareados y los elementos a ordenar;
- no se mueven las preguntas de desarrollo ni las que el texto del ítem nombra
  (“Lee el texto y responde las preguntas 1 a 3”).

La mezcla es reproducible (se puede volver a imprimir igual); **Mezclar de
nuevo** genera otra. Al usar las preguntas en la hoja de respuestas se guarda
la clave de cada fila (visible en la pestaña Prueba). En **Hoja** se imprimen
las hojas de todas las filas (una página por fila, o filas alternadas en la
misma página con 2 o 4 hojas por página). La fila queda impresa en la hoja
con los círculos “FILA A B C D” (el de la fila ya relleno; el estudiante no
marca nada) o, a elección, con un recuadro “FILA B”, además de tres celdas en
el margen izquierdo; el lector la reconoce; si no puede leerla, la hoja queda “por revisar” y la fila se
elige a mano. En los resultados, el análisis por pregunta, por OA y las
columnas P1, P2… del Excel usan la numeración de la fila A.

### Elementos en las preguntas

En **Evaluación → Vista previa**, el botón **＋ Añadir elemento** de cada
pregunta abre un editor con vista previa:

- **Imagen**: elegir un archivo, arrastrarlo o pegarlo con Ctrl+V (desde
  Word, una página web o un recorte de pantalla). Se ajusta a un ancho de
  30 %, 50 %, 70 % o 100 % y puede llevar un texto al pie.
- **Tabla**: pegar una tabla copiada desde Excel o Word, o escribir una fila
  por línea separando columnas con `|` o `;`. La primera fila puede ser el
  encabezado.
- **Gráfico**: columnas, barras horizontales, líneas o circular. Los datos
  van una fila por categoría (`Enero; 12`); para varias series, una primera
  fila con sus nombres (`; 2022; 2023`). Acepta decimales con coma. El modo
  blanco y negro distingue las series con grises y texturas, ideal para
  fotocopiar.
- **Texto**: una lectura, cita o fuente, con recuadro opcional.

Cada elemento se ubica antes o después del enunciado y se edita o elimina
haciendo clic sobre él. Los elementos siguen a su pregunta aunque se
reordenen las preguntas; si se cambia el enunciado, la plataforma avisa y
permite reasignarlos. Las imágenes se guardan en el navegador y se incluyen
al exportar la configuración.

### Análisis por objetivo de aprendizaje

En **Prueba → Objetivos de aprendizaje** se escribe un objetivo por línea:
`OA12: 1-4`, `OA13 Comprensión lectora: 5, 6, 9 a 11`. Los niveles
(Logrado desde 75 %, Medianamente logrado desde 50 %, por defecto) son
configurables. El Excel de evidencias incluye una columna `% OA…` por
estudiante, una hoja **Logro por OA** con el promedio del curso y la
cantidad de estudiantes en cada nivel, y la matriz estudiante × objetivo con
colores, además del OA de cada pregunta en el análisis por pregunta.

La configuración y los resultados se guardan en el navegador
(`localStorage`) y las imágenes en IndexedDB, así que siguen disponibles al
recargar la página en el mismo navegador. La configuración de la prueba se
puede exportar/importar como JSON para usarla en otro dispositivo.

### Evidencias

En **Resultados → Evidencias para el docente**:

- **Descargar evidencias (ZIP)** (todos los navegadores). Al extraerlo queda:

  ```
  prueba-de-historia_2026-09-22/
  ├── resultados.xlsx          planilla con hipervínculos
  ├── hojas_corregidas/        01_07_ana-aravena.jpg, …
  ├── fotos_originales/        01_07_ana-aravena.jpg, …
  └── LEEME.txt
  ```

  **Importante:** extrae todo el ZIP (clic derecho → “Extraer todo”) antes de
  abrir el Excel; si se abre desde dentro del ZIP, los enlaces no encuentran
  las imágenes.
- **Guardar en una carpeta…** (Chrome y Edge de escritorio): escribe esa misma
  carpeta directamente donde el docente elija, sin ZIP.

Cada hoja corregida muestra un encabezado con el estudiante, el puntaje, la
nota, la fecha de escaneo y las **correcciones manuales del docente**
(p. ej. “P6: — → E”), seguido de la hoja con las respuestas marcadas en
colores. Los enlaces del Excel son relativos: funcionan mientras la planilla y
las carpetas de imágenes se mantengan juntas (se puede mover o copiar la
carpeta completa, por ejemplo a un pendrive o a Google Drive para escritorio).

## Publicar la página

Los archivos ya están listos para servirse tal cual (`index.html` en la raíz).

**GitHub Pages**: en el repositorio, *Settings → Pages → Build and deployment*,
elige *Deploy from a branch*, la rama principal y la carpeta `/ (root)`. En
unos minutos la aplicación queda disponible en
`https://<usuario>.github.io/<repositorio>/`.

Cualquier otro hosting estático (Netlify, Vercel, Cloudflare Pages, el
servidor del colegio, etc.) funciona igual: basta con subir los archivos.

> Para usar la cámara desde el celular, la página debe servirse por **HTTPS**
> (GitHub Pages y los servicios mencionados ya lo hacen).

## Videos del manual

Cada parte del manual tiene un espacio para un video. Para agregarlos, abre
`js/manual-videos.js`, pega el enlace de cada video entre las comillas y
publica de nuevo la página:

```js
window.MANUAL_VIDEOS = {
  inicio: 'https://www.youtube.com/watch?v=XXXXXXXXXXX',
  prueba: 'https://youtu.be/XXXXXXXXXXX',
  evaluacion: '',            // sin video todavía
  ...
};
```

Sirven enlaces de YouTube (también videos “no listados” y con minuto de
inicio, `?t=90`), Vimeo, Google Drive (compartidos como “Cualquier persona con
el enlace”) o un archivo de video guardado junto a la página (por ejemplo
`videos/escanear.mp4`). Mientras una parte no tiene video se muestra “Video
próximamente”; para ocultar ese aviso, cambia
`window.MANUAL_SHOW_PLACEHOLDERS` a `false`.

Los videos de YouTube, Vimeo y Drive se ven cuando la página está publicada
(por ejemplo en GitHub Pages); al abrir `index.html` directamente desde el
computador, algunos servicios no permiten mostrarlos.

## App Android (APK)

La misma aplicación se empaqueta como app Android con
[Capacitor](https://capacitorjs.com) (carpeta `android/`). Cada vez que se
suben cambios, GitHub Actions (`.github/workflows/android.yml`) prueba la
página, compila las dos apps y las publica en **Releases → `app-android`**:
`LectorHojas.apk` (normal) y `LectorHojasPro.apk` (versión Pro, se instala
aparte y puede convivir con la normal). También quedan como *artifact* de la
ejecución.

En la app:

- la cámara se abre desde **Tomar foto** (Android pide el permiso la primera vez);
- los archivos que en el navegador se descargan (Excel, ZIP, PDF, CSV,
  imágenes) se guardan en **Descargas/LectorHojas**, con un botón para
  compartirlos;
- **Imprimir** usa el servicio de impresión de Android, que también permite
  *Guardar como PDF*;
- el botón Atrás cierra los cuadros de diálogo y vuelve a la pestaña anterior.

Para compilar en un computador (con Android Studio o el SDK de Android):

```bash
npm install
npm run android:sync          # copia la página a android/ (y pro.html a la app Pro)
cd android && ./gradlew assembleNormalRelease assembleProRelease
```

Las dos apps salen del mismo proyecto (*product flavors* `normal` y `pro` en
`android/app/build.gradle`): la Pro usa el identificador
`cl.lectorhojas.app.pro`, su propio nombre e ícono (`android/app/src/pro/res`) y
`pro.html` como página principal.

**Firma**: el APK y el AAB se firman con la **llave privada** del proyecto,
que no está en el repositorio. GitHub Actions la toma de dos secretos del
repositorio (*Settings → Secrets and variables → Actions*):

- `KEYSTORE_BASE64`: el archivo de la llave (`.jks`) en base64.
- `KEYSTORE_PASSWORD`: su contraseña.

Sin esos secretos la app se compila igual (para verificar que no hay errores),
pero no se publica. Cada versión publicada queda en **Releases → `app-android`**:
`LectorHojas.apk` y `LectorHojasPro.apk` (instalación directa), y
`LectorHojas-GooglePlay.aab` y `LectorHojasPro-GooglePlay.aab` (para Google
Play, una ficha por app). La guía para publicar en Google Play, con los textos de la ficha,
está en [`docs/google-play.md`](docs/google-play.md).

**Publicación automática en Google Play:** si el repositorio tiene las
variables `PLAY_WIF_PROVIDER` y `PLAY_SERVICE_ACCOUNT` (GitHub se identifica
ante Google con Workload Identity Federation, sin claves guardadas) o el
secreto `PLAY_SERVICE_ACCOUNT_JSON`, de una cuenta de servicio con permiso en
Play Console, cada compilación sube los dos `.aab` a la prueba cerrada en uso
con `scripts/play-upload.js` (API oficial de publicación de Google Play, sin
dependencias), con las novedades de `docs/play/novedades.txt` y
`docs/play/pro/novedades.txt`. La variable `PLAY_TRACK` elige otro segmento
(`internal`, `alpha`, `beta`, `production` o `ninguno`). Cómo configurarlo:
[`docs/google-play.md`](docs/google-play.md), sección 9.

## Donaciones

La página web muestra un botón **❤ Apoya este proyecto** al pegar el enlace de
donación (PayPal, Ko-fi, Mercado Pago, Flow…) en `js/donaciones.js`. En la app
Android el botón no aparece, porque Google Play exige usar su propio sistema de
pagos para donaciones al desarrollador.

## Licencia

© 2026 Francesco Vivero. Todos los derechos reservados. Uso gratuito de las
versiones oficiales; prohibida su copia, modificación o redistribución sin
autorización del autor. Ver [`LICENSE`](LICENSE) y la
[política de privacidad](privacidad.html). Los componentes de terceros (KaTeX,
MathLive, Capacitor) conservan sus licencias MIT.

## Desarrollo

No hay dependencias ni paso de compilación. Para probar localmente se puede
abrir `index.html` directamente en el navegador, o servir la carpeta:

```bash
npx serve .
```

Pruebas automáticas (Node 20 o superior):

```bash
npm test
```

Las pruebas generan hojas sintéticas “fotografiadas” (perspectiva, rotación,
curvatura, sombras, ruido y desenfoque) y verifican que las respuestas leídas
sean exactamente las marcadas, o que la foto se rechace: el lector nunca debe
entregar una corrección equivocada sin avisar.

### Estructura

| Archivo | Contenido |
| --- | --- |
| `index.html`, `css/styles.css` | Interfaz |
| `pro.html` (generado), `pro/partes.html`, `css/pro.css`, `scripts/build-pro.js` | Versión Pro |
| `js/pro/libro-core.js`, `js/pro/libro.js` | Cursos y libro de notas (lógica y pantalla) |
| `js/pro/respaldo-core.js`, `js/pro/respaldo.js`, `js/pro/comun.js` | Respaldo completo, Guardar en Google Drive y utilidades de la versión Pro |
| `js/pro/copias-core.js`, `js/pro/copias.js` | Copias automáticas, recordatorio de respaldo y respaldo automático (Descargas o carpeta) |
| `js/pro/desarrollo.js`, `js/pro/tickets.js`, `js/pro/nombres.js` | Casillas de desarrollo, tickets de salida y “Para reforzar”, hojas con nombre |
| `js/pro/analisis-core.js`, `js/pro/analisis.js` | Calidad de las preguntas (discriminación, distractores, KR-20, anular) |
| `js/pro/pie.js` | Estudiantes PIE: exigencia propia y versión adecuada de la prueba y de la hoja |
| `js/pro/informe-core.js`, `js/pro/informe.js` | Informe para UTP (cálculos, gráficos SVG y pantalla) |
| `js/pro/camara.js` | Escaneo continuo con la cámara |
| `vendor/pdf/` | pdf.js (lectura de PDF en la versión Pro; en Android sólo va en la app Pro) |
| `js/app.js` | Lógica de la interfaz y almacenamiento |
| `js/manual-videos.js` | Enlaces de los videos del manual |
| `js/native.js` | Integración con la app Android (descargas, impresión, botón Atrás) |
| `android/`, `capacitor.config.json`, `scripts/build-www.mjs` | Proyecto de la app Android |
| `js/donaciones.js` | Enlace del botón de donación (sólo web) |
| `privacidad.html`, `LICENSE`, `docs/google-play.md`, `docs/play/` | Política de privacidad, licencia y material para Google Play (íconos, gráficos y novedades) |
| `scripts/play-upload.js` | Publicación automática de los `.aab` en Google Play Console |
| `vendor/math/` | KaTeX y MathLive (fórmulas), cargados sólo al usarse |
| `js/layout.js` | Geometría de la hoja (compartida por el generador y el lector) |
| `js/sheet.js` | Generación de la hoja en SVG |
| `js/omr.js` | Motor de reconocimiento de marcas |
| `js/grading.js` | Corrección, puntaje, nota, análisis por pregunta y por OA |
| `js/testdoc.js` | Lectura del texto pegado, evaluación imprimible, filas A–D, pauta y elementos (imagen, tabla, texto) |
| `js/charts.js` | Gráficos SVG para las preguntas (columnas, barras, líneas, circular) |
| `js/xlsx.js`, `js/zip.js` | Generación de la planilla Excel y del ZIP de evidencias |
| `tests/` | Pruebas automáticas |

### Cómo funciona el reconocimiento

1. La foto se convierte a escala de grises y se binariza con un umbral
   adaptativo (resiste la iluminación irregular).
2. Se buscan las cuatro marcas negras de las esquinas entre las manchas
   oscuras, eligiendo el cuadrilátero con tamaños y proporciones coherentes.
3. Con ellas se calcula una homografía (corrección de perspectiva). Se prueban
   las cuatro rotaciones posibles y se elige la que muestra la marca de
   orientación y un código de configuración válido; si el código corresponde
   a otra prueba, se avisa.
4. Las marcas laterales dividen la hoja en franjas con su propia homografía,
   para compensar hojas curvadas. Si una marca lateral falta (recortada o
   tapada) y otra mancha se tomó por ella, la lectura se repite ignorando las
   marcas dudosas. Si la hoja fue impresa en otro formato (hoja completa, media
   o cuarto de hoja, aunque se haya impreso ampliada) o papel, se detecta y se
   ofrece usar esa configuración.
5. Se endereza la hoja, se normaliza la iluminación y cada columna de
   preguntas se alinea fila por fila con los contornos impresos de las
   burbujas. Si la alineación no es confiable, la foto se rechaza.
6. Se lee la fila (A–D) en las tres celdas del margen izquierdo, con un código
   de paridad, y en los círculos “FILA A B C D” (el de la fila viene impreso
   relleno). Ambas lecturas deben coincidir; si una no se puede hacer vale la
   otra, y si discrepan la hoja queda por revisar: nunca se adivina la fila.
   Las hojas sin fila impresa se leen como fila A.
7. Si el código de la hoja indica la misma prueba impresa en otro formato o
   papel, se lee con el diseño de la hoja sin cambiar la configuración; si la
   prueba aún no está configurada (sin clave ni resultados), se adopta la de la
   hoja. Sólo una hoja de otra evaluación se rechaza (con la opción de usar su
   configuración).
8. Se mide qué tan oscuro está el interior de cada burbuja; un umbral
   automático (o manual) decide cuáles están marcadas, y se detectan
   omisiones, dobles marcas y marcas dudosas.
9. Casillas de desarrollo (versión Pro): cuatro celdas junto al código de
   configuración indican cuántas filas de desarrollo tiene la hoja (con un bit
   de paridad; las hojas sin casillas no imprimen nada y se leen como 0). Si
   no coincide con la prueba configurada, la hoja se rechaza (o, si tiene menos
   casillas, se lee y se piden los puntajes que faltan). Las filas de
   desarrollo se alinean y controlan igual que las de preguntas.
10. Varias hojas en una foto (versión Pro): después de leer una hoja, su
    papel se tapa y se busca la siguiente. En esa búsqueda sólo se usan las
    manchas del tamaño de las marcas de esquina y se acepta un cuadrilátero
    únicamente si su código dice que es exactamente esta prueba y tiene sus
    marcas laterales; si la lectura no pasa los controles, se prueba el
    siguiente (dos hojas vecinas pueden formar un cuadrilátero engañoso).
11. Versión PIE (versión Pro): la hoja de la versión adecuada tiene una
    alternativa menos y dos celdas negras más en los extremos del código (una
    sola negra no es válida). Cada celda se compara con el papel justo encima
    y debajo de ella. Una hoja PIE se lee con su propio diseño y se corrige con
    su clave (las alternativas se llevan a las de la prueba original); una hoja
    PIE nunca se acepta como normal ni al revés.
