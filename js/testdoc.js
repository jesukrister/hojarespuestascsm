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
 *   III. Términos pareados + "Término = Definición"     → términos pareados (o Columna A / Columna B)
 *   IV. Completación + "La capital es [Santiago]."      → completar (con banco de palabras)
 *   V. Ordenar secuencia + a) b) c) en el orden correcto → ordenar (se desordena al imprimir)
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
      'preguntas?\\s+(?:abiertas?|de\\s+desarrollo)|respuestas?\\s+(?:abiertas?|breves?|cortas?)|' +
      't[ée]rminos\\s+pareados|pareados|pareo|asociaci[óo]n(?:\\s+de\\s+(?:conceptos|t[ée]rminos))?|relacionar(?:\\s+columnas)?|' +
      'completaci[óo]n|completar(?:\\s+(?:oraciones|el\\s+texto|espacios))?|oraciones\\s+incompletas|' +
      'ordenar(?:\\s+(?:secuencias?|cronol[óo]gicamente|la\\s+secuencia|los\\s+hechos))?|ordenaci[óo]n|' +
      'secuencias?(?:\\s+(?:cronol[óo]gicas?|de\\s+hechos))?|orden\\s+cronol[óo]gico|' +
      '(?:relaciona|une|asocia)r?\\s+(?:(?:la|las|los|cada)\\s+)?(?:columnas?|conceptos?|t[ée]rminos|definiciones|palabras)[^.:]*))' +
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

  // Términos pareados: "Columna A" / "Columna B" y separadores entre término y definición.
  const COLUMN_LINE = /^\s*columna\s+([ab12]|i{1,2})\b\s*[:.\-]?\s*(.{0,60})$/i;
  const PAIR_SEP = /\t+|\s*(?:=>|->|→|⟶|=)\s*|\s*\|\s*|\s+-{1,2}\s*|\s*-{1,2}\s+|\s*\.{4,}\s*|\s*…{2,}\s*/;
  // Separadores claros (sin encabezado de ítem, dos o más líneas así forman un pareado).
  const STRONG_PAIR = /^([^=→\t]{1,60}?)\s*(?:\t+|=>|->|→|⟶|=)\s*(\S.*)$/;
  // "Término: definición" sólo dentro de un ítem de términos pareados.
  const COLON_PAIR = /^([^:]{1,50}?)\s*:\s*(\S.*)$/;
  const NOT_A_TERM = /^(?:instrucci[óo]n(?:es)?|indicaci[óo]n(?:es)?|nota|ejemplo|puntaje|columna\s*\S*)$/i;
  const TERM_ANSWER = /\s*\(\s*([a-f])\s*\)\s*$/i; // "1. Fotosíntesis (c)"
  const DEF_ANSWER = /\s*\(\s*(\d{1,2})\s*\)\s*$/; // "a) Proceso… (1)"
  // Completación: "[respuesta]" o "____" marcan el espacio a completar.
  const BLANK_RE = /\[([^\[\]\n]{1,80})\]|_{3,}/g;
  const BANK_LINE = /^\s*(?:banco(?:\s+de\s+palabras)?|palabras(?:\s+para\s+completar)?|distractores)\s*:\s*(.+)$/i;
  const ORDER_STEM = /^\s*(?:ordena|ordenar|enumera|numera)\b/i;

  const TYPE_LABELS = {
    mc: 'Selección múltiple',
    tf: 'Verdadero o falso',
    open: 'Desarrollo',
    fill: 'Completación',
    order: 'Ordenar secuencia',
    match: 'Términos pareados',
  };

  function sectionType(keyword) {
    const k = keyword.toLowerCase();
    if (/selecci|alternativ/.test(k)) return 'mc';
    if (/verdadero|^v\s*(o|\/)\s*f$/.test(k)) return 'tf';
    if (/parea|pareo|asociaci|relaciona/.test(k)) return 'match';
    if (/complet/.test(k)) return 'fill';
    if (/orden|secuencia/.test(k)) return 'order';
    return 'open';
  }

  function detab(t) {
    return String(t || '').replace(/[ \t]*\t[ \t]*/g, ' ');
  }

  function clean(text) {
    return String(text || '')
      .replace(/\r\n?/g, '\n')
      .replace(/[\u00a0\u2007\u202f]/g, ' ')
      .replace(/[ ]*\t[ \t]*/g, '\t') // las tabulaciones separan columnas (términos pareados)
      .replace(/[\u2010-\u2015]/g, '-')
      // Viñetas: se quitan si van antes de una alternativa o un número; si no, quedan como "- ".
      .replace(/^[ \t]*[•●▪◦·][ \t]*(?=[([]?[a-fA-F][).\]:-]|\d{1,3}[.)\-:])/gm, '')
      .replace(/^[ \t]*[•●▪◦·][ \t]*/gm, '- ')
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
      const t = detab(l).trim();
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
   * Arma un ítem de términos pareados a partir de sus líneas:
   * terms (columna A), defs (columna B) y matches[d] = índice del término
   * que corresponde a la definición d (null si es un distractor o no se sabe).
   */
  function finishMatch(q) {
    const terms = [];
    const defs = [];
    const termLabels = [];
    const defLabels = [];
    const links = [];
    const byTermLabel = [];
    const byDefLabel = [];
    for (const e of q.entries || []) {
      if (e.side === 'pair') {
        let term = e.term;
        let def = e.def;
        terms.push(term);
        termLabels.push(null);
        defs.push(def);
        defLabels.push(null);
        links.push([terms.length - 1, defs.length - 1]);
      } else if (e.side === 'A') {
        let text = e.text;
        const am = text.match(TERM_ANSWER);
        if (am) {
          text = text.replace(TERM_ANSWER, '').trim();
          byTermLabel.push([terms.length, am[1].toLowerCase()]);
        }
        terms.push(text);
        termLabels.push(e.label);
      } else {
        let text = e.text;
        const am = text.match(DEF_ANSWER);
        if (am) {
          text = text.replace(DEF_ANSWER, '').trim();
          byDefLabel.push([defs.length, am[1]]);
        }
        defs.push(text);
        defLabels.push(e.label);
      }
    }
    // Etiquetas por defecto según la posición (1, 2, 3… y a, b, c…).
    termLabels.forEach((l, i) => (termLabels[i] = l || String(i + 1)));
    defLabels.forEach((l, i) => (defLabels[i] = l || 'abcdefghijklmnopqrstuvwxyz'[i] || String(i + 1)));
    for (const [ti, dl] of byTermLabel) {
      const di = defLabels.indexOf(dl);
      if (di >= 0) links.push([ti, di]);
    }
    for (const [di, tl] of byDefLabel) {
      const ti = termLabels.indexOf(tl);
      if (ti >= 0) links.push([ti, di]);
    }
    q.terms = terms.map((t) => t.replace(/\s+/g, ' ').trim());
    q.defs = defs.map((t) => t.replace(/\s+/g, ' ').trim());
    q.matches = q.defs.map(() => null);
    for (const [t, d] of links) q.matches[d] = t;
    // Si se escribieron las columnas por separado, la columna B ya viene en el orden deseado.
    q.given = (q.entries || []).some((e) => e.side === 'B') && !(q.entries || []).some((e) => e.side === 'pair');
    q.labels = { terms: termLabels, defs: defLabels };
    q.options = [];
    q.correct = null;
    delete q.entries;
    delete q.side;
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
      if (cur.type === 'match') {
        finishMatch(cur);
        delete cur.stemLines;
        delete cur.preambleLines;
        questions.push(cur);
        cur = null;
        return;
      }
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
      const secType = cur.section !== null ? sections[cur.section].type : null;
      let type = cur.tfHint ? 'tf' : secType === 'match' ? null : secType;
      const opts = cur.options.map((o) => o.toLowerCase().replace(/[.\s]/g, ''));
      // En un ítem de completación, una pregunta con alternativas es de selección múltiple.
      if (type === 'fill' && cur.options.length >= 2) type = 'mc';
      if (!type) {
        if (opts.length === 2 && /^(v|verdadero)$/.test(opts[0]) && /^(f|falso)$/.test(opts[1])) type = 'tf';
        else if (TF_LEAD.test(cur.stem) || TF_SUFFIX.test(cur.stem)) type = 'tf';
        else if (!cur.options.length) {
          if (/\S\s*_{3,}|_{3,}\s*\S/.test(cur.stem)) type = 'fill';
          else {
            type = 'open';
            cur.autoOpen = true;
          }
        } else if (cur.correct === null && cur.options.length >= 3 && ORDER_STEM.test(cur.stem)) type = 'order';
        else type = 'mc';
      }
      cur.type = type;
      // "Respuesta breve": menos espacio por defecto.
      if (type === 'open' && !cur.space && cur.section !== null && /breve|cort/i.test(sections[cur.section].title)) cur.space = 2;
      if (type === 'order') cur.correct = null;
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

    /** Empieza (o continúa) un ítem de términos pareados. */
    const startMatch = () => {
      if (cur && cur.type === 'match') return;
      const pre = pending;
      pending = [];
      finish();
      collectingSectionText = false;
      cur = newCur(null, [], []);
      // Texto previo (fuera de un ítem con título): enunciado del pareado.
      if (pre.some((x) => x.trim())) cur.stemLines = pre;
      cur.type = 'match';
      cur.entries = [];
      cur.side = null;
    };

    /** Procesa una línea dentro de un ítem de términos pareados. Devuelve false si no es parte del pareado. */
    const matchLine = (line) => {
      const raw0 = line.trim();
      // Viñeta al inicio ("- Término = Definición"): no es un separador.
      const raw = raw0.replace(/^-\s+(?=.*(?:\t|=|→|->|:|\s-{1,2}\s))/, '');
      const label = (t) => {
        const qn = t.match(Q_START);
        if (qn) return { kind: 'num', label: qn[1], text: qn[2].trim() };
        const on = t.match(OPT_START);
        if (on && /^\s*[([]?\s*[a-fA-F]\s*[)\].:-]/.test(t)) return { kind: 'let', label: on[1].toLowerCase(), text: on[2].trim() };
        const dash = t.match(/^-\s+(.*)$/);
        return { kind: null, label: null, text: (dash ? dash[1] : t).trim() };
      };
      // Los separadores se buscan fuera de las fórmulas ("\(a^2 + b^2 = c^2\)").
      const mk = maskMath(raw);
      let parts = mk.masked.split(PAIR_SEP);
      if (parts.length < 2 || !parts.slice(1).join(' ').trim()) {
        const cm = mk.masked.match(COLON_PAIR);
        const left = cm ? label(detab(cm[1]).trim()).text : '';
        if (cm && left && left.split(/\s+/).length <= 6 && !NOT_A_TERM.test(left)) parts = [cm[1], cm[2]];
      }
      parts = parts.map(mk.restore);
      const hasSep = parts.length >= 2 && parts.slice(1).join(' ').trim();
      const add = (e) => {
        startMatch();
        cur.entries.push(e);
        return true;
      };
      if (hasSep) {
        const left = label(detab(parts[0]).trim());
        const right = label(detab(parts.slice(1).join(' ')).trim());
        if (cur && cur.type === 'match' && cur.side) {
          // Con encabezados de columnas, una fila de tabla trae un elemento de cada columna.
          if (left.text) add({ side: 'A', label: left.label, text: left.text });
          if (right.text) add({ side: 'B', label: right.label, text: right.text });
          return true;
        }
        if (left.kind === 'num' && right.kind === 'let') {
          // Tabla de dos columnas: término numerado y definición con letra (no necesariamente pareados).
          add({ side: 'A', label: left.label, text: left.text });
          return add({ side: 'B', label: right.label, text: right.text });
        }
        if (!left.text) return add({ side: 'B', label: right.label, text: right.text });
        return add({ side: 'pair', term: left.text, def: right.text });
      }
      const one = label(detab(raw));
      if (!one.text) return false;
      let side = cur && cur.type === 'match' ? cur.side : null;
      if (!side && one.kind === 'num') side = 'A';
      if (!side && one.kind === 'let') side = 'B';
      if (!side && one.kind === null && /^-\s/.test(raw)) side = 'A';
      if (side) return add({ side, label: one.label, text: one.text });
      // Texto sin marca: continuación del último término o definición.
      if (cur && cur.type === 'match' && cur.entries.length) {
        const last = cur.entries[cur.entries.length - 1];
        if (last.side === 'pair') last.def += ' ' + one.text;
        else last.text += ' ' + one.text;
        return true;
      }
      return false;
    };

    /** ¿La línea parece un par "Término = Definición" (sin número ni letra)? */
    const looksLikePair = (l) => {
      const tl = detab(l).trim() === l.trim() ? l.trim() : l.trim();
      if (!tl || Q_START.test(tl) || Q_WORD.test(tl) || OPT_START.test(tl) || TF_LEAD.test(tl) || hasMath(tl)) return false;
      const m = tl.match(STRONG_PAIR);
      if (!m) return false;
      const left = m[1].trim();
      // Un término tiene alguna palabra; una ecuación ("2x + 3 = 7") no es un par.
      return /[a-záéíóúüñ]{3,}/i.test(left) && !/[+*/^<>]/.test(left) && (tl.match(/=/g) || []).length <= 1;
    };
    const nextNonEmpty = (i) => {
      for (let j = i + 1; j < lines.length; j++) if (lines[j].trim()) return lines[j];
      return '';
    };

    for (let li = 0; li < lines.length; li++) {
      const line = lines[li];
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
      if (sec && !(cur && cur.type !== 'match' && cur.options.length === 0 && cur.stemLines.length === 0)) {
        finish();
        const title = (sec[1] + (sec[5] ? ' ' + sec[5] : '')).replace(/\s+/g, ' ').trim();
        const instr = [];
        if (pending.some((x) => x.trim())) {
          if (!questions.length && !sections.length) introLines = introLines.concat(pending);
          else instr.push(joinLines(pending));
        }
        pending = [];
        if (sec[4]) instr.push(detab(sec[4]).trim());
        sections.push({ title: detab(title), type: sectionType(sec[2]), instructions: instr.join(' ').trim() });
        currentSection = sections.length - 1;
        collectingSectionText = true;
        blankSinceLast = false;
        continue;
      }

      // Términos pareados: "Columna A" / "Columna B" y las líneas del ítem.
      const colm = t.match(COLUMN_LINE);
      if (colm) {
        startMatch();
        cur.side = /^(a|1|i)$/i.test(colm[1]) ? 'A' : 'B';
        blankSinceLast = false;
        continue;
      }
      if ((cur && cur.type === 'match') || sectionTypeOf() === 'match') {
        if (matchLine(line)) {
          blankSinceLast = false;
          continue;
        }
      } else if (
        (!cur || cur.options.length > 0 || blankSinceLast) &&
        looksLikePair(line) &&
        looksLikePair(nextNonEmpty(li))
      ) {
        // Sin encabezado: dos o más líneas "Término = Definición" seguidas son un pareado.
        startMatch();
        matchLine(line);
        blankSinceLast = false;
        continue;
      }

      // Banco de palabras de un ítem de completación.
      const bank = t.match(BANK_LINE);
      if (bank && currentSection !== null && (sectionTypeOf() === 'fill' || collectingSectionText)) {
        const secObj = sections[currentSection];
        secObj.bank = (secObj.bank || []).concat(
          detab(bank[1])
            .split(/\s*[,;·|]\s*|\s{2,}/)
            .map((w) => w.trim().replace(/\.$/, ''))
            .filter(Boolean)
        );
        blankSinceLast = false;
        continue;
      }

      // Ítem de ordenar: "- Hecho" es un elemento más de la secuencia.
      if (sectionTypeOf() === 'order' && cur && /^-\s+\S/.test(t)) {
        cur.options.push({ letter: cur.options.length, lines: [t.replace(/^-\s+/, '')] });
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
        secObj.instructions = (secObj.instructions ? secObj.instructions + ' ' : '') + detab(t);
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
    sections.forEach((sec, si) => {
      if (sec.type === 'match' && !questions.some((q) => q.section === si)) {
        warnings.push(
          `“${sec.title}”: no se encontraron pares. Escribe un par por línea, con “=” entre el término y su definición ` +
            '(por ejemplo: Fotosíntesis = Proceso por el cual las plantas producen su alimento).'
        );
      }
    });
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
      if (!q) {
        // Clave de términos pareados escrita en columnas: "1c" (término 1 con la definición c).
        const m = ordered.find((x) => x.type === 'match' && x.labels && x.labels.terms.indexOf(String(pr.number)) >= 0 && x.labels.defs.indexOf(pr.letter) >= 0);
        if (m) {
          const d = m.labels.defs.indexOf(pr.letter);
          if (m.matches[d] === null) m.matches[d] = m.labels.terms.indexOf(String(pr.number));
        }
        continue;
      }
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
      if (q.type === 'match') {
        delete q.labels;
        const where = q.section !== null && sections[q.section] ? `“${sections[q.section].title}”` : 'Términos pareados';
        if (!q.terms.length || !q.defs.length) warnings.push(`${where}: faltan términos (columna A) o definiciones (columna B).`);
        else if (q.matches.every((m) => m === null)) {
          warnings.push(`${where}: no se sabe qué definición corresponde a cada término (escribe “Término = Definición”, o indica la letra al final: “1. Término (c)”). No se podrá hacer la pauta.`);
        }
        return;
      }
      if (!q.stem) warnings.push(`${label}: no tiene enunciado.`);
      if (q.type === 'order' && q.options.length < 2) warnings.push(`${label}: para ordenar se necesitan al menos 2 elementos (a, b, c… en el orden correcto).`);
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
    fillBank: true, // banco de palabras en los ítems de completación
    forms: 1, // cantidad de filas (A, B, C, D)
    shuffleQuestions: true, // en las filas B–D, cambiar el orden de las preguntas
    shuffleOptions: true, // en las filas B–D, cambiar el orden de las alternativas
    formSeed: 0, // semilla de la mezcla (misma semilla → mismas filas)
  };

  const SECTION_DEFAULT_INSTRUCTIONS = {
    mc: 'Marca la alternativa correcta.',
    tf: 'Escribe V si la afirmación es verdadera o F si es falsa.',
    open: 'Responde en el espacio asignado.',
    fill: 'Completa cada espacio con la palabra o concepto que corresponda.',
    order: 'Ordena los elementos escribiendo en cada recuadro el número que corresponde (1 = el primero).',
    match: 'Escribe en cada línea de la columna B el número del concepto de la columna A que le corresponde.',
  };
  const FORM_LETTERS = ['A', 'B', 'C', 'D'];
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
        if (b.type === 'fill' && f.fillBank && ((sections[b.key] || {}).bank || b.items.some((i) => blanksOf(questions[i].stem).some((x) => x)))) {
          b.instructions += ' Usa las palabras del recuadro.';
        }
      }
      b.bank = explicit && b.key !== null && sections[b.key] ? sections[b.key].bank || [] : [];
    }
    // Los términos pareados no llevan número propio (sus términos se numeran 1, 2, 3…).
    const numbers = new Array(questions.length).fill(null);
    let n = 0;
    for (const b of blocks) {
      if (f.numbering === 'section' && b.title) n = 0;
      for (const i of b.items) if ((questions[i].type || 'mc') !== 'match') numbers[i] = ++n;
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

  /* ---------- Fórmulas: \( … \) en el texto ---------- */

  // Una fórmula se escribe entre \( y \) (así la inserta el editor de fórmulas).
  const MATH_RE = /\\\(([\s\S]+?)\\\)/g;
  let mathRenderer = null;

  /** Función (LaTeX → HTML) que dibuja las fórmulas; sin ella se muestran como texto. */
  function setMathRenderer(fn) {
    mathRenderer = typeof fn === 'function' ? fn : null;
  }

  function hasMath(text) {
    MATH_RE.lastIndex = 0;
    return MATH_RE.test(String(text || ''));
  }

  function mathHTML(tex) {
    if (mathRenderer) {
      try {
        return `<span class="td-math">${mathRenderer(tex)}</span>`;
      } catch (e) {
        /* se muestra como texto */
      }
    }
    return `<span class="td-math-raw">${esc(tex)}</span>`;
  }

  /** Divide un texto en trozos de texto y de fórmula. */
  function splitMath(text) {
    const str = String(text == null ? '' : text);
    const out = [];
    let last = 0;
    MATH_RE.lastIndex = 0;
    let m;
    while ((m = MATH_RE.exec(str))) {
      if (m.index > last) out.push({ text: str.slice(last, m.index) });
      out.push({ math: m[1] });
      last = m.index + m[0].length;
    }
    if (last < str.length) out.push({ text: str.slice(last) });
    return out;
  }

  /** Texto en una línea, con sus fórmulas. */
  function escRich(text) {
    return splitMath(text)
      .map((p) => (p.math !== undefined ? mathHTML(p.math) : esc(p.text)))
      .join('');
  }

  /** Párrafos (línea en blanco = párrafo nuevo), con sus fórmulas. */
  function paragraphs(text, textHook) {
    return splitMath(text)
      .map((p) =>
        p.math !== undefined
          ? mathHTML(p.math)
          : (textHook ? textHook(p.text) : esc(p.text)).replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>')
      )
      .join('');
  }

  /** Cambia las fórmulas por marcas neutras (para buscar separadores fuera de ellas) y permite restaurarlas. */
  function maskMath(text) {
    const saved = [];
    const masked = String(text || '').replace(MATH_RE, (m) => {
      saved.push(m);
      return `\uE000${saved.length - 1}\uE001`;
    });
    return { masked, restore: (t) => String(t).replace(/\uE000(\d+)\uE001/g, (m, i) => saved[Number(i)]) };
  }

  const ALPHA = 'abcdefghijklmnopqrstuvwxyz';

  function letterLabel(i, style) {
    const l = ALPHA[i] || String(i + 1);
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


  /* ------------------------------------------------------------------ */
  /* Completación, ordenar y términos pareados                            */
  /* ------------------------------------------------------------------ */

  /** Respuestas de los espacios de una oración a completar ("[Santiago]" → "Santiago", "____" → null). */
  function blanksOf(stem) {
    const out = [];
    for (const part of splitMath(stem)) {
      if (part.math !== undefined) continue;
      part.text.replace(BLANK_RE, (m, ans) => {
        out.push(ans ? ans.trim() : null);
        return m;
      });
    }
    return out;
  }

  /** Enunciado con los espacios para completar como líneas. */
  function fillHTML(stem, widthMm) {
    const blank = `<span class="td-blank" style="width:${widthMm}mm"></span>`;
    let found = false;
    const html = paragraphs(stem, (text) =>
      esc(text).replace(new RegExp(BLANK_RE.source, 'g'), () => {
        found = true;
        return blank;
      })
    );
    return found ? html : `${html} ${blank}`;
  }

  /* ---------- Mezcla reproducible (misma semilla → mismo resultado) ---------- */

  function hashStr(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h;
  }

  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function identity(n) {
    const p = [];
    for (let i = 0; i < n; i++) p.push(i);
    return p;
  }

  function randPerm(n, rand) {
    const p = identity(n);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const t = p[i];
      p[i] = p[j];
      p[j] = t;
    }
    return p;
  }

  /** Entre varias permutaciones al azar, la de menor costo. */
  function bestPerm(n, rand, cost, tries) {
    if (n < 2) return identity(n);
    let best = null;
    let bestCost = Infinity;
    for (let t = 0; t < (tries || 60); t++) {
      const p = randPerm(n, rand);
      const c = cost(p);
      if (c < bestCost) {
        best = p;
        bestCost = c;
        if (c === 0) break;
      }
    }
    return best;
  }

  /** Costo por parecerse a órdenes anteriores: posiciones repetidas y (mucho) si es idéntico. */
  function sameness(p, prevs) {
    let c = 0;
    for (const q of prevs) {
      if (!q || q.length !== p.length) continue;
      let same = 0;
      for (let i = 0; i < p.length; i++) if (p[i] === q[i]) same++;
      c += same + (same === p.length ? 1000 : 0);
    }
    return c;
  }

  function contentKey(q) {
    return [q.stem || '', (q.options || []).join('|'), (q.terms || []).join('|'), (q.defs || []).join('|')].join('#');
  }

  // Alternativas que deben quedar en su lugar ("Todas las anteriores", "Ninguna de las anteriores"…).
  const FIXED_OPTION = /anteriores|^(?:todas|ninguna|ambas)\b|^(?:todas|ninguna) de (?:las|los)\b/i;
  // Alternativas que nombran otras por su letra ("A y B son correctas"): no se mezclan.
  const LETTER_REF = /(?:^|[\s(])[a-fA-F]\)?\s*(?:,|y|e|o|u)\s*[a-fA-F](?:\)|[\s.,]|$)/;

  function canShuffleOptions(q) {
    return q.options.length > 1 && !q.options.some((o) => LETTER_REF.test(o));
  }

  /**
   * Ordena una pregunta para una fila: alternativas (selección múltiple),
   * elementos (ordenar) y columnas (términos pareados).
   * @param prev arreglos de las filas anteriores de esta misma pregunta
   * @returns copia con options/correct reordenados y optionPerm (nueva → original)
   */
  function arrangeQuestion(q, formIndex, seed, prev, shuffleOptions) {
    const c = Object.assign({}, q);
    const rand = rng(hashStr(`${seed}|${formIndex}|${contentKey(q)}`));
    prev = prev || [];
    const type = q.type || 'mc';
    c.optionPerm = null;
    if (type === 'mc') {
      let perm = identity(q.options.length);
      if (formIndex > 0 && shuffleOptions && canShuffleOptions(q)) {
        const free = perm.filter((i) => !FIXED_OPTION.test(q.options[i]));
        const prevCorrect = prev.map((p) => (q.correct === null || !p.optionPerm ? null : p.optionPerm.indexOf(q.correct)));
        const sub = bestPerm(free.length, rand, (fp) => {
          const full = perm.slice();
          free.forEach((pos, i) => (full[pos] = free[fp[i]]));
          let cost = sameness(full, prev.map((p) => p.optionPerm));
          if (q.correct !== null) {
            const at = full.indexOf(q.correct);
            for (const pc of prevCorrect) if (pc === at) cost += 50;
          }
          return cost;
        });
        const full = perm.slice();
        free.forEach((pos, i) => (full[pos] = free[sub[i]]));
        perm = full;
      }
      c.optionPerm = perm;
      c.options = perm.map((i) => q.options[i]);
      c.correct = q.correct === null ? null : perm.indexOf(q.correct);
    } else if (type === 'order') {
      const n = q.options.length;
      // Siempre se desordena (el texto trae los elementos en el orden correcto).
      if (formIndex === 0 || !shuffleOptions) {
        c.itemOrder = prev.length && !shuffleOptions ? prev[0].itemOrder : bestPerm(n, rng(hashStr(`${seed}|0|${contentKey(q)}`)), (p) => sameness(p, [identity(n)]));
      } else {
        c.itemOrder = bestPerm(n, rand, (p) => sameness(p, [identity(n)]) + sameness(p, prev.map((x) => x.itemOrder)));
      }
    } else if (type === 'match') {
      const nt = q.terms.length;
      const nd = q.defs.length;
      const aligned = (termOrder) => (p) => {
        // Evita que una definición quede en la misma fila que su término.
        let cst = 0;
        for (let r = 0; r < p.length; r++) if (q.matches[p[r]] !== null && q.matches[p[r]] === termOrder[r]) cst++;
        return cst;
      };
      if (formIndex === 0 || !shuffleOptions) {
        if (prev.length && !shuffleOptions) {
          c.termOrder = prev[0].termOrder;
          c.defOrder = prev[0].defOrder;
        } else {
          c.termOrder = identity(nt);
          c.defOrder = q.given ? identity(nd) : bestPerm(nd, rng(hashStr(`${seed}|0|${contentKey(q)}`)), aligned(c.termOrder));
        }
      } else {
        c.termOrder = bestPerm(nt, rand, (p) => sameness(p, prev.map((x) => x.termOrder)));
        c.defOrder = bestPerm(nd, rand, (p) => aligned(c.termOrder)(p) + sameness(p, prev.map((x) => x.defOrder)));
      }
    }
    return c;
  }

  /** Agrupa las preguntas de un ítem en unidades que se mueven juntas (p. ej. varias preguntas sobre un mismo texto). */
  const RANGE_REF = /(preguntas?\s+(?:n[°º]\s*)?)(\d{1,3})(\s*(?:a|al|-|hasta(?:\s+la)?|y)\s*)(\d{1,3})/i;
  const GROUP_REF = /(?:siguientes|pr[óo]ximas)\s+(?:\d+\s+)?preguntas|responde\s+las\s+preguntas|(?:las|estas)\s+\d+\s+preguntas/i;

  function unitsOf(items, questions) {
    const units = [];
    for (let k = 0; k < items.length; ) {
      const q = questions[items[k]];
      let len = 1;
      const pre = q.preamble || '';
      const rm = pre.match(RANGE_REF);
      if (rm) len = Math.max(1, parseInt(rm[4], 10) - parseInt(rm[2], 10) + 1);
      else if (GROUP_REF.test(pre)) {
        len = 1;
        while (k + len < items.length && !questions[items[k + len]].preamble) len++;
      }
      len = Math.min(len, items.length - k);
      units.push(items.slice(k, k + len));
      k += len;
    }
    return units;
  }

  const SHUFFLE_TYPES = { mc: true, tf: true, fill: true, order: true };

  /** Unidades de un ítem que no se mueven porque las instrucciones del ítem las nombran. */
  function pinnedUnits(block, units, numbers) {
    const pinned = units.map(() => false);
    const text = block.instructions || '';
    const rm = text.match(RANGE_REF);
    if (rm) {
      const a = parseInt(rm[2], 10);
      const z = parseInt(rm[4], 10);
      units.forEach((u, i) => {
        if (u.some((pos) => numbers[pos] !== null && numbers[pos] >= a && numbers[pos] <= z)) pinned[i] = true;
      });
    } else if (GROUP_REF.test(text)) {
      // "Lee el texto y responde las siguientes preguntas": todo el ítem queda en su orden.
      pinned.fill(true);
    }
    return pinned;
  }

  /**
   * Genera las filas de una evaluación (A = orden original).
   * @param opts { count, seed, shuffleQuestions, shuffleOptions } (por defecto, los de fmt)
   * @returns [{ letter, index, questions, source: [índice original por posición] }]
   */
  function buildForms(questions, sections, fmt, opts) {
    const f = Object.assign({}, DEFAULT_FORMAT, fmt || {});
    opts = opts || {};
    const count = Math.min(4, Math.max(1, Math.round(Number(opts.count !== undefined ? opts.count : f.forms)) || 1));
    const seed = String(opts.seed !== undefined ? opts.seed : f.formSeed || 0);
    const shuffleQ = opts.shuffleQuestions !== undefined ? !!opts.shuffleQuestions : !!f.shuffleQuestions;
    const shuffleO = opts.shuffleOptions !== undefined ? !!opts.shuffleOptions : !!f.shuffleOptions;
    const plan = planSections(questions, sections, f);
    const blockUnits = plan.blocks.map((b) => unitsOf(b.items, questions));
    const perQuestion = questions.map(() => []); // arreglos anteriores de cada pregunta
    const unitPerms = plan.blocks.map(() => []);
    const forms = [];
    for (let k = 0; k < count; k++) {
      const order = [];
      plan.blocks.forEach((b, bi) => {
        const units = blockUnits[bi];
        const movable = b.items.every((i) => SHUFFLE_TYPES[questions[i].type || 'mc']);
        let perm = identity(units.length);
        // Unidades que se mueven (las que el texto del ítem nombra, p. ej. "responde las preguntas 1 a 3", quedan fijas).
        const pinned = pinnedUnits(b, units, plan.numbers);
        const free = identity(units.length).filter((u) => !pinned[u]);
        if (k > 0 && shuffleQ && movable && free.length > 1) {
          const sub = bestPerm(free.length, rng(hashStr(`${seed}|q|${k}|${bi}|${units.length}`)), (fp) => {
            const full = perm.slice();
            free.forEach((slot, i) => (full[slot] = free[fp[i]]));
            return sameness(full, unitPerms[bi]);
          }, 80);
          const full = perm.slice();
          free.forEach((slot, i) => (full[slot] = free[sub[i]]));
          perm = full;
        }
        unitPerms[bi].push(perm);
        for (const u of perm) order.push(...units[u]);
      });
      const qs = order.map((oi) => {
        const c = arrangeQuestion(questions[oi], k, seed, perQuestion[oi], shuffleO);
        perQuestion[oi].push(c);
        return c;
      });
      // "Responde las preguntas 3 a 6": se actualizan los números del texto.
      if (k > 0) {
        order.forEach((oi, pos) => {
          const q = qs[pos];
          const rm = (q.preamble || '').match(RANGE_REF);
          if (!rm) return;
          const len = parseInt(rm[4], 10) - parseInt(rm[2], 10);
          const first = plan.numbers[pos];
          const last = plan.numbers[Math.min(order.length - 1, pos + len)];
          if (first === null || last === null) return;
          q.preamble = q.preamble.replace(RANGE_REF, (m, a, n1, mid) => `${a}${first}${mid}${last}`);
        });
      }
      forms.push({ letter: FORM_LETTERS[k], index: k, questions: qs, source: order });
    }
    return forms;
  }

  /** Respuesta correcta de una pregunta, como texto para la pauta. */
  function answerText(q, f) {
    const type = q.type || 'mc';
    if (type === 'mc') return q.correct === null ? '?' : letterLabel(q.correct, f.letterStyle).replace(/[().]/g, '').toUpperCase();
    if (type === 'tf') return q.tfAnswer || '?';
    if (type === 'fill') {
      const b = blanksOf(q.stem);
      return b.length && b.some((x) => x) ? b.map((x) => x || '?').join(' / ') : '?';
    }
    if (type === 'order') {
      const ord = q.itemOrder || identity(q.options.length);
      return ord.map((item, r) => `${ALPHA[r]}) ${item + 1}`).join(' · ');
    }
    if (type === 'match') {
      const to = q.termOrder || identity(q.terms.length);
      const dor = q.defOrder || identity(q.defs.length);
      return dor
        .map((d, r) => {
          const t = q.matches[d];
          return `${ALPHA[r] || r + 1}) ${t === null || t === undefined ? '—' : to.indexOf(t) + 1}`;
        })
        .join(' · ');
    }
    return 'Respuesta abierta';
  }

  /**
   * Pauta de respuestas de una o varias filas.
   * @param forms resultado de buildForms
   */
  function renderAnswerKeyHTML(forms, fmt, info) {
    const f = Object.assign({}, DEFAULT_FORMAT, fmt || {});
    info = info || {};
    const out = [];
    out.push(`<article class="testdoc td-keydoc" style="font-family:${esc(FONTS[f.fontFamily] || FONTS.Arial)};font-size:${Math.min(12, Number(f.fontSize) || 12)}pt">`);
    out.push(`<h1 class="td-title">Pauta de respuestas · ${esc(f.title || 'Evaluación')}</h1>`);
    const meta = [f.subject && `Asignatura: ${f.subject}`, f.course && `Curso: ${f.course}`].filter(Boolean);
    if (meta.length) out.push(`<p class="td-meta" style="text-align:center">${meta.map(esc).join(' · ')}</p>`);
    const multi = forms.length > 1;
    const plans = forms.map((fm) => planSections(fm.questions, info.sections, f));
    const plan = plans[0];
    plan.blocks.forEach((b, bi) => {
      if (b.title) out.push(`<h2 class="td-keyh">${esc(b.title)}</h2>`);
      out.push('<table class="td-keytable"><thead><tr><th>N°</th>');
      for (const fm of forms) out.push(`<th>${multi ? `Fila ${fm.letter}` : 'Respuesta'}</th>`);
      out.push('</tr></thead><tbody>');
      b.items.forEach((pos, r) => {
        const num = plan.numbers[pos];
        out.push(`<tr><td class="num">${num === null ? '' : num}</td>`);
        for (let k = 0; k < forms.length; k++) {
          const q = forms[k].questions[plans[k].blocks[bi].items[r]];
          out.push(`<td>${escRich(answerText(q, f))}</td>`);
        }
        out.push('</tr>');
      });
      out.push('</tbody></table>');
    });
    out.push('</article>');
    return out.join('');
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
    out.push('</div>');
    if (info.formLabel) out.push(`<div class="td-formtag">Fila<b>${esc(info.formLabel)}</b></div>`);
    out.push('</header>');
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
    if (oas.length === 1) out.push(`<div class="td-oabox"><strong>Objetivo de Aprendizaje:</strong> ${escRich(oas[0])}</div>`);
    else if (oas.length > 1) {
      out.push(`<div class="td-oabox"><strong>Objetivos de Aprendizaje:</strong><ul>${oas.map((o) => `<li>${escRich(o)}</li>`).join('')}</ul></div>`);
    }
    if (f.instructions) out.push(`<div class="td-instr"><strong>Instrucciones:</strong> ${escRich(f.instructions)}</div>`);
    if (info.intro) out.push(`<div class="td-intro"><p>${paragraphs(info.intro)}</p></div>`);

    // Preguntas, agrupadas en ítems.
    const plan = planSections(questions, info.sections, f);
    const elements = info.elements || [];
    const openLines = Number(f.openLines) || 6;
    const tfJustify = Number(f.tfJustifyLines) || 0;
    // Ancho de los espacios para completar: igual para todos (no delata la respuesta).
    const allBlanks = [].concat(...questions.filter((q) => q.type === 'fill').map((q) => blanksOf(q.stem).filter(Boolean)));
    const blankW = Math.round(Math.min(70, Math.max(28, 10 + 2.2 * Math.max(0, ...allBlanks.map((a) => a.length)))));
    for (const block of plan.blocks) {
      if (block.title) {
        out.push(`<div class="td-section"><h2>${esc(block.title)}</h2>${block.instructions ? `<p>${escRich(block.instructions)}</p>` : ''}</div>`);
      }
      // Banco de palabras (orden alfabético: no da pistas del orden de las oraciones).
      if (f.fillBank) {
        const words = [];
        for (const i of block.items) if (questions[i].type === 'fill') words.push(...blanksOf(questions[i].stem).filter(Boolean));
        if (words.length) words.push(...(block.bank || []));
        const seen = new Set();
        const uniq = words.filter((w) => {
          const k = w.toLowerCase();
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });
        uniq.sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
        if (uniq.length) out.push(`<div class="td-bank">${uniq.map((w) => `<span>${escRich(w)}</span>`).join('')}</div>`);
      }
      out.push(`<div class="td-questions${Number(f.columns) === 2 && block.type !== 'match' ? ' two-cols' : ''}">`);
      for (const i of block.items) {
        let q = questions[i];
        const type = q.type || 'mc';
        const num = plan.numbers[i];
        if ((type === 'order' && !q.itemOrder) || (type === 'match' && !q.defOrder)) q = arrangeQuestion(q, 0, String(f.formSeed || 0), [], true);
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
        } else if (type === 'match') {
          if (q.stem || oa) out.push(`<div class="td-stem"><div><p>${paragraphs(q.stem)}${oa}</p></div></div>`);
        } else if (type === 'fill') {
          out.push(`<div class="td-stem"><span class="td-num">${num}.</span><div><p>${fillHTML(q.stem, blankW)}${oa}</p></div></div>`);
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
            out.push(`<li><span class="td-letter">${esc(letterLabel(j, f.letterStyle))}</span><span>${escRich(o)}</span></li>`);
          });
          out.push('</ol>');
        } else if (type === 'tf') {
          if (tfJustify > 0) out.push(`<div class="td-answer">${answerSpace(tfJustify, 'lines')}</div>`);
        } else if (type === 'fill') {
          // Sin contenido adicional: los espacios van en la oración.
        } else if (type === 'order') {
          out.push('<ol class="td-order">');
          q.itemOrder.forEach((item, r) => {
            out.push(`<li><span class="td-orderbox"></span><span class="td-letter">${esc(letterLabel(r, f.letterStyle))}</span><span>${escRich(q.options[item])}</span></li>`);
          });
          out.push('</ol>');
        } else if (type === 'match') {
          const rows = Math.max(q.termOrder.length, q.defOrder.length);
          out.push('<table class="td-match"><thead><tr><th colspan="2">Columna A</th><th class="td-gap"></th><th colspan="2">Columna B</th></tr></thead><tbody>');
          for (let r = 0; r < rows; r++) {
            const t = q.termOrder[r];
            const d = q.defOrder[r];
            out.push(
              '<tr>' +
                (t === undefined ? '<td></td><td></td>' : `<td class="td-mnum">${r + 1}.</td><td class="td-mterm">${escRich(q.terms[t])}</td>`) +
                '<td class="td-gap"></td>' +
                (d === undefined
                  ? '<td></td><td></td>'
                  : `<td class="td-mblank"><span class="td-letter">${esc(letterLabel(r, f.letterStyle))}</span><span class="td-mline"></span></td><td class="td-mdef">${escRich(q.defs[d])}</td>`) +
                '</tr>'
            );
          }
          out.push('</tbody></table>');
        } else {
          const lines = q.space || openLines;
          const style = q.spaceStyle || f.openStyle;
          if (q.options.length) {
            // Sub-preguntas a), b)… cada una con su espacio.
            out.push('<ol class="td-subq">');
            q.options.forEach((o, j) => {
              out.push(
                `<li><div class="td-subq-text"><span class="td-letter">${esc(letterLabel(j, f.letterStyle))}</span><span>${escRich(o)}</span></div>` +
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
.testdoc th, .testdoc td { white-space: normal; position: static; text-transform: none; letter-spacing: normal; font-size: inherit; color: #000; background: none; border-bottom: 0; padding: 0; text-align: left; }
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
.td-math .katex { font-size: 1.08em; }
.td-math-raw { font-family: "Cambria Math", "STIX Two Math", serif; background: #f2f2f2; padding: 0 0.3em; border-radius: 0.2em; }
.td-formtag { margin-left: auto; border: 0.5mm solid #000; border-radius: 1.5mm; padding: 1mm 3mm; text-align: center; font-size: 0.8em; line-height: 1.1; text-transform: uppercase; }
.td-formtag b { display: block; font-size: 2em; }
.td-blank { display: inline-block; border-bottom: 0.3mm solid #000; height: 1em; margin: 0 1mm; vertical-align: baseline; }
.td-bank { display: flex; flex-wrap: wrap; justify-content: center; gap: 1mm 7mm; border: 0.3mm solid #000; border-radius: 1mm; padding: 2mm 4mm; margin: 0 0 3mm; font-weight: bold; break-inside: avoid; }
.td-order { list-style: none; margin: 1.5mm 0 0 8mm; padding: 0; }
.td-order li { display: flex; align-items: center; gap: 2mm; margin: 1mm 0; break-inside: avoid; }
.td-orderbox { flex: none; width: 7mm; height: 6mm; border: 0.3mm solid #000; border-radius: 0.8mm; }
.td-match { width: 100%; border-collapse: collapse; margin-top: 1mm; }
.td-match th { text-align: left; font-size: 0.95em; font-weight: bold; border-bottom: 0.3mm solid #000; padding: 0 1mm 1mm; }
.td-match td { vertical-align: top; padding: 1.2mm 1mm; }
.td-match tr { break-inside: avoid; }
.td-match .td-mnum { width: 7mm; font-weight: bold; }
.td-match .td-mterm { width: 34%; }
.td-match .td-gap { width: 5mm; }
.td-match .td-mblank { width: 20mm; white-space: nowrap; }
.td-mline { display: inline-block; width: 10mm; border-bottom: 0.3mm solid #000; height: 1em; }
.td-keydoc h2.td-keyh { font-size: 1.05em; margin: 4mm 0 1.5mm; }
.td-keytable { border-collapse: collapse; width: 100%; font-size: 0.95em; break-inside: auto; }
.td-keytable th, .td-keytable td { border: 0.25mm solid #000; padding: 0.8mm 2mm; text-align: left; color: #000; }
.td-keytable th { background: #e8e8e8; }
.td-keytable td.num { width: 10mm; text-align: right; font-weight: bold; }
.td-keytable tr { break-inside: avoid; }
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
    buildForms,
    arrangeQuestion,
    renderAnswerKeyHTML,
    answerText,
    blanksOf,
    FORM_LETTERS,
    setMathRenderer,
    hasMath,
    splitMath,
  };
});
