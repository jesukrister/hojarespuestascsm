'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const ZipWriter = require('../js/zip.js');
const Xlsx = require('../js/xlsx.js');

/** Lector mínimo de ZIP (sólo método "stored") para verificar lo generado. */
function readZip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = bytes.length - 22;
  while (eocd >= 0 && view.getUint32(eocd, true) !== 0x06054b50) eocd--;
  assert.ok(eocd >= 0, 'falta el fin del directorio central');
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const files = {};
  for (let i = 0; i < count; i++) {
    assert.equal(view.getUint32(p, true), 0x02014b50);
    const crc = view.getUint32(p + 16, true);
    const size = view.getUint32(p + 24, true);
    const nameLen = view.getUint16(p + 28, true);
    const extra = view.getUint16(p + 30, true);
    const comment = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    assert.equal(view.getUint32(local, true), 0x04034b50);
    const lNameLen = view.getUint16(local + 26, true);
    const lExtra = view.getUint16(local + 28, true);
    const data = bytes.subarray(local + 30 + lNameLen + lExtra, local + 30 + lNameLen + lExtra + size);
    assert.equal(ZipWriter.crc32(data), crc, `CRC de ${name}`);
    files[name] = data;
    p += 46 + nameLen + extra + comment;
  }
  return files;
}

test('crc32 coincide con el valor de referencia', () => {
  assert.equal(ZipWriter.crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});

test('el ZIP contiene carpetas, nombres con tildes y datos binarios intactos', () => {
  const bin = new Uint8Array([0, 255, 1, 2, 3, 128]);
  const zip = ZipWriter.create([
    { name: 'prueba/resultados.txt', data: 'hola ñandú' },
    { name: 'prueba/hojas_corregidas/01_07_josé.jpg', data: bin },
  ]);
  const files = readZip(zip);
  assert.equal(new TextDecoder().decode(files['prueba/resultados.txt']), 'hola ñandú');
  assert.deepEqual(Array.from(files['prueba/hojas_corregidas/01_07_josé.jpg']), Array.from(bin));
});

test('la planilla xlsx incluye hojas, texto escapado e hipervínculos relativos', () => {
  const bytes = Xlsx.build([
    {
      name: 'Resultados',
      rows: [
        [{ v: 'Prueba <1> & "final"', s: 'title' }],
        ['N°', 'Nombre', 'Hoja'],
        [1, 'Ana', { v: 'Ver hoja corregida', link: 'hojas_corregidas/01_07_ana.jpg' }],
        [2, 'José', { v: 'Ver foto', link: 'fotos originales/02 josé.jpg' }],
        [3, { v: 5.5, s: 'ok' }],
      ],
      freeze: { row: 2, col: 1 },
    },
    { name: 'Análisis por pregunta', rows: [['x']] },
  ]);
  const files = readZip(bytes);
  const text = (n) => new TextDecoder().decode(files[n]);
  for (const n of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/styles.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml']) {
    assert.ok(files[n], `falta ${n}`);
  }
  const sheet = text('xl/worksheets/sheet1.xml');
  assert.match(sheet, /Prueba &lt;1&gt; &amp; &quot;final&quot;/);
  assert.match(sheet, /<hyperlink ref="C3" r:id="rId1"\/>/);
  assert.match(sheet, /<hyperlink ref="C4" r:id="rId2"\/>/);
  assert.match(sheet, /<c r="B5" s="7"><v>5.5<\/v><\/c>/);
  const rels = text('xl/worksheets/_rels/sheet1.xml.rels');
  assert.match(rels, /Target="hojas_corregidas\/01_07_ana.jpg" TargetMode="External"/);
  assert.match(rels, /Target="fotos%20originales\/02%20jos%C3%A9.jpg"/);
  assert.match(text('xl/workbook.xml'), /name="Análisis por pregunta"/);
  assert.equal(Xlsx.colName(0), 'A');
  assert.equal(Xlsx.colName(25), 'Z');
  assert.equal(Xlsx.colName(26), 'AA');
  assert.equal(Xlsx.colName(134), 'EE');
});
