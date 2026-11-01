/*
 * Versión Pro · Retroalimentación (sin pantalla, para probarla aparte):
 *  - rúbricas de las preguntas de desarrollo (criterios × niveles de logro);
 *  - preguntas del estudiante en el orden de SU hoja (fila o versión PIE),
 *    con el enunciado y las alternativas de la evaluación;
 *  - informe PDF de cada estudiante y hojas del Excel de evidencias.
 */
(function (root, factory) {
  const pdf = root && root.PdfCore ? root.PdfCore : typeof require === 'function' ? require('./pdf-core.js') : null;
  const api = factory(pdf);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RetroCore = api;
})(typeof self !== 'undefined' ? self : this, function (Pdf) {
  'use strict';

  const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
  const MAX_LEVELS = 6;
  const MAX_CRITERIA = 12;
  const clip = (s, n) => String(s == null ? '' : s).slice(0, n);

  /* ------------------------------------------------------------------ */
  /* Rúbricas                                                            */
  /* ------------------------------------------------------------------ */

  /**
   * Rúbrica: { levels: [{ name, points }], criteria: [{ name, descs: [texto por nivel] }] }.
   * Todos los criterios usan los mismos niveles. Devuelve null si no es válida.
   */
  function normalizeRubric(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const levels = (Array.isArray(raw.levels) ? raw.levels : []).slice(0, MAX_LEVELS).map((l) => {
      const p = Number(l && l.points);
      return { name: clip(l && l.name, 60).trim(), points: Number.isFinite(p) ? Math.max(0, Math.min(100, Math.round(p * 10) / 10)) : 0 };
    });
    if (!levels.length) return null;
    const criteria = (Array.isArray(raw.criteria) ? raw.criteria : []).slice(0, MAX_CRITERIA).map((c) => ({
      name: clip(c && c.name, 200).trim(),
      descs: levels.map((_, i) => clip(c && Array.isArray(c.descs) ? c.descs[i] : '', 600)),
    }));
    if (!criteria.length) return null;
    return { levels, criteria };
  }

  /** Rúbrica inicial: un criterio y tres niveles (el máximo vale lo mismo que la pregunta). */
  function defaultRubric(max) {
    const m = Math.max(1, Math.round(max || 4));
    return {
      levels: [
        { name: 'Logrado', points: m },
        { name: 'Medianamente logrado', points: Math.round(m / 2) },
        { name: 'Por lograr', points: 0 },
      ],
      criteria: [{ name: '', descs: ['', '', ''] }],
    };
  }

  /** Puntaje máximo de la rúbrica: el nivel más alto en cada criterio. */
  function rubricMax(rub) {
    return Math.max(0, ...rub.levels.map((l) => l.points)) * rub.criteria.length;
  }

  /**
   * Puntaje con los niveles elegidos (picks[i] = índice del nivel del criterio i).
   * Si la rúbrica no suma lo mismo que la pregunta (max), se lleva a su escala
   * redondeando. Devuelve { raw, total, complete, chosen, points, converted }.
   */
  function rubricScore(rub, picks, max) {
    const total = rubricMax(rub);
    let raw = 0;
    let chosen = 0;
    rub.criteria.forEach((_, i) => {
      const k = picks && picks[i];
      if (Number.isInteger(k) && k >= 0 && k < rub.levels.length) {
        raw += rub.levels[k].points;
        chosen++;
      }
    });
    const converted = !!max && total > 0 && total !== max;
    let points = converted ? Math.floor((raw * max) / total + 0.5 + 1e-9) : raw;
    if (max) points = Math.min(max, Math.max(0, Math.round(points)));
    return { raw: Math.round(raw * 10) / 10, total, complete: chosen === rub.criteria.length, chosen, points, converted };
  }

  /**
   * Rúbrica desde una tabla copiada de Excel, Word o Google Docs (columnas
   * separadas por tabulador). Primera fila: «Criterio» y los niveles, con su
   * puntaje entre paréntesis o al final («Logrado (3)», «Logrado 3 pts»); si no
   * traen puntaje se asignan de mayor a menor. Primera columna: los criterios.
   */
  function parseRubricTable(text) {
    const rows = String(text || '')
      .replace(/\r/g, '')
      .split('\n')
      .map((l) => l.split('\t').map((s) => s.trim()))
      .filter((r) => r.some(Boolean));
    if (rows.length < 2) return null;
    const width = Math.max(...rows.map((r) => r.length));
    if (width < 2) return null;
    const head = rows[0].slice(1, width);
    const parsed = head.map((h) => {
      const m = /^(.*?)[\s:(\-–]*(\d+(?:[.,]\d+)?)\s*(?:pts?\.?|puntos?|ptos?\.?)?\s*\)?\s*$/i.exec(h);
      return m ? { name: m[1].trim() || h, points: parseFloat(m[2].replace(',', '.')) } : { name: h, points: null };
    });
    const missing = parsed.some((p) => p.points === null);
    const levels = parsed.map((p, i) => ({ name: p.name || `Nivel ${i + 1}`, points: missing ? parsed.length - 1 - i : p.points }));
    const criteria = rows.slice(1).map((r) => ({ name: r[0] || '', descs: levels.map((_, i) => r[i + 1] || '') }));
    return normalizeRubric({ levels, criteria });
  }

  /** «Criterio: Nivel (pts)» por cada criterio elegido (para el Excel). */
  function rubricSummary(rub, picks) {
    return rub.criteria
      .map((c, i) => {
        const k = picks && picks[i];
        const lv = Number.isInteger(k) ? rub.levels[k] : null;
        return `${c.name || `Criterio ${i + 1}`}: ${lv ? `${lv.name} (${fmtNum(lv.points)})` : 'sin evaluar'}`;
      })
      .join(' · ');
  }

  /** Retroalimentación guardada en un resultado: { general, dev: [{ comment, picks }] }. */
  function normalizeFeedback(raw, nDev) {
    const f = raw && typeof raw === 'object' ? raw : {};
    return {
      general: clip(f.general, 4000),
      dev: Array.from({ length: nDev }, (_, i) => {
        const d = Array.isArray(f.dev) ? f.dev[i] : null;
        return {
          comment: clip(d && d.comment, 4000),
          picks: Array.isArray(d && d.picks) ? d.picks.map((k) => (Number.isInteger(k) ? k : null)) : [],
        };
      }),
    };
  }

  /* ------------------------------------------------------------------ */
  /* Preguntas del estudiante                                            */
  /* ------------------------------------------------------------------ */

  /** Fórmulas escritas en LaTeX ($…$) como texto simple. */
  function plainMath(text) {
    return String(text || '').replace(/\$\$?([^$]+)\$\$?/g, (_, tex) =>
      tex
        .replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, (_, a, b) => `${/^[\w.,]+$/.test(a.trim()) ? a.trim() : `(${a})`}/${/^[\w.,]+$/.test(b.trim()) ? b.trim() : `(${b})`}`)
        .replace(/\\sqrt\s*\{([^{}]*)\}/g, 'raíz de ($1)')
        .replace(/\\cdot/g, '·')
        .replace(/\\times/g, '×')
        .replace(/\\div/g, '÷')
        .replace(/\\le(q)?/g, '<=')
        .replace(/\\ge(q)?/g, '>=')
        .replace(/\\neq/g, '!=')
        .replace(/\\pi/g, 'pi')
        .replace(/\\degree|\^\{?\\circ\}?/g, '°')
        .replace(/\\left|\\right/g, '')
        .replace(/\\[a-zA-Z]+/g, '')
        .replace(/[{}]/g, '')
        .trim()
    );
  }

  /**
   * Preguntas en el orden de la hoja del estudiante.
   *  items: corrección del resultado (marked y key en las letras de SU hoja)
   *  map:   mapa de su fila o versión PIE ({ order, perms }) o null
   *  mc:    preguntas de alternativas de la evaluación (fila A), o null si no hay
   *  objectives: [{ name, questions: [índices de la fila A] }]
   */
  function reportQuestions(items, map, mc, objectives) {
    return items.map((it, j) => {
      const q = map ? map.order[j] : j;
      const perm = map ? map.perms[j] : null;
      const src = mc && mc[q];
      let options = [];
      if (src && Array.isArray(src.options)) {
        const canon = perm || src.options.map((_, k) => k);
        options = canon.map((k, c) => ({ letter: LETTERS[c], text: src.options[k] })).filter((o) => o.text != null && o.text !== '');
      }
      return {
        n: j + 1,
        canon: q + 1,
        marked: it.marked.map((k) => LETTERS[k]).join('+'),
        markedIdx: it.marked.slice(),
        key: it.key === null || it.key === undefined ? null : LETTERS[it.key],
        keyIdx: it.key === null || it.key === undefined ? null : it.key,
        status: it.status,
        stem: src ? plainMath(src.stem) : null,
        options: options.map((o) => ({ letter: o.letter, text: plainMath(o.text) })),
        oa: (objectives || [])
          .filter((o) => o.questions.indexOf(q) >= 0)
          .map((o) => o.name)
          .join(', '),
      };
    });
  }

  const STATUS_TEXT = {
    correct: 'Correcta',
    wrong: 'Incorrecta',
    multiple: 'Doble marca',
    blank: 'Omitida',
    excluded: 'No se considera',
  };

  function fmtNum(v, d) {
    if (v === null || v === undefined || !Number.isFinite(v)) return '–';
    const k = d === undefined ? (Math.round(v) === v ? 0 : 1) : d;
    return v.toFixed(k).replace('.', ',');
  }

  /* ------------------------------------------------------------------ */
  /* Informe PDF del estudiante                                          */
  /* ------------------------------------------------------------------ */

  const C = {
    navy: '#1f4e79',
    deep: '#0e2a45',
    text: '#1c2430',
    muted: '#5d6877',
    ok: '#1e8e3e',
    okSoft: '#e4f4e8',
    bad: '#c62828',
    badSoft: '#fbe9e9',
    warn: '#b26a00',
    warnSoft: '#fff4e0',
    soft: '#eef3f8',
  };
  const LEVEL_FILL = { L: '#c8e6c9', ML: '#fff0b3', NL: '#f8c9c9' };

  /**
   * data: { title, subtitle, school, teacher, date, student: { name, code, form, pie },
   *   summary: { grade, pass, failed, score, maxScore, percent, correct, wrong, blank, multiple },
   *   oa: [{ name, percent, level, levelLabel }], questions: reportQuestions(…),
   *   dev: [{ label, points, max, scored, rubric, picks, comment }], general, sheetJpeg }
   * Devuelve los bytes del PDF.
   */
  function buildStudentPdf(data) {
    const doc = new Pdf.Doc({ width: 612, height: 792, info: { title: `${data.title || 'Prueba'} · ${data.student.name || ''}`, author: data.teacher || '' } });
    const who = data.student.name || (data.student.code ? `N° ${data.student.code}` : 'Estudiante');
    const flow = new Pdf.Flow(doc, {
      margin: 42,
      onPage(f) {
        if (doc.pages.length > 1) {
          doc.text(f.margin, 22, `${data.title || 'Prueba'} · ${who}`, { size: 8, color: C.muted });
          f.y = 42;
        }
      },
    });
    const W = flow.width;
    const M = flow.margin;

    // Encabezado.
    if (data.school) flow.para(data.school, { size: 9, color: C.muted, after: 0 });
    flow.para('INFORME DE RESULTADOS', { size: 9, bold: true, color: C.navy, after: 2 });
    flow.para(data.title || 'Prueba', { size: 18, bold: true, color: C.deep, after: 0 });
    if (data.subtitle) flow.para(data.subtitle, { size: 11, color: C.muted, after: 0 });
    flow.space(6);

    // Datos del estudiante.
    const info = [
      ['Estudiante', data.student.name || '—'],
      ['N° de lista', data.student.code || '—'],
    ];
    if (data.student.form) info.push(['Fila', data.student.form]);
    if (data.student.pie) info.push(['Versión', 'Adecuada (PIE)']);
    if (data.date) info.push(['Fecha', data.date]);
    if (data.teacher) info.push(['Profesor(a)', data.teacher]);
    const half = Math.ceil(info.length / 2);
    const infoRows = [];
    for (let i = 0; i < half; i++) {
      const a = info[i];
      const b = info[i + half];
      infoRows.push([{ text: a[0], bold: true, color: C.muted }, a[1], b ? { text: b[0], bold: true, color: C.muted } : '', b ? b[1] : '']);
    }
    flow.table([{ width: 1 }, { width: 2.2 }, { width: 1 }, { width: 2.2 }], infoRows, { border: false, size: 10 });

    // Resumen: nota y puntaje.
    const s = data.summary;
    const boxes = [
      { label: 'Nota', value: fmtNum(s.grade, 1), color: s.failed ? C.bad : C.ok, big: true },
      { label: 'Puntaje', value: `${fmtNum(s.score)} de ${fmtNum(s.maxScore)}` },
      { label: 'Logro', value: `${fmtNum(s.percent, 0)} %` },
      { label: 'Correctas', value: String(s.correct), color: C.ok },
      { label: 'Incorrectas', value: String(s.wrong + (s.multiple || 0)), color: C.bad },
      { label: 'Omitidas', value: String(s.blank), color: C.warn },
    ];
    flow.ensure(64);
    const gap = 6;
    const bw = (W - gap * (boxes.length - 1)) / boxes.length;
    boxes.forEach((b, i) => {
      const x = M + i * (bw + gap);
      doc.rect(x, flow.y, bw, 52, { fill: b.big ? (s.failed ? C.badSoft : C.okSoft) : C.soft });
      const size = b.big ? 22 : 13;
      const tw = Pdf.textWidth(b.value, size, true);
      doc.text(x + (bw - Math.min(tw, bw - 4)) / 2, flow.y + (b.big ? 6 : 12), b.value, { size, bold: true, color: b.color || C.deep });
      const lw = Pdf.textWidth(b.label, 8, false);
      doc.text(x + (bw - lw) / 2, flow.y + 38, b.label, { size: 8, color: C.muted });
    });
    flow.space(62);

    // Logro por objetivo de aprendizaje.
    if (data.oa && data.oa.length) {
      flow.heading('Logro por objetivo de aprendizaje');
      flow.table(
        [{ width: 4 }, { width: 1, align: 'center' }, { width: 2, align: 'center' }],
        data.oa.map((o) => [o.name, { text: o.percent === null ? '—' : `${fmtNum(o.percent, 0)} %`, fill: LEVEL_FILL[o.level] }, { text: o.levelLabel || '—', fill: LEVEL_FILL[o.level] }]),
        { header: ['Objetivo', 'Logro', 'Nivel'], size: 9.5, zebra: true }
      );
    }

    // Todas las respuestas, en columnas para que ocupe poco.
    const qs = data.questions || [];
    if (qs.length) {
      flow.heading('Tus respuestas');
      const groups = qs.length > 40 ? 3 : qs.length > 12 ? 2 : 1;
      const per = Math.ceil(qs.length / groups);
      const cols = [];
      const header = [];
      for (let g = 0; g < groups; g++) {
        cols.push({ width: 0.7, align: 'center' }, { width: 1, align: 'center' }, { width: 1, align: 'center' }, { width: 1.7 });
        header.push('N°', 'Tu resp.', 'Correcta', 'Resultado');
      }
      const rows = [];
      for (let i = 0; i < per; i++) {
        const row = [];
        for (let g = 0; g < groups; g++) {
          const q = qs[g * per + i];
          if (!q) {
            row.push('', '', '', '');
            continue;
          }
          const good = q.status === 'correct';
          const badSt = q.status === 'wrong' || q.status === 'multiple';
          row.push(
            { text: String(q.n), bold: true },
            { text: q.marked || '—', color: badSt ? C.bad : good ? C.ok : C.muted, bold: true },
            { text: q.key || '—' },
            {
              text: STATUS_TEXT[q.status] || '',
              symbol: good ? 'check' : badSt ? 'cross' : null,
              color: good ? C.ok : badSt ? C.bad : q.status === 'blank' ? C.warn : C.muted,
              fill: good ? null : badSt ? C.badSoft : q.status === 'blank' ? C.warnSoft : null,
            }
          );
        }
        rows.push(row);
      }
      flow.table(cols, rows, { header, size: groups === 3 ? 8 : 9 });
    }

    // Preguntas a revisar, con enunciado y alternativas.
    const review = qs.filter((q) => (q.status === 'wrong' || q.status === 'multiple' || q.status === 'blank') && q.stem);
    if (review.length) {
      flow.heading('Preguntas para revisar');
      flow.para('En verde está la respuesta correcta; en rojo, la que marcaste.', { size: 9, color: C.muted });
      for (const q of review) {
        // Cada pregunta va completa en una página (si cabe).
        const lineH = 10 * 1.32;
        let lines = 2 + Pdf.wrap(q.stem, 10, false, W).length;
        for (const o of q.options) lines += Pdf.wrap(`${o.letter}) ${o.text} — respuesta correcta`, 9.5, true, W - 18).length + 0.6;
        if (q.status === 'blank' || q.status === 'multiple') lines += 1.5;
        flow.ensure(Math.min(lines * lineH + 16, 600));
        flow.para(`Pregunta ${q.n}${q.oa ? ` · ${q.oa}` : ''}`, { size: 10.5, bold: true, color: C.deep, after: 1 });
        flow.para(q.stem, { size: 10, after: 3 });
        for (const o of q.options) {
          const idx = LETTERS.indexOf(o.letter);
          const isKey = q.keyIdx === idx;
          const isMine = q.markedIdx.indexOf(idx) >= 0;
          const tag = isKey && isMine ? ' — tu respuesta, correcta' : isKey ? ' — respuesta correcta' : isMine ? ' — tu respuesta' : '';
          flow.para(`${o.letter}) ${o.text}${tag}`, {
            size: 9.5,
            indent: 12,
            bold: isKey || isMine,
            color: isKey ? C.ok : isMine ? C.bad : C.text,
            fill: isKey ? C.okSoft : isMine ? C.badSoft : null,
            padding: 3,
            after: 1,
          });
        }
        if (q.status === 'blank') flow.para('No respondiste esta pregunta.', { size: 9, color: C.warn, indent: 12 });
        if (q.status === 'multiple') flow.para('Marcaste más de una alternativa: la pregunta no se cuenta como correcta.', { size: 9, color: C.bad, indent: 12 });
        flow.space(6);
      }
    }

    // Desarrollo: puntaje, rúbrica y comentarios.
    const dev = data.dev || [];
    if (dev.length) {
      flow.heading('Preguntas de desarrollo');
      for (const d of dev) {
        flow.ensure(60);
        flow.para(`${d.label} · ${d.scored ? `${fmtNum(d.points)} de ${fmtNum(d.max)} puntos` : `sin puntaje (máximo ${fmtNum(d.max)})`}`, {
          size: 11,
          bold: true,
          color: C.deep,
          after: 3,
        });
        if (d.rubric) {
          const rub = d.rubric;
          const sc = rubricScore(rub, d.picks, d.max);
          const header = ['Criterio'].concat(rub.levels.map((l) => `${l.name} (${fmtNum(l.points)} ${l.points === 1 ? 'pt' : 'pts'})`));
          const rows = rub.criteria.map((c, i) => {
            const pick = d.picks && d.picks[i];
            return [{ text: c.name || `Criterio ${i + 1}`, bold: true }].concat(
              rub.levels.map((_, k) => {
                const sel = pick === k;
                return { text: c.descs[k] || (sel ? 'Nivel obtenido' : ''), fill: sel ? '#c8e6c9' : null, bold: sel, symbol: sel ? 'check' : null, color: sel ? '#14532d' : C.text, symbolColor: C.ok };
              })
            );
          });
          flow.table([{ width: 1.3 }].concat(rub.levels.map(() => ({ width: 1.6 }))), rows, { header, size: 8.5 });
          if (sc.chosen) {
            flow.para(
              sc.converted
                ? `Rúbrica: ${fmtNum(sc.raw)} de ${fmtNum(sc.total)} puntos, que equivalen a ${fmtNum(sc.points)} de ${fmtNum(d.max)} en esta pregunta.`
                : `Rúbrica: ${fmtNum(sc.raw)} de ${fmtNum(sc.total)} puntos.`,
              { size: 9, color: C.muted }
            );
          }
        }
        if (d.comment) flow.para(`Comentario: ${d.comment}`, { size: 10, fill: C.warnSoft, padding: 6, after: 6 });
        flow.space(4);
      }
    }

    if (data.general) {
      flow.heading('Comentario del profesor');
      flow.para(data.general, { size: 10.5, fill: C.soft, padding: 7 });
    }

    // Hoja corregida (imagen) en una página aparte.
    if (data.sheetJpeg) {
      flow.newPage();
      flow.heading('Tu hoja de respuestas corregida', { before: 0 });
      flow.image(data.sheetJpeg);
    }

    // Pie de página: número de página.
    const total = doc.pages.length;
    for (let i = 0; i < total; i++) {
      doc.cur = i;
      const t = `Página ${i + 1} de ${total}`;
      doc.text(doc.width - M - Pdf.textWidth(t, 8, false), doc.height - 28, t, { size: 8, color: C.muted });
    }
    return doc.output();
  }

  return {
    LETTERS,
    STATUS_TEXT,
    normalizeRubric,
    defaultRubric,
    rubricMax,
    rubricScore,
    parseRubricTable,
    rubricSummary,
    normalizeFeedback,
    plainMath,
    reportQuestions,
    buildStudentPdf,
    fmtNum,
  };
});
