/*
 * Genera la hoja de respuestas imprimible como SVG (unidades en milímetros).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SheetRenderer = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function n(v) {
    return Math.round(v * 100) / 100;
  }

  function bubble(b, fontSize, filled) {
    let s = `<circle cx="${n(b.x)}" cy="${n(b.y)}" r="${n(b.r)}" fill="none" stroke="#333" stroke-width="0.25"/>`;
    s += `<text x="${n(b.x)}" y="${n(b.y + fontSize * 0.36)}" font-size="${n(fontSize)}" fill="#9a9a9a" text-anchor="middle">${esc(b.label)}</text>`;
    if (filled) s += `<circle cx="${n(b.x)}" cy="${n(b.y)}" r="${n(b.r * 0.92)}" fill="#1a1a1a"/>`;
    return s;
  }

  /**
   * @param layout resultado de SheetLayout.computeLayout
   * @param opts   { title, subtitle, fill: { answers: [[idx...]...], id: [digit...] } }
   *               `fill` sólo se usa para ejemplos y pruebas automáticas.
   */
  function renderSVG(layout, opts) {
    opts = opts || {};
    const W = layout.width;
    const H = layout.height;
    const fill = opts.fill || {};
    const out = [];

    out.push(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}" ` +
        `font-family="Arial, Helvetica, sans-serif">`
    );
    out.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="#fff"/>`);

    // Marcas de registro y de orientación.
    const ms = layout.markerSize;
    for (const mk of layout.markers) {
      out.push(`<rect x="${n(mk.x - ms / 2)}" y="${n(mk.y - ms / 2)}" width="${ms}" height="${ms}" fill="#000"/>`);
    }
    const o = layout.orientation;
    out.push(`<rect x="${n(o.x - o.size / 2)}" y="${n(o.y - o.size / 2)}" width="${o.size}" height="${o.size}" fill="#000"/>`);

    for (const sm of layout.sideMarks) {
      out.push(`<rect x="${n(sm.x - sm.size / 2)}" y="${n(sm.y - sm.size / 2)}" width="${sm.size}" height="${sm.size}" fill="#000"/>`);
    }

    // Código de configuración.
    for (const cell of layout.codeCells) {
      if (!cell.bit) continue;
      out.push(
        `<rect x="${n(cell.x - cell.size / 2)}" y="${n(cell.y - cell.size / 2)}" width="${cell.size}" height="${cell.size}" fill="#000"/>`
      );
    }

    // Título y encabezado.
    const hd = layout.header;
    const maxTitleW = W - hd.titleX - 24;
    const title = opts.title || 'Hoja de respuestas';
    const titleSize = Math.min(5.2, (maxTitleW / Math.max(8, title.length)) * 1.9);
    out.push(`<text x="${n(hd.titleX)}" y="${n(hd.titleY)}" font-size="${n(titleSize)}" font-weight="bold">${esc(title)}</text>`);
    if (opts.subtitle) {
      out.push(`<text x="${n(hd.titleX)}" y="${n(hd.titleY + 4.8)}" font-size="3" fill="#444">${esc(opts.subtitle)}</text>`);
    }
    for (const f of hd.fields) {
      const labelW = f.label.length * 1.9 + 2.5;
      out.push(`<text x="${n(f.x)}" y="${n(f.y)}" font-size="3.2">${esc(f.label)}:</text>`);
      out.push(`<line x1="${n(f.x + labelW)}" y1="${n(f.y + 0.6)}" x2="${n(f.x2)}" y2="${n(f.y + 0.6)}" stroke="#000" stroke-width="0.2"/>`);
    }

    if (hd.idBlock) {
      const b = hd.idBlock;
      out.push(`<rect x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" rx="1.5" fill="none" stroke="#666" stroke-width="0.25"/>`);
      out.push(`<text x="${n(b.x + b.w / 2)}" y="${n(b.y + 4.6)}" font-size="2.9" font-weight="bold" text-anchor="middle">N° de lista / código (un dígito por fila)</text>`);
      const idFill = fill.id || [];
      for (const row of b.rows) {
        out.push(`<text x="${n(row.labelX)}" y="${n(row.y + 1)}" font-size="2.6" text-anchor="end" fill="#444">${row.index + 1}°</text>`);
        for (let v = 0; v < row.bubbles.length; v++) {
          out.push(bubble(row.bubbles[v], row.bubbles[v].r * 1.1, idFill[row.index] === v));
        }
      }
    }

    // Instrucciones con ejemplo de marcado (en la misma línea, para dejar
    // libre el espacio sobre la grilla).
    const iy = layout.instructionsY;
    out.push(
      `<text x="14" y="${n(iy)}" font-size="2.8" fill="#222">Rellene completamente un círculo por pregunta con lápiz grafito o pasta oscura. No doble la hoja.</text>`
    );
    const ex = W - 14 - 38;
    const ey = iy - 1;
    out.push(`<text x="${n(ex - 1.5)}" y="${n(ey + 0.9)}" font-size="2.6" text-anchor="end" fill="#444">Así:</text>`);
    out.push(`<circle cx="${n(ex + 1.5)}" cy="${n(ey)}" r="1.9" fill="#1a1a1a" stroke="#333" stroke-width="0.25"/>`);
    out.push(`<text x="${n(ex + 16)}" y="${n(ey + 0.9)}" font-size="2.6" text-anchor="end" fill="#444">No así:</text>`);
    const bad = [ex + 19.5, ex + 26, ex + 32.5];
    for (const bx of bad) out.push(`<circle cx="${n(bx)}" cy="${n(ey)}" r="1.9" fill="none" stroke="#333" stroke-width="0.25"/>`);
    out.push(`<path d="M${n(bad[0] - 1.1)} ${n(ey - 1.1)}l2.2 2.2m0 -2.2l-2.2 2.2" stroke="#1a1a1a" stroke-width="0.45"/>`);
    out.push(`<path d="M${n(bad[1] - 1.1)} ${n(ey + 0.1)}l0.8 0.9l1.6 -2" fill="none" stroke="#1a1a1a" stroke-width="0.45"/>`);
    out.push(`<circle cx="${n(bad[2])}" cy="${n(ey)}" r="0.6" fill="#1a1a1a"/>`);

    // Grilla de respuestas.
    const g = layout.grid;
    const fontNum = Math.min(3.2, g.pitch * 0.5);
    const fontLetter = g.r * 1.05;
    const answersFill = fill.answers || [];
    for (const col of g.columns) {
      out.push(
        `<rect x="${n(col.x - 1)}" y="${n(col.y - 1)}" width="${n(col.w + 1)}" height="${n(col.h + 2)}" rx="1.2" fill="none" stroke="#bbb" stroke-width="0.2"/>`
      );
    }
    for (const q of layout.questions) {
      // Línea guía tenue cada 5 preguntas.
      if (q.row > 0 && q.row % 5 === 0) {
        const col = g.columns[q.column];
        const ly = q.y - g.pitch / 2 - 0.9;
        out.push(`<line x1="${n(col.x)}" y1="${n(ly)}" x2="${n(col.x + col.w - 1)}" y2="${n(ly)}" stroke="#ccc" stroke-width="0.2"/>`);
      }
      out.push(
        `<text x="${n(q.labelX)}" y="${n(q.y + fontNum * 0.36)}" font-size="${n(fontNum)}" font-weight="bold" text-anchor="end">${q.number}</text>`
      );
      const marked = answersFill[q.index] || [];
      for (let k = 0; k < q.bubbles.length; k++) out.push(bubble(q.bubbles[k], fontLetter, marked.indexOf(k) >= 0));
    }

    const c = layout.config;
    const footer = `${c.numQuestions} preguntas · alternativas ${g.choiceLabels[0]}–${g.choiceLabels[g.choiceLabels.length - 1]}`;
    out.push(`<text x="${n(W / 2)}" y="${n(layout.footerY)}" font-size="2.3" fill="#777" text-anchor="middle">${esc(footer)}</text>`);

    out.push('</svg>');
    return out.join('');
  }

  return { renderSVG };
});
