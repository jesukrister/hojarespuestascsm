/*
 * Evaluación imprimible a partir de texto pegado.
 *
 * `parseQuestions` ordena un texto copiado de cualquier lado (Word, PDF,
 * correo…) en preguntas con sus alternativas. `renderTestHTML` arma la
 * evaluación con membrete, campos del estudiante e instrucciones.
 *
 * Formatos reconocidos (entre otros):
 *   1. / 1) / 1.- / 1- / 1: / Pregunta 1: / N°1     → inicio de pregunta
 *   a) / A) / a. / A. / (a) / a- / [a]            → alternativa (varias en una línea también)
 *   *b) texto  ·  b) texto *  ·  b) texto (correcta) → alternativa correcta
 *   OA12 / [OA 12] / OA12: (en una línea sola)       → objetivo de las preguntas siguientes
 *   Clave: 1A 2C 3-b …  (al final)                   → respuestas correctas
 * Las líneas cortadas por el PDF se vuelven a unir, y un texto separado por
 * una línea en blanco antes de una pregunta queda como texto de esa pregunta
 * (por ejemplo, una lectura).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TestDoc = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const LETTERS = 'abcdef';
  const Q_START = /^\s*(\d{1,3})\s*(?:\.-|[.)\-:°º])+(?!\d)\s*(.*)$/;
  const Q_WORD = /^\s*(?:pregunta|preg\.?|ítem|item|n[°º]|nro\.?)\s*(\d{1,3})\s*[.)\-:]?\s*(.*)$/i;
  const OPT_START = /^\s*\*?\s*[([]?\s*([a-fA-F])\s*(?:\)|\]|\.(?!\d)|-(?!\d)|:)\s*(.*)$/;
  const OA_LINE = /^\s*[[(]?\s*(OA\s*-?\s*\d+[a-zA-Z]?)\s*[\])]?\s*:?\s*$/i;
  const KEY_LINE = /^\s*(clave|claves|respuestas?|solucionario|pauta|hoja de respuestas correctas)\s*:?\s*(.*)$/i;
  const CORRECT_MARK = /^\s*\*\s*|\s*\*\s*$|\s*\((?:correcta|correct[oa]?|x)\)\s*$|\s*[✓✔]\s*$/i;

  function clean(text) {
    return String(text || '')
      .replace(/\r\n?/g, '\n')
      .replace(/[\u00a0\u2007\u202f]/g, ' ')
      .replace(/\t/g, ' ')
      .replace(/[\u2010-\u2015]/g, '-')
      .replace(/^[ \t]*[•●▪◦·][ \t]*/gm, '')
      .replace(/[ ]{2,}/g, ' ');
  }

  /**
   * Separa una línea con varias alternativas: "a) Chile b) Perú c) Bolivia".
   * Sólo se separa si las letras aparecen en orden consecutivo con el mismo estilo.
   */
  function splitInlineOptions(line) {
    const re = /(^|\s)(?:\*\s*)?([([]?)([a-fA-F])(\)|\]|\.|-|:)\s+/g;
    const found = [];
    let m;
    while ((m = re.exec(line))) {
      found.push({ index: m.index + m[1].length, letter: m[3], style: m[2] + (m[4] === ']' ? ')' : m[4]) });
    }
    if (found.length < 2) return [line];
    let best = null;
    for (let i = 0; i < found.length; i++) {
      const chain = [found[i]];
      const lower = found[i].letter === found[i].letter.toLowerCase();
      for (let j = i + 1; j < found.length; j++) {
        const prev = chain[chain.length - 1];
        const f = found[j];
        if (f.style !== found[i].style || (f.letter === f.letter.toLowerCase()) !== lower) continue;
        if (f.letter.toLowerCase().charCodeAt(0) === prev.letter.toLowerCase().charCodeAt(0) + 1) chain.push(f);
      }
      if (chain.length >= 2 && (!best || chain.length > best.length)) best = chain;
    }
    // Con estilo "a." exigimos que la cadena empiece en "a" (evita cortar "vitamina A. Luego…").
    if (!best || (best[0].style === '.' && best[0].letter.toLowerCase() !== 'a')) return [line];
    const parts = [];
    const head = line.slice(0, best[0].index).trim();
    if (head) parts.push(head);
    for (let i = 0; i < best.length; i++) {
      const end = i + 1 < best.length ? best[i + 1].index : line.length;
      parts.push(line.slice(best[i].index, end).trim());
    }
    return parts;
  }

  /** Une líneas cortadas: mantiene el salto si la línea anterior termina una idea o la siguiente es un listado. */
  function joinLines(lines) {
    let out = '';
    for (const l of lines) {
      const t = l.trim();
      if (!t) {
        if (out && !out.endsWith('\n\n')) out += '\n\n';
        continue;
      }
      if (!out || out.endsWith('\n')) out += t;
      else if (/[.:;?!»"”)]$/.test(out) || /^(?:[IVX]{1,4}[.)]|[-–•]\s|\d+[.)]\s)/.test(t)) out += '\n' + t;
      else out += ' ' + t;
    }
    return out.trim();
  }

  function parseKeyLine(text, key) {
    const re = /(\d{1,3})\s*[.)\-:=]?\s*([a-fA-F])\b/g;
    let m;
    let n = 0;
    while ((m = re.exec(text))) {
      key[parseInt(m[1], 10)] = LETTERS.indexOf(m[2].toLowerCase());
      n++;
    }
    return n;
  }

  /**
   * @param text texto pegado
   * @param opts { sortByNumber: true } — ordenar por la numeración original si existe
   * @returns { questions: [{ number, stem, preamble, options: [texto], correct, oa }], warnings: [texto], numbered, intro }
   */
  function parseQuestions(text, opts) {
    opts = Object.assign({ sortByNumber: true }, opts || {});
    const rawLines = clean(text).split('\n');
    const lines = [];
    let keyMode = false;
    const keyByNumber = {};
    for (const raw of rawLines) {
      if (keyMode) {
        parseKeyLine(raw, keyByNumber);
        continue;
      }
      const km = raw.match(KEY_LINE);
      if (km && (parseKeyLine(km[2], keyByNumber) > 0 || !km[2].trim())) {
        keyMode = true;
        continue;
      }
      for (const part of splitInlineOptions(raw)) lines.push(part);
    }

    const questions = [];
    let cur = null;
    let pending = [];
    let blankSinceLast = false;
    let currentOA = null;

    const finish = () => {
      if (!cur) return;
      cur.stem = joinLines(cur.stemLines);
      cur.preamble = joinLines(cur.preambleLines);
      cur.options.sort((a, b) => a.letter - b.letter);
      cur.options = cur.options.map((o) => {
        let t = joinLines(o.lines);
        if (CORRECT_MARK.test(t) || o.marked) {
          cur.correct = cur.options.indexOf(o);
          t = t.replace(CORRECT_MARK, '').trim();
        }
        return t;
      });
      delete cur.stemLines;
      delete cur.preambleLines;
      questions.push(cur);
      cur = null;
    };

    let introLines = [];
    const newQuestion = (number, firstLine) => {
      finish();
      // El texto antes de la primera pregunta es una introducción general
      // (no se asocia a una pregunta, porque ésta podría cambiar de lugar).
      if (!questions.length && pending.some((x) => x.trim())) {
        introLines = pending;
        pending = [];
      }
      cur = {
        number,
        stemLines: firstLine ? [firstLine] : [],
        preambleLines: pending,
        options: [],
        correct: null,
        oa: currentOA,
      };
      pending = [];
    };

    for (const line of lines) {
      const t = line.trim();
      if (!t) {
        blankSinceLast = true;
        if (cur && cur.options.length === 0) cur.stemLines.push('');
        else if (pending.length) pending.push('');
        continue;
      }
      const oa = t.match(OA_LINE);
      if (oa) {
        currentOA = oa[1].replace(/\s+/g, '').replace(/-/g, '').toUpperCase();
        if (cur && cur.options.length) finish();
        blankSinceLast = false;
        continue;
      }

      let qm = t.match(Q_WORD) || t.match(Q_START);
      // "1990 fue…" no es una pregunta: se exige el separador tras el número (Q_START ya lo hace).
      const om = t.match(OPT_START);
      const isStrongOption = om && /^\s*\*?\s*[([]?\s*[a-fA-F]\s*[)\]]/.test(t);

      if (om && !qm) {
        const letter = LETTERS.indexOf(om[1].toLowerCase());
        const marked = /^\s*\*/.test(t);
        const hasPending = pending.some((x) => x.trim());
        const canStart = letter === 0 || isStrongOption;
        // ¿Empieza una pregunta sin número? (texto previo + nueva serie de alternativas)
        const startsNew =
          (!cur && hasPending && canStart) ||
          (cur && cur.options.length > 0 && hasPending && canStart) ||
          (cur && letter === 0 && cur.options.some((o) => o.letter === 0));
        if (startsNew) {
          const stem = pending;
          pending = [];
          finish();
          cur = { number: null, stemLines: stem, preambleLines: [], options: [{ letter, lines: [om[2]], marked }], correct: null, oa: currentOA };
          blankSinceLast = false;
          continue;
        }
        if (cur) {
          const used = cur.options.some((o) => o.letter === letter);
          const acceptable = !used && (letter === cur.options.length || (isStrongOption && letter < 6));
          if (acceptable) {
            if (cur.options.length === 0 && pending.length) {
              cur.stemLines.push(...pending);
              pending = [];
            }
            cur.options.push({ letter, lines: [om[2]], marked });
            blankSinceLast = false;
            continue;
          }
        }
      }
      if (qm && !(cur && cur.options.length === 0 && cur.stemLines.length === 0)) {
        newQuestion(parseInt(qm[1], 10), (qm[2] || '').trim());
        blankSinceLast = false;
        continue;
      }
      // Texto normal.
      if (cur && cur.options.length > 0) {
        // Tras una línea en blanco, el texto es para la pregunta siguiente
        // (una lectura o un enunciado sin número) y sigue acumulándose ahí.
        if (blankSinceLast || pending.some((x) => x.trim())) pending.push(t);
        else cur.options[cur.options.length - 1].lines.push(t);
      } else if (cur) {
        cur.stemLines.push(t);
      } else {
        pending.push(t);
      }
      blankSinceLast = false;
    }
    finish();

    // Preguntas sin número cuyo enunciado quedó en "pending" de la anterior:
    // ya se resolvió al crearlas. Texto sobrante al final:
    const warnings = [];
    const trailing = joinLines(pending);
    if (trailing) warnings.push(`Texto al final que no pertenece a ninguna pregunta: “${trailing.slice(0, 80)}${trailing.length > 80 ? '…' : ''}”.`);

    const numbered = questions.some((q) => q.number !== null);
    let ordered = questions;
    if (opts.sortByNumber && numbered && questions.every((q) => q.number !== null)) {
      ordered = questions.map((q, i) => ({ q, i })).sort((a, b) => a.q.number - b.q.number || a.i - b.i).map((x) => x.q);
      const nums = ordered.map((q) => q.number);
      const dups = nums.filter((n, i) => i > 0 && n === nums[i - 1]);
      if (dups.length) warnings.push(`Números de pregunta repetidos: ${Array.from(new Set(dups)).join(', ')}.`);
      const missing = [];
      for (let n = nums[0]; n <= nums[nums.length - 1]; n++) if (nums.indexOf(n) < 0) missing.push(n);
      if (missing.length && missing.length <= 20) warnings.push(`Faltan las preguntas número ${missing.join(', ')} en el texto pegado.`);
    }

    // Clave al final del texto (por número original).
    for (const q of ordered) {
      if (q.correct === null && q.number !== null && keyByNumber[q.number] !== undefined) {
        const k = keyByNumber[q.number];
        if (k < q.options.length) q.correct = k;
      }
    }

    const counts = {};
    for (const q of ordered) counts[q.options.length] = (counts[q.options.length] || 0) + 1;
    const usual = Number(Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0] || 0);
    ordered.forEach((q, i) => {
      const label = `Pregunta ${i + 1}${q.number !== null && q.number !== i + 1 ? ` (n° ${q.number} en el texto)` : ''}`;
      if (!q.stem) warnings.push(`${label}: no tiene enunciado.`);
      if (q.options.length < 2) warnings.push(`${label}: tiene ${q.options.length} alternativa(s).`);
      else if (q.options.length !== usual) warnings.push(`${label}: tiene ${q.options.length} alternativas y la mayoría tiene ${usual}.`);
      q.options.forEach((o, j) => {
        if (!o) warnings.push(`${label}: la alternativa ${LETTERS[j]} está vacía.`);
      });
    });
    return { questions: ordered, warnings, numbered, intro: joinLines(introLines) };
  }

  /* ------------------------------------------------------------------ */
  /* Evaluación imprimible                                                */
  /* ------------------------------------------------------------------ */

  const DEFAULT_FORMAT = {
    school: '',
    logo: '', // data URL
    subject: '',
    teacher: '',
    course: '',
    title: '',
    fields: { nombre: true, curso: true, fecha: true, rut: true, puntaje: true, nota: true },
    instructions:
      'Lee atentamente cada pregunta y marca la alternativa correcta en tu hoja de respuestas. Usa lápiz grafito o pasta oscura. Tienes una sola oportunidad de marcar por pregunta.',
    fontFamily: 'Arial',
    fontSize: 12,
    columns: 1,
    letterStyle: 'a)',
    optionsLayout: 'auto',
    showOA: false,
    paper: 'carta',
  };

  const FONTS = {
    Arial: 'Arial, Helvetica, sans-serif',
    Calibri: 'Calibri, Carlito, "Segoe UI", Arial, sans-serif',
    Verdana: 'Verdana, Geneva, sans-serif',
    'Times New Roman': '"Times New Roman", Times, serif',
    Georgia: 'Georgia, "Times New Roman", serif',
    'Century Gothic': '"Century Gothic", "URW Gothic", Futura, sans-serif',
    'Comic Sans MS': '"Comic Sans MS", "Comic Neue", cursive',
  };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function paragraphs(text) {
    return esc(text)
      .split(/\n{2,}/)
      .map((p) => p.replace(/\n/g, '<br>'))
      .join('</p><p>');
  }

  function letterLabel(i, style) {
    const l = LETTERS[i];
    switch (style) {
      case 'A)':
        return l.toUpperCase() + ')';
      case 'A.':
        return l.toUpperCase() + '.';
      case '(a)':
        return '(' + l + ')';
      default:
        return l + ')';
    }
  }

  /**
   * @param questions resultado de parseQuestions(...).questions
   * @param fmt ver DEFAULT_FORMAT
   * @param info { maxScore, intro } — puntaje máximo y texto introductorio
   */
  function renderTestHTML(questions, fmt, info) {
    const f = Object.assign({}, DEFAULT_FORMAT, fmt || {});
    f.fields = Object.assign({}, DEFAULT_FORMAT.fields, (fmt && fmt.fields) || {});
    info = info || {};
    const out = [];
    const font = FONTS[f.fontFamily] || FONTS.Arial;
    out.push(`<article class="testdoc" style="font-family:${esc(font)};font-size:${Number(f.fontSize) || 12}pt">`);

    // Membrete.
    const meta = [f.subject && `Asignatura: ${f.subject}`, f.teacher && `Profesor(a): ${f.teacher}`, f.course && `Curso: ${f.course}`].filter(Boolean);
    out.push('<header class="td-head">');
    if (f.logo) out.push(`<img class="td-logo" src="${esc(f.logo)}" alt="">`);
    out.push('<div class="td-head-text">');
    if (f.school) out.push(`<div class="td-school">${esc(f.school)}</div>`);
    if (meta.length) out.push(`<div class="td-meta">${meta.map(esc).join(' &nbsp;·&nbsp; ')}</div>`);
    out.push('</div></header>');
    out.push(`<h1 class="td-title">${esc(f.title || 'Evaluación')}</h1>`);

    // Campos del estudiante.
    const fl = f.fields;
    const cells = [];
    if (fl.nombre) cells.push({ label: 'Nombre', wide: true });
    if (fl.curso) cells.push({ label: 'Curso' });
    if (fl.fecha) cells.push({ label: 'Fecha' });
    if (fl.rut) cells.push({ label: 'RUT' });
    if (fl.puntaje) cells.push({ label: 'Puntaje', suffix: info.maxScore ? ` / ${info.maxScore}` : '' });
    if (fl.nota) cells.push({ label: 'Nota' });
    if (cells.length) {
      out.push('<div class="td-fields">');
      for (const c of cells) {
        out.push(
          `<div class="td-field${c.wide ? ' wide' : ''}"><span>${esc(c.label)}:</span><i></i>${c.suffix ? `<span class="td-suffix">${esc(c.suffix)}</span>` : ''}</div>`
        );
      }
      out.push('</div>');
    }
    if (f.instructions) out.push(`<div class="td-instr"><strong>Instrucciones:</strong> ${esc(f.instructions)}</div>`);
    if (info.intro) out.push(`<div class="td-intro"><p>${paragraphs(info.intro)}</p></div>`);

    // Preguntas.
    out.push(`<div class="td-questions${Number(f.columns) === 2 ? ' two-cols' : ''}">`);
    questions.forEach((q, i) => {
      out.push('<section class="td-q">');
      if (q.preamble) out.push(`<div class="td-pre"><p>${paragraphs(q.preamble)}</p></div>`);
      const oa = f.showOA && q.oa ? ` <span class="td-oa">(${esc(q.oa)})</span>` : '';
      out.push(`<div class="td-stem"><span class="td-num">${i + 1}.</span><div><p>${paragraphs(q.stem)}${oa}</p></div></div>`);
      const maxLen = Math.max(0, ...q.options.map((o) => o.length));
      let layout = f.optionsLayout;
      if (layout === 'auto') layout = maxLen <= 18 && q.options.length >= 3 ? 'row' : maxLen <= 40 ? 'grid' : 'list';
      out.push(`<ol class="td-opts ${layout}">`);
      q.options.forEach((o, j) => {
        out.push(`<li><span class="td-letter">${esc(letterLabel(j, f.letterStyle))}</span><span>${esc(o)}</span></li>`);
      });
      out.push('</ol></section>');
    });
    out.push('</div></article>');
    return out.join('');
  }

  /** Estilos de la evaluación (vista previa e impresión). */
  const TEST_CSS = `
.testdoc { color: #000; line-height: 1.35; }
.testdoc p { margin: 0 0 0.35em; }
.td-head { display: flex; align-items: center; gap: 4mm; border-bottom: 0.4mm solid #000; padding-bottom: 2mm; margin-bottom: 3mm; }
.td-logo { max-height: 18mm; max-width: 35mm; object-fit: contain; }
.td-school { font-weight: bold; font-size: 1.1em; }
.td-meta { font-size: 0.9em; }
.td-title { text-align: center; font-size: 1.3em; margin: 2mm 0 3mm; }
.td-fields { display: flex; flex-wrap: wrap; gap: 2.5mm 6mm; margin-bottom: 3mm; font-size: 0.95em; }
.td-field { display: flex; align-items: flex-end; gap: 1.5mm; flex: 1 1 28%; min-width: 30mm; }
.td-field.wide { flex-basis: 100%; }
.td-field i { flex: 1; border-bottom: 0.25mm solid #000; height: 1em; }
.td-suffix { white-space: nowrap; }
.td-intro { margin-bottom: 4mm; }
.td-instr { border: 0.3mm solid #000; padding: 2mm 3mm; margin-bottom: 4mm; font-size: 0.92em; }
.td-questions.two-cols { column-count: 2; column-gap: 8mm; column-rule: 0.2mm solid #bbb; }
.td-q { break-inside: avoid; page-break-inside: avoid; margin-bottom: 4mm; }
.td-pre { border-left: 0.6mm solid #999; padding-left: 3mm; margin-bottom: 2mm; font-style: normal; }
.td-stem { display: flex; gap: 2mm; }
.td-num { font-weight: bold; min-width: 6mm; }
.td-oa { color: #555; font-size: 0.85em; }
.td-opts { list-style: none; margin: 1.5mm 0 0 8mm; padding: 0; }
.td-opts li { display: flex; gap: 2mm; margin: 0.6mm 0; break-inside: avoid; }
.td-letter { min-width: 6mm; }
.td-opts.row { display: flex; flex-wrap: wrap; gap: 0 8mm; }
.td-opts.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 6mm; }
`;

  return { parseQuestions, renderTestHTML, DEFAULT_FORMAT, FONTS, TEST_CSS, splitInlineOptions };
});
