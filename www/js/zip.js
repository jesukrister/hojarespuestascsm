/*
 * Generador mínimo de archivos ZIP (sin compresión, método "stored").
 * Las imágenes JPG ya vienen comprimidas, así que comprimir de nuevo no
 * aporta; a cambio el código es simple y no depende de librerías externas.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ZipWriter = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function toBytes(data) {
    if (data instanceof Uint8Array) return data;
    if (typeof data === 'string') return new TextEncoder().encode(data);
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    throw new Error('Tipo de dato no soportado en el ZIP');
  }

  function dosDateTime(date) {
    const d = date || new Date();
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
    const day = ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    return { time, day };
  }

  /**
   * @param entries [{ name: 'carpeta/archivo.jpg', data: Uint8Array | string }]
   * @returns Uint8Array con el contenido del ZIP
   */
  function create(entries, date) {
    const enc = new TextEncoder();
    const { time, day } = dosDateTime(date);
    const files = entries.map((e) => {
      const data = toBytes(e.data);
      return { name: enc.encode(e.name), data, crc: crc32(data) };
    });

    let size = 22;
    for (const f of files) size += 30 + f.name.length + f.data.length + 46 + f.name.length;
    const out = new Uint8Array(size);
    const view = new DataView(out.buffer);
    let p = 0;
    const u16 = (v) => { view.setUint16(p, v, true); p += 2; };
    const u32 = (v) => { view.setUint32(p, v >>> 0, true); p += 4; };

    const offsets = [];
    for (const f of files) {
      offsets.push(p);
      u32(0x04034b50);
      u16(20); // versión necesaria
      u16(0x0800); // nombres en UTF-8
      u16(0); // sin compresión
      u16(time);
      u16(day);
      u32(f.crc);
      u32(f.data.length);
      u32(f.data.length);
      u16(f.name.length);
      u16(0);
      out.set(f.name, p);
      p += f.name.length;
      out.set(f.data, p);
      p += f.data.length;
    }
    const cdStart = p;
    files.forEach((f, i) => {
      u32(0x02014b50);
      u16(20);
      u16(20);
      u16(0x0800);
      u16(0);
      u16(time);
      u16(day);
      u32(f.crc);
      u32(f.data.length);
      u32(f.data.length);
      u16(f.name.length);
      u16(0);
      u16(0);
      u16(0);
      u16(0);
      u32(0);
      u32(offsets[i]);
      out.set(f.name, p);
      p += f.name.length;
    });
    const cdSize = p - cdStart;
    u32(0x06054b50);
    u16(0);
    u16(0);
    u16(files.length);
    u16(files.length);
    u32(cdSize);
    u32(cdStart);
    u16(0);
    return out;
  }

  return { create, crc32 };
});
