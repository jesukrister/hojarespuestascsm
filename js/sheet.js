/*
 * Genera la hoja de respuestas imprimible como SVG (unidades en milímetros).
 */
(function (root, factory) {
  const layoutApi =
    root && root.SheetLayout ? root.SheetLayout : typeof require === 'function' ? require('./layout.js') : null;
  const api = factory(layoutApi);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SheetRenderer = api;
})(typeof self !== 'undefined' ? self : this, function (SheetLayout) {
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
   * Contenido de una hoja de respuestas (sin el elemento <svg> contenedor).
   * @param layout resultado de SheetLayout.computeLayout
   * @param opts   { title, subtitle, school, fill: { answers: [[idx...]...], id: [digit...] } }
   *               `fill` sólo se usa para ejemplos y pruebas automáticas.
   */
  function renderContent(layout, opts) {
    opts = opts || {};
    const W = layout.width;
    const H = layout.height;
    const k = layout.scale || 1;
    const fill = opts.fill || {};
    const out = [];

    out.push(`<rect x="0" y="0" width="${n(W)}" height="${n(H)}" fill="#fff"/>`);

    // Marcas de registro, orientación y laterales.
    const ms = layout.markerSize;
    for (const mk of layout.markers) {
      out.push(`<rect x="${n(mk.x - ms / 2)}" y="${n(mk.y - ms / 2)}" width="${n(ms)}" height="${n(ms)}" fill="#000"/>`);
    }
    const o = layout.orientation;
    out.push(`<rect x="${n(o.x - o.size / 2)}" y="${n(o.y - o.size / 2)}" width="${n(o.size)}" height="${n(o.size)}" fill="#000"/>`);
    for (const sm of layout.sideMarks) {
      out.push(`<rect x="${n(sm.x - sm.size / 2)}" y="${n(sm.y - sm.size / 2)}" width="${n(sm.size)}" height="${n(sm.size)}" fill="#000"/>`);
    }

    // Código de configuración.
    for (const cell of layout.codeCells) {
      if (!cell.bit) continue;
      out.push(
        `<rect x="${n(cell.x - cell.size / 2)}" y="${n(cell.y - cell.size / 2)}" width="${n(cell.size)}" height="${n(cell.size)}" fill="#000"/>`
      );
    }

    // Fila de la prueba (B, C, D): celdas en el margen izquierdo.
    for (const cell of layout.formCells || []) {
      if (!cell.bit) continue;
      out.push(
        `<rect x="${n(cell.x - cell.size / 2)}" y="${n(cell.y - cell.size / 2)}" width="${n(cell.size)}" height="${n(cell.size)}" fill="#000"/>`
      );
    }

    // Título y encabezado.
    const hd = layout.header;
    let topRightEdge = layout.markers[1].x - ms / 2 - 3 * k;
    if (layout.form !== null && layout.form !== undefined) {
      // Recuadro "FILA B" a la derecha del título.
      const bw = 15 * k;
      const bh = 9 * k;
      const bx = topRightEdge - 3 * k - bw;
      const by = hd.titleY - 5.6 * k;
      const letter = SheetLayout.FORM_LETTERS[layout.form];
      out.push(`<rect x="${n(bx)}" y="${n(by)}" width="${n(bw)}" height="${n(bh)}" rx="${n(1.2 * k)}" fill="none" stroke="#000" stroke-width="0.35"/>`);
      out.push(`<text x="${n(bx + 4.2 * k)}" y="${n(by + bh / 2 + 1 * k)}" font-size="${n(2.4 * k)}" text-anchor="middle">FILA</text>`);
      out.push(`<text x="${n(bx + bw - 4.6 * k)}" y="${n(by + bh / 2 + 2.3 * k)}" font-size="${n(6.5 * k)}" font-weight="bold" text-anchor="middle">${letter}</text>`);
      topRightEdge = bx - 2 * k;
    }
    const maxTitleW = topRightEdge - hd.titleX;
    const title = opts.title || 'Hoja de respuestas';
    const titleSize = Math.min(5.2 * k, (maxTitleW / Math.max(8, title.length)) * 1.9);
    out.push(`<text x="${n(hd.titleX)}" y="${n(hd.titleY)}" font-size="${n(titleSize)}" font-weight="bold">${esc(title)}</text>`);
    const sub = [opts.school, opts.subtitle].filter(Boolean).join(' · ');
    if (sub) {
      const subSize = Math.min(3 * k, (maxTitleW / Math.max(8, sub.length)) * 2);
      out.push(`<text x="${n(hd.titleX)}" y="${n(hd.titleY + 4.8 * k)}" font-size="${n(subSize)}" fill="#444">${esc(sub)}</text>`);
    }
    const fieldFont = 3.2 * k;
    for (const f of hd.fields) {
      const labelW = (f.label.length * 1.9 + 2.5) * k;
      out.push(`<text x="${n(f.x)}" y="${n(f.y)}" font-size="${n(fieldFont)}">${esc(f.label)}:</text>`);
      out.push(`<line x1="${n(f.x + labelW)}" y1="${n(f.y + 0.6 * k)}" x2="${n(f.x2)}" y2="${n(f.y + 0.6 * k)}" stroke="#000" stroke-width="0.2"/>`);
    }

    if (hd.idBlock) {
      const b = hd.idBlock;
      out.push(`<rect x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" rx="1.5" fill="none" stroke="#666" stroke-width="0.25"/>`);
      const idTitle = k < 0.9 ? 'N° de lista / código' : 'N° de lista / código (un dígito por fila)';
      out.push(`<text x="${n(b.x + b.w / 2)}" y="${n(b.y + 4.6 * k)}" font-size="${n(2.9 * k)}" font-weight="bold" text-anchor="middle">${idTitle}</text>`);
      const idFill = fill.id || [];
      for (const row of b.rows) {
        out.push(`<text x="${n(row.labelX)}" y="${n(row.y + 1 * k)}" font-size="${n(2.6 * k)}" text-anchor="end" fill="#444">${row.index + 1}°</text>`);
        for (let v = 0; v < row.bubbles.length; v++) {
          out.push(bubble(row.bubbles[v], row.bubbles[v].r * 1.1, idFill[row.index] === v));
        }
      }
    }

    // Instrucciones con ejemplo de marcado (en la misma línea, para dejar
    // libre el espacio sobre la grilla).
    const iy = layout.instructionsY;
    const left = 14 * k;
    const instr =
      k === 1
        ? 'Rellene completamente un círculo por pregunta con lápiz grafito o pasta oscura. No doble la hoja.'
        : 'Rellene completamente un círculo por pregunta.';
    out.push(`<text x="${n(left)}" y="${n(iy)}" font-size="${n(2.8 * k)}" fill="#222">${instr}</text>`);
    const u = k; // unidad del ejemplo
    const er = 1.9 * u;
    const ex = W - 14 * k - 38 * u;
    const ey = iy - 1 * u;
    out.push(`<text x="${n(ex - 1.5 * u)}" y="${n(ey + 0.9 * u)}" font-size="${n(2.6 * k)}" text-anchor="end" fill="#444">Así:</text>`);
    out.push(`<circle cx="${n(ex + 1.5 * u)}" cy="${n(ey)}" r="${n(er)}" fill="#1a1a1a" stroke="#333" stroke-width="0.25"/>`);
    out.push(`<text x="${n(ex + 16 * u)}" y="${n(ey + 0.9 * u)}" font-size="${n(2.6 * k)}" text-anchor="end" fill="#444">No así:</text>`);
    const bad = [ex + 19.5 * u, ex + 26 * u, ex + 32.5 * u];
    for (const bx of bad) out.push(`<circle cx="${n(bx)}" cy="${n(ey)}" r="${n(er)}" fill="none" stroke="#333" stroke-width="0.25"/>`);
    out.push(`<path d="M${n(bad[0] - 1.1 * u)} ${n(ey - 1.1 * u)}l${n(2.2 * u)} ${n(2.2 * u)}m0 ${n(-2.2 * u)}l${n(-2.2 * u)} ${n(2.2 * u)}" stroke="#1a1a1a" stroke-width="${n(0.45 * u)}"/>`);
    out.push(`<path d="M${n(bad[1] - 1.1 * u)} ${n(ey + 0.1 * u)}l${n(0.8 * u)} ${n(0.9 * u)}l${n(1.6 * u)} ${n(-2 * u)}" fill="none" stroke="#1a1a1a" stroke-width="${n(0.45 * u)}"/>`);
    out.push(`<circle cx="${n(bad[2])}" cy="${n(ey)}" r="${n(0.6 * u)}" fill="#1a1a1a"/>`);

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
      for (let j = 0; j < q.bubbles.length; j++) out.push(bubble(q.bubbles[j], fontLetter, marked.indexOf(j) >= 0));
    }

    const c = layout.config;
    const footer = `${c.numQuestions} preguntas · alternativas ${g.choiceLabels[0]}–${g.choiceLabels[g.choiceLabels.length - 1]}`;
    out.push(`<text x="${n(W / 2)}" y="${n(layout.footerY)}" font-size="${n(2.3 * k)}" fill="#777" text-anchor="middle">${esc(footer)}</text>`);
    return out.join('');
  }

  function svgOpen(W, H) {
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" width="${n(W)}mm" height="${n(H)}mm" viewBox="0 0 ${n(W)} ${n(H)}" ` +
      `font-family="Arial, Helvetica, sans-serif">`
    );
  }

  /** Una sola hoja de respuestas (del tamaño del formato elegido). */
  function renderSVG(layout, opts) {
    return svgOpen(layout.width, layout.height) + renderContent(layout, opts) + '</svg>';
  }

  /**
   * Página completa para imprimir: 1, 2 o 4 hojas de respuestas con líneas de corte.
   * @returns { svg, width, height, landscape }
   */
  function renderPageSVG(layout, opts, pieceLayouts) {
    const c = layout.config;
    const tiling = SheetLayout.pageTiling(c.paper, c.format);
    const content = renderContent(layout, opts);
    const out = [svgOpen(tiling.width, tiling.height)];
    out.push(`<rect x="0" y="0" width="${n(tiling.width)}" height="${n(tiling.height)}" fill="#fff"/>`);
    // pieceLayouts: una hoja distinta por recorte (p. ej. filas A, B, C y D en la misma página).
    tiling.pieces.forEach((p, i) => {
      const own = pieceLayouts && pieceLayouts.length ? pieceLayouts[i % pieceLayouts.length] : null;
      out.push(`<g transform="translate(${n(p.x)} ${n(p.y)})">${own ? renderContent(own, opts) : content}</g>`);
    });
    for (const cut of tiling.cuts) {
      out.push(`<line x1="${n(cut.x1)}" y1="${n(cut.y1)}" x2="${n(cut.x2)}" y2="${n(cut.y2)}" stroke="#9a9a9a" stroke-width="0.25" stroke-dasharray="2 1.5"/>`);
      const vertical = cut.x1 === cut.x2;
      // Tijeras en ambos extremos de la línea de corte.
      const ends = vertical
        ? [{ x: cut.x1, y: 6, rot: 90 }, { x: cut.x1, y: cut.y2 - 6, rot: 90 }]
        : [{ x: 6, y: cut.y1, rot: 0 }, { x: cut.x2 - 6, y: cut.y1, rot: 0 }];
      for (const e of ends) {
        out.push(
          `<text x="${n(e.x)}" y="${n(e.y)}" font-size="4" fill="#9a9a9a" text-anchor="middle" dominant-baseline="central" transform="rotate(${e.rot} ${n(e.x)} ${n(e.y)})">✂</text>`
        );
      }
    }
    out.push('</svg>');
    return { svg: out.join(''), width: tiling.width, height: tiling.height, landscape: tiling.landscape };
  }

  return { renderSVG, renderPageSVG };
});
