/*
 * Gráficos simples para evaluaciones impresas (SVG vectorial).
 *
 * Tipos: columnas, barras horizontales, líneas y circular. Los datos se
 * escriben o pegan desde Excel: una fila por categoría, columnas separadas
 * por tabulación, ";" o "|". Si la primera fila no tiene números, son los
 * nombres de las series.
 *
 * Modo "blanco y negro" (pensado para fotocopias): las series se distinguen
 * por tono de gris y textura diagonal, no sólo por color.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Charts = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Paleta categórica validada (orden fijo, nunca cíclico).
  const COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];
  // Blanco y negro: tono + textura (45° / 135°) para no depender del color.
  const BW = [
    { fill: '#3d3d3d' },
    { fill: '#c4c4c4' },
    { fill: '#ffffff', hatch: 45, ink: '#1f1f1f' },
    { fill: '#8a8a8a', hatch: 135, ink: '#ffffff' },
    { fill: '#ffffff', hatch: 135, ink: '#1f1f1f' },
    { fill: '#e2e2e2', hatch: 45, ink: '#3d3d3d' },
    { fill: '#6b6b6b', hatch: 45, ink: '#ffffff' },
    { fill: '#a8a8a8', hatch: 135, ink: '#1f1f1f' },
  ];
  const LINE_DASH = ['', '8 5', '2 4', '10 4 2 4'];
  const MARKERS = ['circle', 'square', 'triangle', 'diamond'];

  const W = 640;
  const INK = '#1c1c1c';
  const MUTED = '#555';
  const GRID = '#d6d6d6';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function n(v) {
    return Math.round(v * 10) / 10;
  }

  /** "3,5" → 3.5 · "1.234,5" → 1234.5 · "45 %" → 45 */
  function parseNumber(s) {
    let t = String(s == null ? '' : s).replace(/[%\s$]/g, '');
    if (!t) return null;
    if (t.indexOf(',') >= 0 && t.indexOf('.') >= 0) t = t.replace(/\./g, '').replace(',', '.');
    else if (t.indexOf(',') >= 0) t = t.replace(',', '.');
    const v = Number(t);
    return Number.isFinite(v) ? v : null;
  }

  function splitRow(line) {
    if (line.indexOf('\t') >= 0) return line.split('\t');
    if (line.indexOf(';') >= 0) return line.split(';');
    if (line.indexOf('|') >= 0) return line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|');
    // "Lunes 12" → ["Lunes", "12"]
    const m = line.match(/^(.*\S)\s+(-?[\d.,]+\s*%?)$/);
    if (m) return [m[1], m[2]];
    const c = line.match(/^(.*?):\s*(-?[\d.,]+\s*%?)$/);
    if (c) return [c[1], c[2]];
    return [line];
  }

  /**
   * @returns { labels, series: [{ name, values }], errors }
   */
  function parseChartData(text) {
    const rows = String(text || '')
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => splitRow(l).map((c) => c.trim()));
    const errors = [];
    if (!rows.length) return { labels: [], series: [], errors };
    let names = null;
    const first = rows[0];
    // Encabezado: primera celda vacía (p. ej. "; 2022; 2023") o nombres no numéricos.
    if (first.length > 1 && (first[0] === '' || first.slice(1).every((c) => parseNumber(c) === null))) {
      names = first.slice(1);
      rows.shift();
    }
    const nSeries = Math.max(1, ...rows.map((r) => r.length - 1));
    const series = [];
    for (let s = 0; s < nSeries; s++) series.push({ name: names && names[s] ? names[s] : nSeries > 1 ? `Serie ${s + 1}` : '', values: [] });
    const labels = [];
    rows.forEach((r, i) => {
      labels.push(r[0]);
      for (let s = 0; s < nSeries; s++) {
        const v = parseNumber(r[s + 1]);
        if (v === null && r[s + 1] !== undefined && r[s + 1] !== '') errors.push(`Fila ${i + 1}: "${r[s + 1]}" no es un número.`);
        series[s].values.push(v === null ? 0 : v);
      }
      if (r.length < 2) errors.push(`Fila ${i + 1}: falta el valor (use "Etiqueta; valor").`);
    });
    return { labels, series, errors };
  }

  /** Escala "bonita" para el eje: 0, 5, 10, 15… */
  function niceScale(min, max, ticks) {
    if (min === max) {
      max = max === 0 ? 1 : max * 1.2;
      min = Math.min(0, min);
    }
    const span = max - min;
    const raw = span / (ticks || 5);
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 5, 10].map((f) => f * mag).find((s) => s >= raw) || 10 * mag;
    const lo = Math.floor(min / step) * step;
    const hi = Math.ceil(max / step) * step;
    const out = [];
    for (let v = lo; v <= hi + step / 2; v += step) out.push(Math.round(v * 1e6) / 1e6);
    return { lo, hi, step, ticks: out };
  }

  function fmtNum(v) {
    const r = Math.round(v * 100) / 100;
    return String(r).replace('.', ',');
  }

  function patternDefs(id, bw) {
    let s = '';
    bw.forEach((b, i) => {
      if (b.hatch === undefined) return;
      const rot = b.hatch;
      s +=
        `<pattern id="${id}-p${i}" patternUnits="userSpaceOnUse" width="7" height="7" patternTransform="rotate(${rot})">` +
        `<rect width="7" height="7" fill="${b.fill}"/><line x1="0" y1="0" x2="0" y2="7" stroke="${b.ink}" stroke-width="2"/></pattern>`;
    });
    return s;
  }

  function fillFor(i, spec, id) {
    if (!spec.bw) return COLORS[i % COLORS.length];
    const b = BW[i % BW.length];
    return b.hatch === undefined ? b.fill : `url(#${id}-p${i % BW.length})`;
  }

  function strokeFor(i, spec) {
    return spec.bw ? ['#1f1f1f', '#555', '#1f1f1f', '#777'][i % 4] : COLORS[i % COLORS.length];
  }

  function marker(shape, x, y, r, fill) {
    const ring = 'stroke="#fff" stroke-width="2"';
    if (shape === 'square') return `<rect x="${n(x - r)}" y="${n(y - r)}" width="${n(2 * r)}" height="${n(2 * r)}" fill="${fill}" ${ring}/>`;
    if (shape === 'triangle') return `<path d="M${n(x)} ${n(y - r * 1.2)}L${n(x + r * 1.1)} ${n(y + r * 0.8)}L${n(x - r * 1.1)} ${n(y + r * 0.8)}Z" fill="${fill}" ${ring}/>`;
    if (shape === 'diamond') return `<path d="M${n(x)} ${n(y - r * 1.3)}L${n(x + r * 1.3)} ${n(y)}L${n(x)} ${n(y + r * 1.3)}L${n(x - r * 1.3)} ${n(y)}Z" fill="${fill}" ${ring}/>`;
    return `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="${fill}" ${ring}/>`;
  }

  function legend(series, spec, id, y) {
    if (series.length < 2) return { svg: '', h: 0 };
    let x = 0;
    const items = series.map((s, i) => {
      const w = 26 + s.name.length * 7.2 + 18;
      const item = { x, w, s, i };
      x += w;
      return item;
    });
    const startX = Math.max(10, (W - x) / 2);
    let out = '';
    for (const it of items) {
      const lx = startX + it.x;
      if (spec.type === 'line') {
        out += `<line x1="${n(lx)}" y1="${y}" x2="${n(lx + 20)}" y2="${y}" stroke="${strokeFor(it.i, spec)}" stroke-width="2.5" stroke-dasharray="${spec.bw ? LINE_DASH[it.i % 4] : ''}"/>`;
        out += marker(MARKERS[it.i % 4], lx + 10, y, 4, strokeFor(it.i, spec));
      } else {
        out += `<rect x="${n(lx)}" y="${y - 7}" width="18" height="14" rx="2" fill="${fillFor(it.i, spec, id)}" stroke="${spec.bw ? '#1f1f1f' : 'none'}" stroke-width="${spec.bw ? 0.8 : 0}"/>`;
      }
      out += `<text x="${n(lx + 26)}" y="${y + 5}" font-size="14" fill="${INK}">${esc(it.s.name)}</text>`;
    }
    return { svg: out, h: 28 };
  }

  /**
   * @param spec { type: 'column'|'bar'|'line'|'pie', title, xLabel, yLabel, data, showValues, bw }
   *             data: resultado de parseChartData o { labels, series }
   */
  function renderChartSVG(spec, idSeed) {
    const id = 'ch' + (idSeed || Math.random().toString(36).slice(2, 8));
    const data = spec.data && spec.data.labels ? spec.data : parseChartData(spec.data || '');
    const labels = data.labels || [];
    const series = (data.series || []).filter((s) => s.values.length);
    const type = spec.type || 'column';
    let y = 8;
    const parts = [];
    if (spec.title) {
      parts.push(`<text x="${W / 2}" y="${y + 18}" font-size="18" font-weight="bold" text-anchor="middle" fill="${INK}">${esc(spec.title)}</text>`);
      y += 30;
    }
    if (!labels.length || !series.length) {
      parts.push(`<text x="${W / 2}" y="${y + 40}" font-size="15" text-anchor="middle" fill="${MUTED}">Escriba los datos del gráfico</text>`);
      const H0 = y + 70;
      return wrap(parts.join(''), H0, id, spec);
    }

    if (type === 'pie') return wrap(parts.join('') + pieChart(labels, series[0], spec, id, y), y + 300, id, spec);

    const lg = legend(series, spec, id, y + 12);
    parts.push(lg.svg);
    y += lg.h;

    const all = [].concat(...series.map((s) => s.values));
    const sc = niceScale(Math.min(0, ...all), Math.max(0, ...all), 5);
    const horizontal = type === 'bar';
    const plotH = horizontal ? Math.max(160, labels.length * (series.length * 16 + 14)) : 260;
    const longest = Math.max(...labels.map((l) => String(l).length));
    const left = horizontal ? Math.min(210, 18 + longest * 7.4) + (spec.yLabel ? 0 : 0) : 58 + (spec.yLabel ? 22 : 0);
    const right = 24;
    const top = y + 10;
    const bottom = horizontal ? 36 + (spec.xLabel ? 24 : 0) : (longest > 9 ? 58 : 34) + (spec.xLabel ? 24 : 0);
    const plotW = W - left - right;
    const H = top + plotH + bottom;
    const val = (v) => (v - sc.lo) / (sc.hi - sc.lo);

    // Cuadrícula y eje de valores.
    for (const t of sc.ticks) {
      if (horizontal) {
        const x = left + val(t) * plotW;
        parts.push(`<line x1="${n(x)}" y1="${top}" x2="${n(x)}" y2="${top + plotH}" stroke="${t === 0 ? '#777' : GRID}" stroke-width="${t === 0 ? 1.2 : 0.8}"/>`);
        parts.push(`<text x="${n(x)}" y="${top + plotH + 18}" font-size="13" text-anchor="middle" fill="${MUTED}">${fmtNum(t)}</text>`);
      } else {
        const yy = top + plotH - val(t) * plotH;
        parts.push(`<line x1="${left}" y1="${n(yy)}" x2="${left + plotW}" y2="${n(yy)}" stroke="${t === 0 ? '#777' : GRID}" stroke-width="${t === 0 ? 1.2 : 0.8}"/>`);
        parts.push(`<text x="${left - 8}" y="${n(yy + 4.5)}" font-size="13" text-anchor="end" fill="${MUTED}">${fmtNum(t)}</text>`);
      }
    }
    if (spec.yLabel) {
      if (horizontal) parts.push(`<text x="${left + plotW / 2}" y="${H - 10}" font-size="14" text-anchor="middle" fill="${INK}">${esc(spec.yLabel)}</text>`);
      else parts.push(`<text transform="translate(16 ${top + plotH / 2}) rotate(-90)" font-size="14" text-anchor="middle" fill="${INK}">${esc(spec.yLabel)}</text>`);
    }
    if (spec.xLabel) {
      if (horizontal) parts.push(`<text x="12" y="${top - 8}" font-size="14" fill="${INK}">${esc(spec.xLabel)}</text>`);
      else parts.push(`<text x="${left + plotW / 2}" y="${H - 10}" font-size="14" text-anchor="middle" fill="${INK}">${esc(spec.xLabel)}</text>`);
    }

    const zero = val(Math.max(sc.lo, Math.min(0, sc.hi)));
    if (type === 'line') {
      const step = plotW / labels.length;
      labels.forEach((l, i) => {
        const x = left + step * (i + 0.5);
        parts.push(categoryLabel(l, x, top + plotH + 18, longest > 9));
      });
      const allPts = series.map((s) => s.values.map((v, i) => [left + step * (i + 0.5), top + plotH - val(v) * plotH]));
      series.forEach((s, si) => {
        const pts = allPts[si];
        parts.push(
          `<polyline points="${pts.map((p) => n(p[0]) + ',' + n(p[1])).join(' ')}" fill="none" stroke="${strokeFor(si, spec)}" stroke-width="2.5" ` +
            `stroke-linejoin="round" stroke-dasharray="${spec.bw ? LINE_DASH[si % 4] : ''}"/>`
        );
        pts.forEach((p) => parts.push(marker(spec.bw ? MARKERS[si % 4] : 'circle', p[0], p[1], 4.5, strokeFor(si, spec))));
      });
      if (spec.showValues) {
        // Etiquetas por categoría: si dos puntos quedan cerca, la del más bajo va debajo.
        labels.forEach((_, i) => {
          const col = series.map((s, si) => ({ y: allPts[si][i][1], x: allPts[si][i][0], v: s.values[i] })).sort((a, b) => a.y - b.y);
          let lastY = -Infinity;
          col.forEach((p, k) => {
            let ty = p.y - 10;
            if (k > 0 && ty - lastY < 14) ty = p.y + 19;
            lastY = ty;
            parts.push(`<text x="${n(p.x)}" y="${n(ty)}" font-size="12" text-anchor="middle" fill="${INK}">${fmtNum(p.v)}</text>`);
          });
        });
      }
      return wrap(parts.join(''), H, id, spec);
    }

    // Columnas o barras agrupadas (2 px de separación entre barras contiguas).
    const bandCount = labels.length;
    const band = (horizontal ? plotH : plotW) / bandCount;
    const groupW = band * 0.72;
    const gap = 2;
    const barW = (groupW - gap * (series.length - 1)) / series.length;
    labels.forEach((l, i) => {
      const c0 = (horizontal ? top : left) + band * i + (band - groupW) / 2;
      if (horizontal) {
        parts.push(`<text x="${left - 8}" y="${n(top + band * (i + 0.5) + 4.5)}" font-size="13" text-anchor="end" fill="${INK}">${esc(l)}</text>`);
      } else {
        parts.push(categoryLabel(l, left + band * (i + 0.5), top + plotH + 18, longest > 9));
      }
      series.forEach((s, si) => {
        const v = s.values[i];
        const from = Math.min(zero, val(v));
        const to = Math.max(zero, val(v));
        const fill = fillFor(si, spec, id);
        const outline = spec.bw ? ` stroke="#1f1f1f" stroke-width="0.8"` : '';
        if (horizontal) {
          const yy = c0 + si * (barW + gap);
          const x0 = left + from * plotW;
          const len = Math.max(0.5, (to - from) * plotW);
          parts.push(`<rect x="${n(x0)}" y="${n(yy)}" width="${n(len)}" height="${n(barW)}" rx="3" fill="${fill}"${outline}/>`);
          if (spec.showValues) {
            const tx = v >= 0 ? x0 + len + 5 : x0 - 5;
            parts.push(`<text x="${n(tx)}" y="${n(yy + barW / 2 + 4.5)}" font-size="12" text-anchor="${v >= 0 ? 'start' : 'end'}" fill="${INK}">${fmtNum(v)}</text>`);
          }
        } else {
          const xx = c0 + si * (barW + gap);
          const y0 = top + plotH - to * plotH;
          const len = Math.max(0.5, (to - from) * plotH);
          parts.push(`<rect x="${n(xx)}" y="${n(y0)}" width="${n(barW)}" height="${n(len)}" rx="3" fill="${fill}"${outline}/>`);
          if (spec.showValues) {
            const ty = v >= 0 ? y0 - 6 : y0 + len + 15;
            parts.push(`<text x="${n(xx + barW / 2)}" y="${n(ty)}" font-size="12" text-anchor="middle" fill="${INK}">${fmtNum(v)}</text>`);
          }
        }
      });
    });
    return wrap(parts.join(''), H, id, spec);
  }

  function categoryLabel(text, x, y, rotate) {
    if (rotate) {
      return `<text transform="translate(${n(x)} ${y - 6}) rotate(-35)" font-size="13" text-anchor="end" fill="${INK}">${esc(text)}</text>`;
    }
    return `<text x="${n(x)}" y="${y}" font-size="13" text-anchor="middle" fill="${INK}">${esc(text)}</text>`;
  }

  function pieChart(labels, s, spec, id, y) {
    const values = s.values.map((v) => Math.max(0, v));
    const total = values.reduce((a, b) => a + b, 0) || 1;
    const cx = 200;
    const cy = y + 140;
    const r = 120;
    let a0 = -Math.PI / 2;
    let out = '';
    values.forEach((v, i) => {
      const a1 = a0 + (v / total) * Math.PI * 2;
      const large = a1 - a0 > Math.PI ? 1 : 0;
      const p0 = [cx + r * Math.cos(a0), cy + r * Math.sin(a0)];
      const p1 = [cx + r * Math.cos(a1), cy + r * Math.sin(a1)];
      const fill = fillFor(i, spec, id);
      const path =
        values.filter((x) => x > 0).length === 1 && v > 0
          ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="#fff" stroke-width="2"/>`
          : `<path d="M${cx} ${cy}L${n(p0[0])} ${n(p0[1])}A${r} ${r} 0 ${large} 1 ${n(p1[0])} ${n(p1[1])}Z" fill="${fill}" stroke="#fff" stroke-width="2"/>`;
      if (v > 0) out += path;
      a0 = a1;
    });
    if (spec.bw) out += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#1f1f1f" stroke-width="0.8"/>`;
    // Leyenda con etiqueta, valor y porcentaje (la identidad no depende sólo del color).
    const lx = 360;
    let ly = cy - (labels.length * 26) / 2 + 10;
    labels.forEach((l, i) => {
      const pct = Math.round((values[i] / total) * 1000) / 10;
      out += `<rect x="${lx}" y="${n(ly - 8)}" width="18" height="16" rx="2" fill="${fillFor(i, spec, id)}" stroke="${spec.bw ? '#1f1f1f' : 'none'}" stroke-width="0.8"/>`;
      const txt = spec.showValues ? `${l}: ${fmtNum(values[i])} (${fmtNum(pct)}%)` : `${l}`;
      out += `<text x="${lx + 26}" y="${n(ly + 5)}" font-size="14" fill="${INK}">${esc(txt)}</text>`;
      ly += 26;
    });
    return out;
  }

  function wrap(body, H, id, spec) {
    const defs = spec.bw ? `<defs>${patternDefs(id, BW)}</defs>` : '';
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${n(H)}" width="100%" role="img" ` +
      `aria-label="${esc(spec.title || 'Gráfico')}" font-family="Arial, Helvetica, sans-serif" style="display:block">` +
      defs +
      body +
      '</svg>'
    );
  }

  const CHART_TYPES = {
    column: 'Columnas',
    bar: 'Barras horizontales',
    line: 'Líneas',
    pie: 'Circular',
  };

  return { renderChartSVG, parseChartData, parseNumber, niceScale, CHART_TYPES, COLORS };
});
