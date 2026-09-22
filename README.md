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
- **Clave de respuestas**: se ingresa haciendo clic en las burbujas, escribiendo
  `ABCDA BCD…` o **fotografiando una hoja rellenada con las respuestas
  correctas**. Una pregunta sin clave (`-`) queda anulada y no se considera.
- **Hoja imprimible** (SVG a tamaño exacto), con marcas de registro, marca de
  orientación y un código que identifica la configuración.
- **Escaneo** desde la cámara del celular o subiendo varias imágenes a la vez
  (también se pueden arrastrar). Tolera fotos inclinadas, giradas (incluso
  al revés), en perspectiva, con iluminación irregular y con la hoja algo
  curvada.
- **Revisión**: se muestra la hoja enderezada con la corrección superpuesta
  (verde = correcta, rojo = incorrecta, azul = respuesta correcta) y se marcan
  en amarillo las marcas dudosas. Cualquier respuesta se puede corregir a mano.
- **Puntaje y nota**: puntos por correcta, descuento opcional por incorrecta,
  escala de nota con exigencia configurable (por defecto 1,0–7,0 con 60 %).
- **Resultados**: tabla del curso con estadísticas, análisis por pregunta
  (% de acierto y distribución de respuestas) y exportación a CSV (compatible
  con Excel en español).
- **Lista del curso** opcional: el número de lista marcado en la hoja se asocia
  automáticamente con el nombre del estudiante.

## Uso

1. **Prueba**: configura la cantidad de preguntas, alternativas y la clave.
2. **Hoja**: imprime la hoja (a escala 100 %, sin encabezados del navegador).
   Puedes descargar un *ejemplo rellenado* para probar el lector sin imprimir.
3. **Escanear**: toma una foto de cada hoja respondida. Consejos:
   - la hoja completa en la foto, con las **cuatro esquinas visibles**;
   - buena luz, sin sombras fuertes ni reflejos;
   - hoja lo más plana posible (una leve curvatura se corrige sola).
4. **Resultados**: revisa las hojas marcadas “revisar”, corrige si es necesario
   y exporta el CSV.

La configuración y los resultados se guardan en el navegador
(`localStorage`). Las imágenes de las hojas sólo se conservan durante la
sesión; las respuestas leídas quedan guardadas. La configuración de la prueba
se puede exportar/importar como JSON para usarla en otro dispositivo.

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
| `js/layout.js` | Geometría de la hoja (compartida por el generador y el lector) |
| `js/sheet.js` | Generación de la hoja en SVG |
| `js/omr.js` | Motor de reconocimiento de marcas |
| `js/grading.js` | Corrección, puntaje, nota y análisis por pregunta |
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
   para compensar hojas curvadas.
5. Se endereza la hoja, se normaliza la iluminación y cada columna de
   preguntas se alinea fila por fila con los contornos impresos de las
   burbujas. Si la alineación no es confiable, la foto se rechaza.
6. Se mide qué tan oscuro está el interior de cada burbuja; un umbral
   automático (o manual) decide cuáles están marcadas, y se detectan
   omisiones, dobles marcas y marcas dudosas.
