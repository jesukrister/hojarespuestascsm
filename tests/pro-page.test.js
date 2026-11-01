const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { build, buildApp, parseParts } = require('../scripts/build-pro.js');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

test('pro.html está al día con lector.html y pro/partes.html', () => {
  assert.equal(read('pro.html'), build(), 'Ejecuta: node scripts/build-pro.js');
});

test('app/index.html es CorrigeYa con <base href="../"> (misma página que pro.html)', () => {
  const app = read('app/index.html');
  assert.equal(app, buildApp(), 'Ejecuta: node scripts/build-pro.js');
  assert.match(app, /<head>\n  <base href="\.\.\/">/);
  assert.equal(app.replace('\n  <base href="../">', ''), read('pro.html'));
});

test('la portada es la presentación de CorrigeYa y la app normal sigue en lector.html', () => {
  const portada = read('index.html');
  assert.match(portada, /<title>[^<]*CorrigeYa/);
  assert.doesNotMatch(portada, /src="js\/app\.js"/);
  assert.match(portada, /href="app\/"/);
  assert.match(read('lector.html'), /src="js\/app\.js"/);
  assert.match(read('corrigeya/index.html'), /url=\.\.\//);
});

test('la versión normal no carga nada de la versión Pro', () => {
  const html = read('lector.html');
  assert.doesNotMatch(html, /data-edition/);
  assert.doesNotMatch(html, /js\/pro\/|css\/pro\.css|data-tab="cursos"/);
});

test('la versión Pro tiene sus partes', () => {
  const html = read('pro.html');
  assert.match(html, /<html lang="es" data-edition="pro">/);
  assert.match(html, /<title>Lector de Hojas de Respuesta Pro<\/title>/);
  for (const needle of [
    'data-tab="cursos"', 'id="tab-cursos"', 'id="proBookBox"', 'id="proExamCourse"', 'id="man-cursos"', 'src="js/pro/libro.js"', 'href="css/pro.css"',
    'id="proQuality"', 'id="proPieCard"', 'id="pieExigencia"', 'id="proReportDialog"', 'id="proReportTest"', 'id="proReportCourse"',
    'id="man-calidad"', 'id="man-pie"', 'id="man-utp"', 'src="js/pro/pie.js"', 'src="js/pro/informe.js"',
  ]) {
    assert.ok(html.includes(needle), needle);
  }
  // Todas las partes se insertaron y no quedan puntos de inserción sin usar de esas partes.
  for (const name of Object.keys(parseParts(read('pro/partes.html')))) assert.ok(!html.includes(`<!-- pro:${name} -->`), name);
  // Los scripts Pro van después de app.js.
  assert.ok(html.indexOf('src="js/app.js"') < html.indexOf('src="js/pro/comun.js"'));
});
