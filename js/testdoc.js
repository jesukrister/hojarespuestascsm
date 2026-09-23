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
 *   Clave: 1A 2C 3-b 4V …  (al final)               → respuestas correctas
 *   I. Selección múltiple / II. Verdadero o falso / III. Desarrollo → ítems (tipo de pregunta)
 *   ____ 1. Afirmación (F)  ·  ( ) Afirmación           → verdadero o falso (con su respuesta)
 *   Pregunta sin alternativas [8 líneas] / [recuadro 10] → desarrollo (con su espacio)
 * Las líneas cortadas por el PDF se vuelven a unir, y un texto separado por
 * una línea en blanco antes de una pregunta queda como texto de esa pregunta
 * (por ejemplo, una lectura).
 */
(function (root, factory) {
  const charts = root && root.Charts ? root.Charts : typeof require === 'function' ? require('./charts.js') : null;
  const api = factory(charts);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TestDoc = api;
})(typeof self !== 'undefined' ? self : this, function (Charts) {
  'use strict';

  const LETTERS = 'abcdef';
  const Q_START = /^\s*(\d{1,3})\s*(?:\.-|[.)\-:°º])+(?!\d)\s*(.*)$/;
  const Q_WORD = /^\s*(?:pregunta|preg\.?|ítem|item|n[°º]|nro\.?)\s*(\d{1,3})\s*[.)\-:]?\s*(.*)$/i;
  const OPT_START = /^\s*\*?\s*[([]?\s*([a-fA-F])\s*(?:\)|\]|\.(?!\d)|-(?!\d)|:)\s*(.*)$/;
  const OA_LINE = /^\s*[[(]?\s*(OA\s*-?\s*\d+[a-zA-Z]?)\s*[\])]?\s*:?\s*$/i;
  const KEY_LINE = /^\s*(clave|claves|respuestas?|solucionario|pauta|hoja de respuestas correctas)\s*:?\s*(.*)$/i;
  const CORRECT_MARK = /^\s*\*\s*|\s*\*\s*$|\s*\((?:correcta|correct[oa]?|x)\)\s*$|\s*[✓✔]\s*$/i;
  // Encabezado de ítem: "II. Verdadero o falso: Justifica las falsas." · "Ítem 3 - Desarrollo (12 pts)"
  const SECTION_LINE = new RegExp(
    '^\\s*((?:(?:[íi]tem|parte|secci[óo]n)\\s*(?:[IVX]{1,4}|\\d{1,2})?|[IVX]{1,4})?\\s*[.):\\-–]?\\s*' +
      '(selecci[óo]n\\s+m[úu]ltiple|alternativas|verdadero\\s*(?:o|y|/)\\s*falso|v\\s*(?:o|/)\\s*f|desarrollo|' +
      'preguntas?\\s+(?:abiertas?|de\\s+desarrollo)|respuestas?\\s+(?:abiertas?|breves?|cortas?)))' +
      '\\s*(?:([.:\\-–])\\s*(.*)|(\\(.*\\)))?\\s*$',
    'i'
  );
  // Marca de verdadero o falso al inicio: "____", "( )", "[ ]".
  const TF_LEAD = /^\s*(?:_{2,}|\(\s*_*\s*\)|\[\s*\])\s*/;
  // Respuesta indicada al final: "(V)", "(F)", "(verdadero)".
  const TF_ANSWER = /\s*\(\s*(v|f|verdadero|falso)\s*\)\s*$/i;
  const TF_SUFFIX = /\s*\(?\s*V\s*[\/–-]\s*F\s*\)?\s*$/;
  // Espacio para responder: "[8 líneas]", "[recuadro 10]", "[espacio 6]".
  const SPACE_MARK = /\s*\[\s*(?:(\d{1,2})\s*l[íi]neas?|(recuadro|cuadro|en blanco|blanco)\s*(\d{1,2})?|espacio\s*(\d{1,2}))\s*\]\s*/i;

  const TYPE_LABELS = { mc: 'Selección múltiple', tf: 'Verdadero o falso', open: 'Desarrollo' };

  function sectionType(keyword) {
    const k = keyword.toLowerCase();
    if (/selecci|alternativ/.test(k)) return 'mc';
    if (/verdadero|^v\s*(o|\/)\s*f$/.test(k)) return 'tf';
    return 'open';
  }

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

  /** Pares (número, letra) de una línea de clave: "1A 2-c 3V". */
  function parseKeyLine(text, pairs) {
    const re = /(\d{1,3})\s*[.)\-:=]?\s*([a-fA-FvV])\b/g;
    let m;
    let n = 0;
    while ((m = re.exec(text))) {
      pairs.push({ number: parseInt(m[1], 10), letter: m[2].toLowerCase() });
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
    const keyPairs = [];
    const ignoredAfterKey = [];
    for (const raw of rawLines) {
      if (keyMode) {
        if (!parseKeyLine(raw, keyPairs) && raw.trim()) ignoredAfterKey.push(raw.trim());
        continue;
      }
      const km = raw.match(KEY_LINE);
      if (km && (parseKeyLine(km[2], keyPairs) > 0 || !km[2].trim())) {
        keyMode = true;
        continue;
      }
      for (const part of splitInlineOptions(raw)) lines.push(part);
    }

    const questions = [];
    const sections = [];
    let currentSection = null; // índice en `sections`
    let collectingSectionText = false;
    let cur = null;
    let pending = [];
    let blankSinceLast = false;
    let currentOA = null;
    const sectionOf = () => (currentSection === null ? null : currentSection);
    const sectionTypeOf = () => (currentSection === null ? null : sections[currentSection].type);

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
      // Espacio para responder indicado en el texto.
      const sm = cur.stem.match(SPACE_MARK);
      if (sm) {
        const style = sm[2] ? (/blanco/i.test(sm[2]) ? 'blank' : 'box') : 'lines';
        cur.space = parseInt(sm[1] || sm[3] || sm[4], 10) || null;
        cur.spaceStyle = style;
        cur.stem = cur.stem.replace(SPACE_MARK, ' ').trim();
      }
      // Tipo de pregunta.
      let type = cur.tfHint ? 'tf' : cur.section !== null ? sections[cur.section].type : null;
      const opts = cur.options.map((o) => o.toLowerCase().replace(/[.\s]/g, ''));
      if (!type) {
        if (opts.length === 2 && /^(v|verdadero)$/.test(opts[0]) && /^(f|falso)$/.test(opts[1])) type = 'tf';
        else if (TF_LEAD.test(cur.stem) || TF_SUFFIX.test(cur.stem)) type = 'tf';
        else if (!cur.options.length) {
          type = 'open';
          cur.autoOpen = true;
        } else type = 'mc';
      }
      cur.type = type;
      if (type === 'tf') {
        if (opts.length === 2 && /^(v|verdadero)$/.test(opts[0])) {
          if (cur.correct !== null) cur.tfAnswer = cur.correct === 0 ? 'V' : 'F';
          cur.options = [];
          cur.correct = null;
        }
        cur.stem = cur.stem.replace(TF_LEAD, '').replace(TF_SUFFIX, '').trim();
        const am = cur.stem.match(TF_ANSWER);
        if (am) {
          cur.tfAnswer = am[1][0].toUpperCase();
          cur.stem = cur.stem.replace(TF_ANSWER, '').trim();
        }
      }
      delete cur.tfHint;
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
      collectingSectionText = false;
      cur = newCur(number, firstLine ? [firstLine] : [], pending);
      pending = [];
    };

    function newCur(number, stemLines, preambleLines) {
      return {
        number,
        stemLines,
        preambleLines,
        options: [],
        correct: null,
        oa: currentOA,
        section: sectionOf(),
        type: null,
        tfAnswer: null,
        space: null,
        spaceStyle: null,
      };
    }

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

      // Encabezado de ítem (tipo de pregunta de las siguientes).
      const sec = t.match(SECTION_LINE);
      if (sec && !(cur && cur.options.length === 0 && cur.stemLines.length === 0)) {
        finish();
        const title = (sec[1] + (sec[5] ? ' ' + sec[5] : '')).replace(/\s+/g, ' ').trim();
        const instr = [];
        if (pending.some((x) => x.trim())) {
          if (!questions.length && !sections.length) introLines = introLines.concat(pending);
          else instr.push(joinLines(pending));
        }
        pending = [];
        if (sec[4]) instr.push(sec[4].trim());
        sections.push({ title, type: sectionType(sec[2]), instructions: instr.join(' ').trim() });
        currentSection = sections.length - 1;
        collectingSectionText = true;
        blankSinceLast = false;
        continue;
      }

      // "____ 1. Afirmación" o "( ) Afirmación": verdadero o falso.
      if (TF_LEAD.test(t)) {
        const rest = t.replace(TF_LEAD, '');
        const qn = rest.match(Q_START);
        newQuestion(qn ? parseInt(qn[1], 10) : null, (qn ? qn[2] : rest).trim());
        cur.tfHint = true;
        blankSinceLast = false;
        continue;
      }

      // En un ítem de verdadero o falso, "a) Afirmación" es una afirmación más.
      if (sectionTypeOf() === 'tf') {
        const om2 = t.match(OPT_START);
        if (om2 && !t.match(Q_START)) {
          newQuestion(null, om2[2].trim());
          blankSinceLast = false;
          continue;
        }
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
          collectingSectionText = false;
          cur = newCur(null, stem, []);
          cur.options.push({ letter, lines: [om[2]], marked });
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
      if (collectingSectionText && !cur) {
        const secObj = sections[currentSection];
        secObj.instructions = (secObj.instructions ? secObj.instructions + ' ' : '') + t;
        blankSinceLast = false;
        continue;
      }
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
    if (ignoredAfterKey.length) {
      warnings.push(
        `Se ignoró el texto que está después de la clave (“${ignoredAfterKey[0].slice(0, 60)}${ignoredAfterKey[0].length > 60 ? '…' : ''}”): ` +
          'la línea “Clave:” debe ir al final.'
      );
    }
    const trailing = joinLines(pending);
    if (trailing) warnings.push(`Texto al final que no pertenece a ninguna pregunta: “${trailing.slice(0, 80)}${trailing.length > 80 ? '…' : ''}”.`);

    const numbered = questions.some((q) => q.number !== null);
    let ordered = questions;
    // Se ordena según la numeración dentro de cada ítem (la numeración puede
    // reiniciarse en cada ítem).
    const groups = [];
    for (const q of questions) {
      const g = groups.find((x) => x.section === q.section);
      if (g) g.items.push(q);
      else groups.push({ section: q.section, items: [q] });
    }
    if (opts.sortByNumber && numbered) {
      ordered = [];
      for (const g of groups) {
        if (!g.items.every((q) => q.number !== null)) {
          ordered.push(...g.items);
          continue;
        }
        const sorted = g.items.map((q, i) => ({ q, i })).sort((a, b) => a.q.number - b.q.number || a.i - b.i).map((x) => x.q);
        ordered.push(...sorted);
        const nums = sorted.map((q) => q.number);
        const where = g.section !== null && sections.length > 1 ? ` en “${sections[g.section].title}”` : '';
        const dups = nums.filter((n, i) => i > 0 && n === nums[i - 1]);
        if (dups.length) warnings.push(`Números de pregunta repetidos${where}: ${Array.from(new Set(dups)).join(', ')}.`);
        const missing = [];
        for (let n = nums[0]; n <= nums[nums.length - 1]; n++) if (nums.indexOf(n) < 0) missing.push(n);
        if (missing.length && missing.length <= 20) warnings.push(`Faltan las preguntas número ${missing.join(', ')}${where} en el texto pegado.`);
      }
    }

    // Clave al final del texto: cada par (número, letra) se asigna a la primera
    // pregunta con ese número y de tipo compatible (V/F o alternativa).
    const keyed = new Set();
    for (const pr of keyPairs) {
      const q = ordered.find((x) => {
        if (x.number !== pr.number || keyed.has(x)) return false;
        if (x.type === 'tf') return pr.letter === 'v' || pr.letter === 'f';
        if (x.type === 'mc') return pr.letter !== 'v' && LETTERS.indexOf(pr.letter) < x.options.length;
        return false;
      });
      if (!q) continue;
      keyed.add(q);
      if (q.type === 'tf') {
        if (!q.tfAnswer) q.tfAnswer = pr.letter.toUpperCase();
      } else if (q.correct === null) q.correct = LETTERS.indexOf(pr.letter);
    }

    const mcs = ordered.filter((q) => q.type === 'mc');
    const counts = {};
    for (const q of mcs) counts[q.options.length] = (counts[q.options.length] || 0) + 1;
    const usual = Number(Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0] || 0);
    ordered.forEach((q, i) => {
      const label = `Pregunta ${i + 1}${q.number !== null && q.number !== i + 1 ? ` (n° ${q.number} en el texto)` : ''}`;
      if (!q.stem) warnings.push(`${label}: no tiene enunciado.`);
      if (q.type === 'open' && q.autoOpen && mcs.length) warnings.push(`${label}: no tiene alternativas, se tratará como pregunta de desarrollo.`);
      delete q.autoOpen;
      if (q.type !== 'mc') return;
      if (q.options.length < 2) warnings.push(`${label}: tiene ${q.options.length} alternativa(s).`);
      else if (q.options.length !== usual) warnings.push(`${label}: tiene ${q.options.length} alternativas y la mayoría tiene ${usual}.`);
      q.options.forEach((o, j) => {
        if (!o) warnings.push(`${label}: la alternativa ${LETTERS[j]} está vacía.`);
      });
    });
    return { questions: ordered, warnings, numbered, intro: joinLines(introLines), sections };
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
    objectives: '', // Objetivos de Aprendizaje que se imprimen en el encabezado
    numbering: 'section', // 'section' (se reinicia en cada ítem) o 'continuous'
    openLines: 6, // espacio por defecto en preguntas de desarrollo (en líneas de 8 mm)
    openStyle: 'lines', // 'lines' | 'box' | 'blank'
    tfJustifyLines: 0, // líneas para justificar en verdadero o falso
    totalPoints: '', // puntaje total que se muestra junto a "Puntaje" (opcional)
  };

  const SECTION_DEFAULT_INSTRUCTIONS = {
    mc: 'Marca la alternativa correcta.',
    tf: 'Escribe V si la afirmación es verdadera o F si es falsa.',
    open: 'Responde en el espacio asignado.',
  };
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

  /**
   * Agrupa las preguntas en ítems y calcula su numeración impresa.
   * Si el texto trae encabezados de ítem se usan; si no, y hay tipos
   * distintos, se forma un ítem por cada grupo seguido del mismo tipo.
   * @returns { blocks: [{ title, type, instructions, items: [índices] }], numbers: [n por pregunta] }
   */
  function planSections(questions, sections, fmt) {
    const f = Object.assign({}, DEFAULT_FORMAT, fmt || {});
    sections = sections || [];
    const blocks = [];
    const explicit = questions.some((q) => q.section !== null && q.section !== undefined);
    const mixed = new Set(questions.map((q) => q.type || 'mc')).size > 1;
    questions.forEach((q, i) => {
      const key = explicit ? (q.section === undefined ? null : q.section) : mixed ? q.type || 'mc' : 'all';
      const last = blocks[blocks.length - 1];
      if (last && last.key === key) last.items.push(i);
      else blocks.push({ key, items: [i] });
    });
    let roman = 0;
    for (const b of blocks) {
      const firstType = questions[b.items[0]].type || 'mc';
      if (explicit && b.key !== null) {
        const sec = sections[b.key] || {};
        b.type = sec.type || firstType;
        b.title = sec.title || '';
        b.instructions = sec.instructions || '';
      } else if (!explicit && mixed) {
        b.type = firstType;
        b.title = `Ítem ${ROMAN[roman++] || roman}. ${TYPE_LABELS[firstType]}`;
        b.instructions = '';
      } else {
        b.type = firstType;
        b.title = '';
        b.instructions = '';
      }
      if (b.title && !b.instructions) {
        b.instructions = SECTION_DEFAULT_INSTRUCTIONS[b.type] || '';
        if (b.type === 'tf' && Number(f.tfJustifyLines) > 0) b.instructions += ' Justifica las falsas.';
      }
    }
    const numbers = new Array(questions.length);
    let n = 0;
    for (const b of blocks) {
      if (f.numbering === 'section' && b.title) n = 0;
      for (const i of b.items) numbers[i] = ++n;
    }
    return { blocks, numbers };
  }

  function answerSpace(lines, style) {
    const nLines = Math.min(40, Math.max(1, Number(lines) || 6));
    if (style === 'box') return `<div class="td-space td-box" style="height:${nLines * 8}mm"></div>`;
    if (style === 'blank') return `<div class="td-space" style="height:${nLines * 8}mm"></div>`;
    return `<div class="td-space td-lines">${'<div class="td-line"></div>'.repeat(nLines)}</div>`;
  }

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

  /* ------------------------------------------------------------------ */
  /* Elementos agregados a una pregunta (imagen, tabla, gráfico, texto)   */
  /* ------------------------------------------------------------------ */

  const ELEMENT_TYPES = { image: 'Imagen', table: 'Tabla', chart: 'Gráfico', text: 'Texto' };

  /** Filas de una tabla pegada desde Excel/Word (tabulaciones) o escrita con "|" o ";". */
  function parseTable(text) {
    const lines = String(text || '')
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .filter((l) => l.trim());
    const sep = lines.some((l) => l.indexOf('\t') >= 0) ? '\t' : lines.some((l) => l.indexOf('|') >= 0) ? '|' : ';';
    const rows = lines.map((l) => {
      let t = l;
      if (sep === '|') t = t.replace(/^\s*\|/, '').replace(/\|\s*$/, '');
      return t.split(sep).map((c) => c.trim());
    });
    // Filas separadoras estilo Markdown (|---|---|).
    const clean = rows.filter((r) => !r.every((c) => /^:?-{2,}:?$/.test(c)));
    const cols = Math.max(0, ...clean.map((r) => r.length));
    return clean.map((r) => r.concat(new Array(cols - r.length).fill('')));
  }

  function isNumeric(c) {
    return /^[-+]?[\d.,]+\s*%?$/.test(String(c).trim());
  }

  /**
   * HTML de un elemento.
   * @param el { id, type, width, caption, data, src }
   *   image: src (data URL) · table: data.text, data.header · chart: data (spec de Charts) · text: data.text, data.boxed
   */
  function renderElement(el) {
    const width = Math.min(100, Math.max(15, Number(el.width) || (el.type === 'text' ? 100 : 70)));
    const idAttr = el.id ? ` data-el="${esc(el.id)}"` : '';
    const cap = el.caption ? `<figcaption>${esc(el.caption)}</figcaption>` : '';
    const d = el.data || {};
    if (el.type === 'image') {
      const img = el.src ? `<img src="${esc(el.src)}" alt="${esc(el.caption || 'Imagen')}">` : '<div class="td-missing">Imagen no disponible</div>';
      return `<figure class="td-el td-image" style="width:${width}%"${idAttr}>${img}${cap}</figure>`;
    }
    if (el.type === 'table') {
      const rows = parseTable(d.text);
      if (!rows.length) return `<figure class="td-el"${idAttr}><div class="td-missing">Tabla vacía</div></figure>`;
      const header = d.header !== false && rows.length > 1;
      let html = `<table class="td-table">`;
      rows.forEach((r, i) => {
        const tag = header && i === 0 ? 'th' : 'td';
        html += '<tr>' + r.map((c) => `<${tag}${tag === 'td' && isNumeric(c) ? ' class="num"' : ''}>${esc(c)}</${tag}>`).join('') + '</tr>';
      });
      html += '</table>';
      return `<figure class="td-el td-tablefig" style="max-width:${width}%"${idAttr}>${html}${cap}</figure>`;
    }
    if (el.type === 'chart') {
      const svg = Charts ? Charts.renderChartSVG(d, el.id || 'x') : '';
      return `<figure class="td-el td-chart" style="width:${width}%"${idAttr}>${svg}${cap}</figure>`;
    }
    // Texto.
    return `<div class="td-el td-text${d.boxed ? ' boxed' : ''}"${idAttr}><p>${paragraphs(d.text || '')}</p></div>`;
  }

  /**
   * @param questions resultado de parseQuestions(...).questions
   * @param fmt ver DEFAULT_FORMAT
   * @param info { maxScore, intro, elements } — puntaje máximo, texto introductorio y,
   *             por pregunta (índice), una lista de elementos { position: 'before'|'after', ... }
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
    // Objetivos de Aprendizaje (uno por línea).
    const oas = String(f.objectives || '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (oas.length === 1) out.push(`<div class="td-oabox"><strong>Objetivo de Aprendizaje:</strong> ${esc(oas[0])}</div>`);
    else if (oas.length > 1) {
      out.push(`<div class="td-oabox"><strong>Objetivos de Aprendizaje:</strong><ul>${oas.map((o) => `<li>${esc(o)}</li>`).join('')}</ul></div>`);
    }
    if (f.instructions) out.push(`<div class="td-instr"><strong>Instrucciones:</strong> ${esc(f.instructions)}</div>`);
    if (info.intro) out.push(`<div class="td-intro"><p>${paragraphs(info.intro)}</p></div>`);

    // Preguntas, agrupadas en ítems.
    const plan = planSections(questions, info.sections, f);
    const elements = info.elements || [];
    const openLines = Number(f.openLines) || 6;
    const tfJustify = Number(f.tfJustifyLines) || 0;
    for (const block of plan.blocks) {
      if (block.title) {
        out.push(`<div class="td-section"><h2>${esc(block.title)}</h2>${block.instructions ? `<p>${esc(block.instructions)}</p>` : ''}</div>`);
      }
      out.push(`<div class="td-questions${Number(f.columns) === 2 ? ' two-cols' : ''}">`);
      for (const i of block.items) {
        const q = questions[i];
        const type = q.type || 'mc';
        const num = plan.numbers[i];
        out.push(`<section class="td-q td-${type}" data-q="${i}">`);
        if (q.preamble) out.push(`<div class="td-pre"><p>${paragraphs(q.preamble)}</p></div>`);
        const els = elements[i] || [];
        const before = els.filter((e) => e.position === 'before').map(renderElement).join('');
        const after = els.filter((e) => e.position !== 'before').map(renderElement).join('');
        if (before) out.push(`<div class="td-els">${before}</div>`);
        const oa = f.showOA && q.oa ? ` <span class="td-oa">(${esc(q.oa)})</span>` : '';
        if (type === 'tf') {
          out.push(
            `<div class="td-stem"><span class="td-num">${num}.</span><span class="td-tfblank" aria-label="Verdadero o falso"></span>` +
              `<div><p>${paragraphs(q.stem)}${oa}</p></div></div>`
          );
        } else {
          out.push(`<div class="td-stem"><span class="td-num">${num}.</span><div><p>${paragraphs(q.stem)}${oa}</p></div></div>`);
        }
        if (after) out.push(`<div class="td-els after">${after}</div>`);
        if (type === 'mc') {
          const maxLen = Math.max(0, ...q.options.map((o) => o.length));
          let layout = f.optionsLayout;
          if (layout === 'auto') layout = maxLen <= 18 && q.options.length >= 3 ? 'row' : maxLen <= 40 ? 'grid' : 'list';
          out.push(`<ol class="td-opts ${layout}">`);
          q.options.forEach((o, j) => {
            out.push(`<li><span class="td-letter">${esc(letterLabel(j, f.letterStyle))}</span><span>${esc(o)}</span></li>`);
          });
          out.push('</ol>');
        } else if (type === 'tf') {
          if (tfJustify > 0) out.push(`<div class="td-answer">${answerSpace(tfJustify, 'lines')}</div>`);
        } else {
          const lines = q.space || openLines;
          const style = q.spaceStyle || f.openStyle;
          if (q.options.length) {
            // Sub-preguntas a), b)… cada una con su espacio.
            out.push('<ol class="td-subq">');
            q.options.forEach((o, j) => {
              out.push(
                `<li><div class="td-subq-text"><span class="td-letter">${esc(letterLabel(j, f.letterStyle))}</span><span>${esc(o)}</span></div>` +
                  `${answerSpace(Math.max(2, Math.round(lines / 2)), style)}</li>`
              );
            });
            out.push('</ol>');
          } else {
            out.push(`<div class="td-answer">${answerSpace(lines, style)}</div>`);
          }
        }
        out.push('</section>');
      }
      out.push('</div>');
    }
    out.push('</article>');
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
.td-oabox { border: 0.3mm solid #000; padding: 2mm 3mm; margin-bottom: 2.5mm; font-size: 0.92em; }
.td-oabox ul { margin: 1mm 0 0; padding-left: 5mm; }
.td-oabox li { margin: 0.5mm 0; }
.td-section { margin: 5mm 0 3mm; break-after: avoid; page-break-after: avoid; }
.td-section h2 { font-size: 1.08em; margin: 0 0 1mm; }
.td-section p { margin: 0; font-style: italic; }
.td-tfblank { display: inline-block; flex: none; width: 12mm; border-bottom: 0.3mm solid #000; height: 1.1em; margin-right: 1mm; }
.td-answer { margin: 1.5mm 0 0 8mm; }
.td-space { width: 100%; }
.td-lines .td-line { height: 8mm; border-bottom: 0.25mm solid #888; }
.td-box { border: 0.3mm solid #000; border-radius: 1mm; }
.td-subq { list-style: none; margin: 1.5mm 0 0 8mm; padding: 0; }
.td-subq li { margin-bottom: 2mm; break-inside: avoid; }
.td-subq-text { display: flex; gap: 2mm; }
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
.td-els { margin: 1.5mm 0 2mm 8mm; }
.td-el { margin: 0 auto 2mm; break-inside: avoid; }
.td-el figcaption { font-size: 0.85em; text-align: center; color: #333; margin-top: 1mm; }
.td-image img { display: block; width: 100%; height: auto; }
.td-chart svg { display: block; width: 100%; height: auto; }
.td-tablefig { display: table; }
.td-table { border-collapse: collapse; font-size: 0.95em; }
.td-table th, .td-table td { border: 0.25mm solid #000; padding: 1mm 2.5mm; text-align: left; white-space: normal; font-size: inherit; color: #000; position: static; }
.td-table th { background: #e8e8e8; font-weight: bold; text-transform: none; letter-spacing: normal; }
.td-table td.num { text-align: right; }
.td-text { margin-left: 0; }
.td-text.boxed { border: 0.3mm solid #000; padding: 2mm 3mm; }
.td-missing { border: 0.3mm dashed #999; padding: 6mm; text-align: center; color: #777; }
.td-opts.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 6mm; }
`;

  return {
    parseQuestions,
    renderTestHTML,
    renderElement,
    planSections,
    parseTable,
    ELEMENT_TYPES,
    TYPE_LABELS,
    DEFAULT_FORMAT,
    FONTS,
    TEST_CSS,
    splitInlineOptions,
  };
});
