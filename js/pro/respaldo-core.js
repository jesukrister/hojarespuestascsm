/*
 * Versión Pro · Respaldo completo en un archivo ZIP:
 *   respaldo.json   prueba, resultados, cursos y libro de notas
 *   imagenes/…      hoja corregida y foto original de cada resultado
 *   LEEME.txt
 * Sólo lógica (sin pantalla), para poder probarla aparte.
 */
(function (root, factory) {
  const zip = root && root.ZipWriter ? root.ZipWriter : typeof require === 'function' ? require('../zip.js') : null;
  const api = factory(zip);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RespaldoCore = api;
})(typeof self !== 'undefined' ? self : this, function (ZipWriter) {
  'use strict';

  const APP = 'lector-hojas-respuesta';
  const KIND = 'respaldo';
  const VERSION = 1;
  const MANIFEST = 'respaldo.json';

  const LEEME =
    'Respaldo de Lector de Hojas de Respuesta (versión Pro)\r\n' +
    '=======================================================\r\n\r\n' +
    'Este archivo guarda la prueba, las hojas escaneadas, los cursos y el libro de notas.\r\n\r\n' +
    'Para recuperarlo (en este u otro equipo): abre la versión Pro, pestaña "Cursos",\r\n' +
    'sección "Respaldo", botón "Restaurar un respaldo" y elige este archivo .zip\r\n' +
    '(no hace falta descomprimirlo).\r\n\r\n' +
    'Guárdalo en un lugar seguro (Google Drive, correo o un pendrive): contiene notas\r\n' +
    'y nombres de estudiantes.\r\n';

  /* ------------------------------------------------------------------ */
  /* Lectura de ZIP (sin compresión o "deflate")                         */
  /* ------------------------------------------------------------------ */

  async function inflateRaw(bytes) {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('El archivo está comprimido de una forma que este navegador no puede abrir.');
    }
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  /** @returns Map nombre → Uint8Array */
  async function readZip(input) {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let eocd = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
      if (view.getUint32(i, true) === 0x06054b50) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) throw new Error('El archivo no es un respaldo válido (no es un ZIP).');
    const count = view.getUint16(eocd + 10, true);
    let p = view.getUint32(eocd + 16, true);
    const dec = new TextDecoder();
    const files = new Map();
    for (let k = 0; k < count; k++) {
      if (p + 46 > bytes.length || view.getUint32(p, true) !== 0x02014b50) throw new Error('El archivo ZIP está dañado.');
      const method = view.getUint16(p + 10, true);
      const csize = view.getUint32(p + 20, true);
      const nameLen = view.getUint16(p + 28, true);
      const extraLen = view.getUint16(p + 30, true);
      const commentLen = view.getUint16(p + 32, true);
      const local = view.getUint32(p + 42, true);
      const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
      p += 46 + nameLen + extraLen + commentLen;
      if (name.endsWith('/')) continue;
      if (local + 30 > bytes.length || view.getUint32(local, true) !== 0x04034b50) throw new Error('El archivo ZIP está dañado.');
      const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
      const data = bytes.subarray(start, start + csize);
      if (data.length !== csize) throw new Error('El archivo ZIP está incompleto.');
      if (method === 0) files.set(name, data);
      else if (method === 8) files.set(name, await inflateRaw(data));
      else throw new Error('El archivo está comprimido de una forma no compatible.');
    }
    return files;
  }

  /* ------------------------------------------------------------------ */
  /* Respaldo                                                            */
  /* ------------------------------------------------------------------ */

  /**
   * @param data {
   *   state: { exam, results },
   *   images: [{ id, sheet: Uint8Array, photo: Uint8Array|null, scale, overlay }],
   *   assets: { idElemento: dataURL },
   *   book, settings, edition, date
   * }
   * @returns Uint8Array (archivo .zip)
   */
  function buildBackup(data) {
    const entries = [];
    const imagenes = [];
    for (const im of data.images || []) {
      const safe = String(im.id).replace(/[^a-zA-Z0-9_-]/g, '_');
      const rec = { id: im.id, scale: im.scale, overlay: im.overlay };
      if (im.sheet && im.sheet.length) {
        rec.hoja = `imagenes/${safe}-hoja.jpg`;
        entries.push({ name: rec.hoja, data: im.sheet });
      }
      if (im.photo && im.photo.length) {
        rec.foto = `imagenes/${safe}-foto.jpg`;
        entries.push({ name: rec.foto, data: im.photo });
      }
      imagenes.push(rec);
    }
    const date = data.date || new Date();
    const manifest = {
      app: APP,
      tipo: KIND,
      version: VERSION,
      edicion: data.edition || 'pro',
      creado: date.toISOString(),
      prueba: data.state || null,
      imagenes,
      assets: data.assets || {},
      libro: data.book || null,
      ajustes: data.settings || {},
    };
    entries.unshift({ name: 'LEEME.txt', data: LEEME });
    entries.unshift({ name: MANIFEST, data: JSON.stringify(manifest) });
    return ZipWriter.create(entries, date);
  }

  /**
   * @returns { created, state, images: [{ id, sheet, photo, scale, overlay }], assets, book, settings }
   */
  async function parseBackup(input) {
    const files = await readZip(input);
    const raw = files.get(MANIFEST);
    if (!raw) throw new Error('El archivo no es un respaldo de Lector de Hojas (falta respaldo.json).');
    let m;
    try {
      m = JSON.parse(new TextDecoder().decode(raw));
    } catch (e) {
      throw new Error('El respaldo está dañado (respaldo.json no se puede leer).');
    }
    if (!m || m.app !== APP || m.tipo !== KIND) throw new Error('El archivo no es un respaldo de Lector de Hojas.');
    if (typeof m.version !== 'number' || m.version > VERSION) {
      throw new Error('El respaldo es de una versión más nueva de la plataforma: actualízala y vuelve a intentarlo.');
    }
    const images = [];
    for (const rec of Array.isArray(m.imagenes) ? m.imagenes : []) {
      if (!rec || typeof rec.id !== 'string') continue;
      const sheet = rec.hoja ? files.get(rec.hoja) : null;
      if (!sheet) continue;
      images.push({ id: rec.id, sheet, photo: rec.foto ? files.get(rec.foto) || null : null, scale: rec.scale, overlay: rec.overlay });
    }
    const state = m.prueba && typeof m.prueba === 'object' ? m.prueba : null;
    return {
      created: typeof m.creado === 'string' ? m.creado : '',
      edition: m.edicion || '',
      state: state && state.exam ? { exam: state.exam, results: Array.isArray(state.results) ? state.results : [] } : null,
      images,
      assets: m.assets && typeof m.assets === 'object' ? m.assets : {},
      book: m.libro && typeof m.libro === 'object' ? m.libro : null,
      settings: m.ajustes && typeof m.ajustes === 'object' ? m.ajustes : {},
    };
  }

  return { buildBackup, parseBackup, readZip, MANIFEST };
});
