const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const R = require('../js/pro/respaldo-core.js');
const ZipWriter = require('../js/zip.js');

test('respaldo: se crea y se vuelve a leer igual', async () => {
  const sheet = new Uint8Array([0xff, 0xd8, 1, 2, 3, 0xff, 0xd9]);
  const photo = new Uint8Array([0xff, 0xd8, 9, 9, 0xff, 0xd9]);
  const state = { exam: { title: 'Prueba 1', numQuestions: 3, key: [0, 1, 2] }, results: [{ id: 'r1', answers: [{ marked: [0] }] }] };
  const book = { version: 1, courses: [{ id: 'c1', name: '8°A', students: [], evaluations: [] }] };
  const zip = R.buildBackup({
    state,
    images: [{ id: 'r1', sheet, photo, scale: 0.5, overlay: { questions: [] } }, { id: 'r/2', sheet, photo: null, scale: 1, overlay: null }],
    assets: { el1: 'data:image/png;base64,AAAA' },
    book,
    settings: { lastBackupAt: 5 },
    date: new Date('2026-09-30T12:00:00Z'),
  });
  const out = await R.parseBackup(zip);
  assert.equal(out.created, '2026-09-30T12:00:00.000Z');
  assert.deepEqual(out.state, state);
  assert.deepEqual(out.book, book);
  assert.deepEqual(out.assets, { el1: 'data:image/png;base64,AAAA' });
  assert.equal(out.images.length, 2);
  assert.deepEqual(Array.from(out.images[0].sheet), Array.from(sheet));
  assert.deepEqual(Array.from(out.images[0].photo), Array.from(photo));
  assert.equal(out.images[0].scale, 0.5);
  assert.equal(out.images[1].id, 'r/2');
  assert.equal(out.images[1].photo, null);
  const files = await R.readZip(zip);
  assert.ok(files.has('LEEME.txt'));
  assert.ok(files.has('imagenes/r_2-hoja.jpg'));
});

test('respaldo: acepta un ZIP vuelto a comprimir (deflate)', async () => {
  const manifest = JSON.stringify({ app: 'lector-hojas-respuesta', tipo: 'respaldo', version: 1, prueba: { exam: { title: 'X' }, results: [] }, imagenes: [] });
  const data = Buffer.from(manifest);
  const comp = zlib.deflateRawSync(data);
  const name = Buffer.from('respaldo.json');
  const crc = ZipWriter.crc32(new Uint8Array(data));
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(comp.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(comp.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(0, 42);
  const cdStart = 30 + name.length + comp.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(46 + name.length, 12);
  end.writeUInt32LE(cdStart, 16);
  const zip = Buffer.concat([local, name, comp, central, name, end]);
  const out = await R.parseBackup(new Uint8Array(zip));
  assert.equal(out.state.exam.title, 'X');
});

test('respaldo: archivos que no son respaldos', async () => {
  await assert.rejects(R.parseBackup(new Uint8Array([1, 2, 3])), /no es un ZIP/);
  const other = ZipWriter.create([{ name: 'hola.txt', data: 'hola' }]);
  await assert.rejects(R.parseBackup(other), /falta respaldo.json/);
  const wrong = ZipWriter.create([{ name: 'respaldo.json', data: JSON.stringify({ app: 'otra' }) }]);
  await assert.rejects(R.parseBackup(wrong), /no es un respaldo de Lector de Hojas/);
  const future = ZipWriter.create([{ name: 'respaldo.json', data: JSON.stringify({ app: 'lector-hojas-respuesta', tipo: 'respaldo', version: 99 }) }]);
  await assert.rejects(R.parseBackup(future), /versión más nueva/);
});
