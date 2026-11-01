/*
 * Generador de PDF mínimo, sin dependencias, para los informes por estudiante
 * de la versión Pro: texto en Helvetica (codificación WinAnsi: tildes, ñ, ¿, ¡),
 * rectángulos, líneas, símbolos ✔ ✘ (ZapfDingbats) e imágenes JPEG. Incluye un
 * maquetador simple (Flow) con párrafos, tablas y saltos de página.
 * Coordenadas en puntos (1/72 de pulgada) con el origen arriba a la izquierda.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PdfCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Ancho de cada carácter (códigos WinAnsi 32–255), en milésimas del tamaño de letra.
  const WIDTHS = {
    regular: [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,0,556,0,222,556,333,1000,556,556,333,1000,667,333,1000,0,611,0,0,222,222,333,333,350,556,1000,333,1000,500,333,944,0,500,667,278,333,556,556,556,556,260,556,333,737,370,556,584,333,737,333,400,584,333,333,333,556,537,278,333,333,365,556,834,834,834,611,667,667,667,667,667,667,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,500,556,556,556,556,278,278,278,278,556,556,556,556,556,556,556,584,611,556,556,556,556,500,556,500],
    bold: [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,0,556,0,278,556,500,1000,556,556,333,1000,667,333,1000,0,611,0,0,278,278,500,500,350,556,1000,333,1000,556,333,944,0,500,667,278,333,556,556,556,556,280,556,333,737,370,556,584,333,737,333,400,584,333,333,333,611,556,278,333,333,365,556,834,834,834,611,722,722,722,722,722,722,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,556,556,556,556,556,278,278,278,278,611,611,611,611,611,611,611,584,611,611,611,611,611,556,611,556],
  };

  // Caracteres Unicode fuera de Latin-1 que sí existen en WinAnsi.
  const WIN = {
    0x20ac: 128, 0x201a: 130, 0x192: 131, 0x201e: 132, 0x2026: 133, 0x2020: 134, 0x2021: 135, 0x2c6: 136,
    0x2030: 137, 0x160: 138, 0x2039: 139, 0x152: 140, 0x17d: 142, 0x2018: 145, 0x2019: 146, 0x201c: 147,
    0x201d: 148, 0x2022: 149, 0x2013: 150, 0x2014: 151, 0x2dc: 152, 0x2122: 153, 0x161: 154, 0x203a: 155,
    0x153: 156, 0x17e: 158, 0x178: 159,
  };

  /** Códigos WinAnsi de un texto (lo que no existe se aproxima o se cambia por «?»). */
  function encode(text) {
    const out = [];
    for (const ch of String(text == null ? '' : text)) {
      const u = ch.codePointAt(0);
      if (u === 9) out.push(32);
      else if (u >= 32 && u < 127) out.push(u);
      else if (u >= 160 && u <= 255) out.push(u);
      else if (WIN[u]) out.push(WIN[u]);
      else if (u === 0x2212) out.push(45); // signo menos
      else if (u === 0x2192) out.push(45, 62); // flecha → como "->"
      else {
        const base = ch.normalize('NFD').charAt(0);
        const b = base.codePointAt(0);
        out.push(b >= 32 && b < 127 ? b : 63);
      }
    }
    return out;
  }

  function charWidth(code, bold) {
    return (bold ? WIDTHS.bold : WIDTHS.regular)[code - 32] || 556;
  }

  function textWidth(text, size, bold) {
    let w = 0;
    for (const c of encode(text)) w += charWidth(c, bold);
    return (w * size) / 1000;
  }

  /** Corta un texto en líneas que caben en maxW (respeta los saltos de línea). */
  function wrap(text, size, bold, maxW) {
    const lines = [];
    for (const para of String(text == null ? '' : text).split(/\r?\n/)) {
      const words = para.split(/ +/).filter((w, i, a) => w !== '' || a.length === 1);
      let line = '';
      for (let word of words) {
        const tryLine = line ? line + ' ' + word : word;
        if (textWidth(tryLine, size, bold) <= maxW) {
          line = tryLine;
          continue;
        }
        if (line) lines.push(line);
        // Palabra más larga que la línea: se corta por caracteres.
        while (textWidth(word, size, bold) > maxW && word.length > 1) {
          let k = word.length - 1;
          while (k > 1 && textWidth(word.slice(0, k), size, bold) > maxW) k--;
          lines.push(word.slice(0, k));
          word = word.slice(k);
        }
        line = word;
      }
      lines.push(line);
    }
    return lines;
  }

  const hex = (codes) => codes.map((c) => c.toString(16).padStart(2, '0')).join('');
  const num = (v) => (Math.round(v * 100) / 100).toString();

  /** Color '#rrggbb' → "r g b" (0–1). */
  function rgb(color) {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color || '#000000');
    if (!m) return '0 0 0';
    return [m[1], m[2], m[3]].map((h) => num(parseInt(h, 16) / 255)).join(' ');
  }

  /** Ancho, alto y canales de un JPEG (marcador SOF). */
  function jpegInfo(bytes) {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = bytes[i + 1];
      const len = (bytes[i + 2] << 8) | bytes[i + 3];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: (bytes[i + 5] << 8) | bytes[i + 6], width: (bytes[i + 7] << 8) | bytes[i + 8], components: bytes[i + 9] };
      }
      i += 2 + len;
    }
    return null;
  }

  /** Documento PDF de páginas del mismo tamaño. */
  class Doc {
    constructor(opts) {
      this.width = (opts && opts.width) || 612; // carta
      this.height = (opts && opts.height) || 792;
      this.pages = [];
      this.images = [];
      this.info = (opts && opts.info) || {};
    }
    addPage() {
      this.pages.push([]);
      this.cur = this.pages.length - 1; // página donde se dibuja (se puede volver a una anterior)
      return this.cur;
    }
    get ops() {
      if (!this.pages.length) this.addPage();
      return this.pages[this.cur];
    }
    text(x, y, text, o) {
      o = o || {};
      const size = o.size || 10;
      const font = o.bold ? 'F2' : 'F1';
      // y es la parte superior de la línea; la línea base va un poco más abajo.
      const base = this.height - y - size * 0.8;
      this.ops.push(`BT /${font} ${num(size)} Tf ${rgb(o.color)} rg ${num(x)} ${num(base)} Td <${hex(encode(text))}> Tj ET`);
    }
    rect(x, y, w, h, o) {
      o = o || {};
      const parts = [];
      if (o.fill) parts.push(`${rgb(o.fill)} rg`);
      if (o.stroke) parts.push(`${rgb(o.stroke)} RG ${num(o.lineWidth || 0.6)} w`);
      parts.push(`${num(x)} ${num(this.height - y - h)} ${num(w)} ${num(h)} re`);
      parts.push(o.fill && o.stroke ? 'B' : o.fill ? 'f' : 'S');
      this.ops.push(parts.join(' '));
    }
    line(x1, y1, x2, y2, o) {
      o = o || {};
      this.ops.push(`${rgb(o.color || '#999999')} RG ${num(o.lineWidth || 0.6)} w ${num(x1)} ${num(this.height - y1)} m ${num(x2)} ${num(this.height - y2)} l S`);
    }
    /** Símbolo ✔ (check) o ✘ (cross) de ZapfDingbats. */
    symbol(x, y, kind, o) {
      o = o || {};
      const size = o.size || 10;
      const code = kind === 'check' ? 0x34 : 0x38;
      this.ops.push(`BT /F3 ${num(size)} Tf ${rgb(o.color)} rg ${num(x)} ${num(this.height - y - size * 0.8)} Td <${code.toString(16)}> Tj ET`);
    }
    /** Imagen JPEG (bytes) en el rectángulo indicado. */
    image(bytes, x, y, w, h) {
      const info = jpegInfo(bytes);
      if (!info) return false;
      const name = 'Im' + (this.images.length + 1);
      this.images.push({ name, bytes, info });
      this.ops.push(`q ${num(w)} 0 0 ${num(h)} ${num(x)} ${num(this.height - y - h)} cm /${name} Do Q`);
      return true;
    }
    output() {
      if (!this.pages.length) this.addPage();
      const enc = new TextEncoder();
      const chunks = [];
      let size = 0;
      const offsets = [];
      const push = (part) => {
        const bytes = typeof part === 'string' ? enc.encode(part) : part;
        chunks.push(bytes);
        size += bytes.length;
      };
      const objects = []; // contenido de cada objeto (índice + 1 = número)
      const reserve = () => objects.push(null);
      const set = (n, body) => (objects[n - 1] = body);
      reserve(); // 1 catálogo
      reserve(); // 2 páginas
      const fonts = [
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
        '<< /Type /Font /Subtype /Type1 /BaseFont /ZapfDingbats >>',
      ].map((f) => objects.push(f));
      const imageObjs = this.images.map((im) =>
        objects.push({
          dict: `<< /Type /XObject /Subtype /Image /Width ${im.info.width} /Height ${im.info.height} /ColorSpace /${im.info.components === 1 ? 'DeviceGray' : im.info.components === 4 ? 'DeviceCMYK' : 'DeviceRGB'} /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.bytes.length} >>`,
          stream: im.bytes,
        })
      );
      const xobj = this.images.length ? `/XObject << ${this.images.map((im, i) => `/${im.name} ${imageObjs[i]} 0 R`).join(' ')} >>` : '';
      const res = `<< /Font << /F1 ${fonts[0]} 0 R /F2 ${fonts[1]} 0 R /F3 ${fonts[2]} 0 R >> ${xobj} >>`;
      const pageNums = [];
      for (const ops of this.pages) {
        const content = ops.join('\n');
        const contentNum = objects.push({ dict: `<< /Length ${enc.encode(content).length} >>`, stream: enc.encode(content) });
        pageNums.push(objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(this.width)} ${num(this.height)}] /Resources ${res} /Contents ${contentNum} 0 R >>`));
      }
      set(1, '<< /Type /Catalog /Pages 2 0 R >>');
      set(2, `<< /Type /Pages /Kids [${pageNums.map((n) => n + ' 0 R').join(' ')}] /Count ${pageNums.length} >>`);
      const infoStr = (s) => '<feff' + Array.from(String(s)).map((ch) => ch.charCodeAt(0).toString(16).padStart(4, '0')).join('') + '>';
      const infoNum = objects.push(
        `<< /Producer (Lector de Hojas de Respuesta) ${this.info.title ? '/Title ' + infoStr(this.info.title) : ''} ${this.info.author ? '/Author ' + infoStr(this.info.author) : ''} >>`
      );
      push('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n');
      objects.forEach((body, i) => {
        offsets.push(size);
        if (typeof body === 'string') push(`${i + 1} 0 obj\n${body}\nendobj\n`);
        else {
          push(`${i + 1} 0 obj\n${body.dict}\nstream\n`);
          push(body.stream);
          push('\nendstream\nendobj\n');
        }
      });
      const xref = size;
      push(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`);
      for (const off of offsets) push(`${String(off).padStart(10, '0')} 00000 n \n`);
      push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${infoNum} 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
      const out = new Uint8Array(size);
      let p = 0;
      for (const c of chunks) {
        out.set(c, p);
        p += c.length;
      }
      return out;
    }
  }

  /**
   * Maquetador de arriba hacia abajo con salto de página automático.
   * margin: margen en puntos; onPage(doc, pageIndex): para encabezados.
   */
  class Flow {
    constructor(doc, opts) {
      this.doc = doc;
      this.margin = (opts && opts.margin) || 42;
      this.bottom = (opts && opts.bottom) || this.margin + 18;
      this.onPage = (opts && opts.onPage) || null;
      this.width = doc.width - 2 * this.margin;
      this.newPage();
    }
    newPage() {
      this.doc.addPage();
      this.y = this.margin;
      if (this.onPage) this.onPage(this);
    }
    /** Asegura h puntos de espacio (si no, pasa a la página siguiente). */
    ensure(h) {
      if (this.y + h > this.doc.height - this.bottom) this.newPage();
    }
    space(h) {
      this.y += h;
    }
    /** Párrafo: { size, bold, color, indent, lineGap, fill (fondo), padding } */
    para(text, o) {
      o = o || {};
      const size = o.size || 10;
      const lh = size * (o.lineGap || 1.32);
      const pad = o.fill ? o.padding || 5 : 0;
      const x = this.margin + (o.indent || 0);
      const w = this.width - (o.indent || 0);
      const lines = wrap(text, size, o.bold, w - 2 * pad);
      // Párrafos cortos no se separan de una página a otra.
      if (lines.length <= 6) this.ensure(lines.length * lh + 2 * pad);
      if (o.fill) this.doc.rect(x, this.y, w, Math.min(lines.length * lh, this.doc.height - this.bottom - this.y) + 2 * pad, { fill: o.fill });
      this.y += pad;
      for (const line of lines) {
        this.ensure(lh);
        this.doc.text(x + pad, this.y, line, { size, bold: o.bold, color: o.color });
        this.y += lh;
      }
      this.y += pad + (o.after == null ? 2 : o.after);
    }
    heading(text, o) {
      o = o || {};
      this.ensure((o.size || 13) * 3.2);
      this.y += o.before == null ? 6 : o.before;
      this.para(text, { size: o.size || 13, bold: true, color: o.color || '#1f4e79', after: 2 });
      this.doc.line(this.margin, this.y, this.margin + this.width, this.y, { color: o.color || '#1f4e79', lineWidth: 0.8 });
      this.y += 6;
    }
    /**
     * Tabla. columns: [{ width (fracción o pt), align }]; rows: [[celda]] donde
     * celda = texto o { text, bold, color, fill, size, symbol: 'check'|'cross', symbolColor }.
     * o: { header: [textos], size, headerFill, border, zebra }
     */
    table(columns, rows, o) {
      o = o || {};
      const size = o.size || 9;
      const pad = 4;
      const total = columns.reduce((s, c) => s + (c.width || 1), 0);
      const widths = columns.map((c) => ((c.width || 1) / total) * this.width);
      const lh = size * 1.28;
      const layoutRow = (cells, bold) =>
        cells.map((cell, i) => {
          const c = cell && typeof cell === 'object' ? cell : { text: cell };
          const sz = c.size || size;
          const symW = c.symbol ? sz + 3 : 0;
          const lines = wrap(c.text == null ? '' : String(c.text), sz, c.bold || bold, Math.max(10, widths[i] - 2 * pad - symW));
          return { c, lines, sz, symW, h: Math.max(1, lines.length) * sz * 1.28 + 2 * pad };
        });
      const drawRow = (laid, fill, bold, headerRow) => {
        const h = Math.max(...laid.map((l) => l.h));
        let x = this.margin;
        laid.forEach((l, i) => {
          const bg = l.c.fill || fill;
          if (bg) this.doc.rect(x, this.y, widths[i], h, { fill: bg });
          if (o.border !== false) this.doc.rect(x, this.y, widths[i], h, { stroke: '#c9d2dc', lineWidth: 0.5 });
          let ty = this.y + pad;
          if (l.c.symbol) this.doc.symbol(x + pad, ty, l.c.symbol, { size: l.sz, color: l.c.symbolColor || l.c.color });
          for (const line of l.lines) {
            const tw = textWidth(line, l.sz, l.c.bold || bold);
            const align = l.c.align || columns[i].align;
            const tx = align === 'center' ? x + (widths[i] - tw) / 2 : align === 'right' ? x + widths[i] - pad - tw : x + pad + l.symW;
            this.doc.text(tx, ty, line, { size: l.sz, bold: l.c.bold || bold, color: l.c.color || (headerRow ? '#ffffff' : '#1c2430') });
            ty += l.sz * 1.28;
          }
          x += widths[i];
        });
        this.y += h;
      };
      const header = o.header ? layoutRow(o.header, true) : null;
      const headerH = header ? Math.max(...header.map((l) => l.h)) : 0;
      if (header) {
        this.ensure(headerH + lh * 2);
        drawRow(header, o.headerFill || '#1f4e79', true, true);
      }
      rows.forEach((cells, k) => {
        const laid = layoutRow(cells, false);
        const h = Math.max(...laid.map((l) => l.h));
        if (this.y + h > this.doc.height - this.bottom) {
          this.newPage();
          if (header) drawRow(header, o.headerFill || '#1f4e79', true, true);
        }
        drawRow(laid, o.zebra && k % 2 ? '#f4f7fa' : null, false, false);
      });
      this.y += 8;
    }
    /** Imagen JPEG ajustada al ancho disponible (y al alto de la página). */
    image(bytes, o) {
      const info = jpegInfo(bytes);
      if (!info) return false;
      const maxW = (o && o.maxWidth) || this.width;
      const full = this.doc.height - this.bottom - this.margin;
      let avail = this.doc.height - this.bottom - this.y;
      // Si queda menos de la mitad de la página, la imagen va en la siguiente.
      if (avail < full * 0.5) {
        this.newPage();
        avail = full;
      }
      let w = Math.min(maxW, this.width);
      let h = (w * info.height) / info.width;
      if (h > avail) {
        h = avail;
        w = (h * info.width) / info.height;
      }
      this.doc.image(bytes, this.margin + (this.width - w) / 2, this.y, w, h);
      this.y += h + 8;
      return true;
    }
  }

  return { Doc, Flow, encode, textWidth, wrap, jpegInfo };
});
