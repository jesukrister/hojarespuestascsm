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
  secuencias**, organizadas en ítems. Con un clic se traspasan a la hoja de
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

- **Términos pareados**: un par por línea, separado por `=`, `-`, `→`, `|` o
  una tabulación (una tabla pegada de Word o Excel). Se imprime la columna A
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
con un recuadro “FILA B” y con tres celdas en el margen izquierdo que el
lector reconoce; si no puede leerla, la hoja queda “por revisar” y la fila se
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
| `js/app.js` | Lógica de la interfaz y almacenamiento |
| `js/manual-videos.js` | Enlaces de los videos del manual |
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
   para compensar hojas curvadas. Si la hoja fue impresa en otro formato
   (hoja completa, media o cuarto de hoja) o papel, se detecta y se avisa.
5. Se endereza la hoja, se normaliza la iluminación y cada columna de
   preguntas se alinea fila por fila con los contornos impresos de las
   burbujas. Si la alineación no es confiable, la foto se rechaza.
6. Se lee la fila (A–D) en las tres celdas del margen izquierdo, con un código
   de paridad: una celda dudosa o un código inválido nunca dan otra fila, sino
   que dejan la hoja por revisar. Las hojas sin celdas se leen como fila A.
7. Se mide qué tan oscuro está el interior de cada burbuja; un umbral
   automático (o manual) decide cuáles están marcadas, y se detectan
   omisiones, dobles marcas y marcas dudosas.
