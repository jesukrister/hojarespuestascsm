/*
 * Geometría de la hoja de respuestas.
 *
 * Todas las medidas están en milímetros, con el origen en la esquina
 * superior izquierda de la hoja. El mismo cálculo lo usan el generador de la
 * hoja (para dibujarla) y el lector (para saber dónde buscar cada burbuja),
 * así que ambos siempre coinciden.
 *
 * Formatos: una hoja de respuestas puede ocupar la página completa, media
 * página (2 por página) o un cuarto de página (4 por página). En los formatos
 * pequeños las marcas y textos se reducen proporcionalmente, pero las
 * burbujas conservan un tamaño mínimo para que se puedan rellenar y leer.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SheetLayout = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const PAPERS = {
    carta: { id: 'carta', label: 'Carta (216 × 279 mm)', width: 215.9, height: 279.4 },
    a4: { id: 'a4', label: 'A4 (210 × 297 mm)', width: 210, height: 297 },
    oficio: { id: 'oficio', label: 'Oficio (216 × 330 mm)', width: 215.9, height: 330.2 },
  };
  const PAPER_IDS = ['carta', 'a4', 'oficio'];

  // k: factor de escala de marcas y textos. checksumKey distingue el formato
  // en el código impreso (la hoja completa conserva el valor original).
  const FORMATS = {
    full: { id: 'full', label: 'Hoja completa (1 por página)', perPage: 1, k: 1, checksumKey: 10 },
    half: { id: 'half', label: 'Media hoja (2 por página)', perPage: 2, k: 0.8, checksumKey: 5 },
    quarter: { id: 'quarter', label: 'Cuarto de hoja (4 por página)', perPage: 4, k: 0.65, checksumKey: 12 },
  };
  const FORMAT_IDS = ['full', 'half', 'quarter'];

  const LIMITS = {
    minQuestions: 1,
    maxQuestions: 120,
    minChoices: 2,
    maxChoices: 6,
    maxIdDigits: 10,
  };

  const CHOICE_LABELS = ['A', 'B', 'C', 'D', 'E', 'F'];

  // Medidas base (hoja completa). En formatos pequeños se multiplican por k.
  const MARKER_SIZE = 10; // marcas de registro (cuadrados negros de las esquinas)
  const MARKER_INSET = 15; // distancia del centro de la marca al borde de la hoja
  const ORIENT_SIZE = 5; // marca de orientación, a la derecha de la marca superior izquierda
  const ORIENT_OFFSET = 13;
  const SIDE_MARK_SIZE = 5; // marcas laterales a 1/3 y 2/3 de la altura (hojas curvadas)
  const SIDE_MARK_X = 9;
  const CODE_BITS = 20; // código de configuración entre las marcas inferiores
  const CODE_CELL = 3.5;
  const CODE_PITCH = 4.5;
  const SIDE_MARGIN = 14;
  const HEADER_TOP = 25;
  const ID_PITCH = 5.4; // bloque de identificación: una fila por dígito, burbujas 0–9
  const ID_R = 2.0;
  const ID_LABEL_W = 9;

  // Grilla de respuestas (no se escala: las burbujas deben poder rellenarse).
  const NUM_WIDTH = 8;
  const COL_GAP = 5;
  const GROUP_SIZE = 5;
  const GROUP_GAP = 1.8;
  const MAX_PITCH = 7;
  const MIN_PITCH = 4.4;

  function clampInt(v, min, max, fallback) {
    const n = Math.round(Number(v));
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  /** Configuración que define la estructura de la hoja (lo que el lector necesita saber). */
  function normalizeConfig(cfg) {
    cfg = cfg || {};
    return {
      paper: PAPERS[cfg.paper] ? cfg.paper : 'carta',
      numQuestions: clampInt(cfg.numQuestions, LIMITS.minQuestions, LIMITS.maxQuestions, 30),
      numChoices: clampInt(cfg.numChoices, LIMITS.minChoices, LIMITS.maxChoices, 5),
      idDigits: clampInt(cfg.idDigits, 0, LIMITS.maxIdDigits, 0),
      format: FORMATS[cfg.format] ? cfg.format : 'full',
    };
  }

  /** Campos de escritura del encabezado (no afectan la lectura). */
  function normalizeFields(fields) {
    const f = fields || {};
    return { curso: f.curso !== false, fecha: f.fecha !== false, rut: f.rut !== false };
  }

  /* ---------- Código de configuración (20 bits) ----------
   * bits 0–6   número de preguntas (1–120)
   * bits 7–9   alternativas − 2    (0–4)
   * bits 10–13 dígitos de ID       (0–10)
   * bits 14–15 tamaño de papel     (índice en PAPER_IDS)
   * bits 16–19 control: XOR de los cuatro nibbles anteriores XOR una clave
   *            que depende del formato (hoja completa, media o cuarto).
   */
  function checksum(value, key) {
    return ((value & 15) ^ ((value >> 4) & 15) ^ ((value >> 8) & 15) ^ ((value >> 12) & 15) ^ key) & 15;
  }

  function encodeConfig(cfg) {
    const c = normalizeConfig(cfg);
    const value =
      c.numQuestions |
      ((c.numChoices - 2) << 7) |
      (c.idDigits << 10) |
      (PAPER_IDS.indexOf(c.paper) << 14);
    const full = value | (checksum(value, FORMATS[c.format].checksumKey) << 16);
    const bits = [];
    for (let i = 0; i < CODE_BITS; i++) bits.push((full >> i) & 1);
    return bits;
  }

  /** Devuelve la configuración codificada o null si el control no coincide. */
  function decodeConfig(bits) {
    if (!bits || bits.length !== CODE_BITS) return null;
    let full = 0;
    for (let i = 0; i < CODE_BITS; i++) if (bits[i]) full |= 1 << i;
    const value = full & 0xffff;
    const format = FORMAT_IDS.find((f) => checksum(value, FORMATS[f].checksumKey) === full >> 16);
    if (!format) return null;
    const numQuestions = value & 127;
    const numChoices = ((value >> 7) & 7) + 2;
    const idDigits = (value >> 10) & 15;
    const paper = PAPER_IDS[(value >> 14) & 3];
    if (
      !paper ||
      numQuestions < LIMITS.minQuestions ||
      numQuestions > LIMITS.maxQuestions ||
      numChoices > LIMITS.maxChoices ||
      idDigits > LIMITS.maxIdDigits
    ) {
      return null;
    }
    return { paper, numQuestions, numChoices, idDigits, format };
  }

  function sameStructure(a, b) {
    const x = normalizeConfig(a);
    const y = normalizeConfig(b);
    return (
      x.paper === y.paper &&
      x.numQuestions === y.numQuestions &&
      x.numChoices === y.numChoices &&
      x.idDigits === y.idDigits &&
      x.format === y.format
    );
  }

  /* ---------- Fila de la prueba (A, B, C, D) ----------
   * Tres celdas en el margen izquierdo, a media altura, con un código de
   * paridad par: un error en una celda da un código inválido (nunca otra fila).
   * La fila A no imprime celdas, así que las hojas anteriores se leen como A.
   */
  const FORM_CODES = [
    [0, 0, 0],
    [0, 1, 1],
    [1, 0, 1],
    [1, 1, 0],
  ];
  const FORM_LETTERS = ['A', 'B', 'C', 'D'];

  function decodeForm(bits) {
    if (!bits || bits.length !== 3) return null;
    const i = FORM_CODES.findIndex((c) => c.every((b, j) => b === bits[j]));
    return i >= 0 ? i : null;
  }

  function normalizeForm(v) {
    const n = Math.round(Number(v));
    return Number.isFinite(n) && n >= 0 && n < FORM_CODES.length ? n : null;
  }

  /** Tamaño de una hoja de respuestas (vertical) según papel y formato. */
  function pieceSize(paperId, formatId) {
    const p = PAPERS[paperId];
    if (formatId === 'half') return { width: p.height / 2, height: p.width };
    if (formatId === 'quarter') return { width: p.width / 2, height: p.height / 2 };
    return { width: p.width, height: p.height };
  }

  /**
   * Cómo se ubican las hojas de respuestas en la página impresa.
   * Media hoja: página horizontal con dos hojas lado a lado.
   * Cuarto de hoja: página vertical con una grilla de 2 × 2.
   */
  function pageTiling(paperId, formatId) {
    const p = PAPERS[PAPERS[paperId] ? paperId : 'carta'];
    const W = p.width;
    const H = p.height;
    if (formatId === 'half') {
      return {
        width: H,
        height: W,
        landscape: true,
        pieces: [{ x: 0, y: 0 }, { x: H / 2, y: 0 }],
        cuts: [{ x1: H / 2, y1: 0, x2: H / 2, y2: W }],
      };
    }
    if (formatId === 'quarter') {
      return {
        width: W,
        height: H,
        landscape: false,
        pieces: [{ x: 0, y: 0 }, { x: W / 2, y: 0 }, { x: 0, y: H / 2 }, { x: W / 2, y: H / 2 }],
        cuts: [
          { x1: W / 2, y1: 0, x2: W / 2, y2: H },
          { x1: 0, y1: H / 2, x2: W, y2: H / 2 },
        ],
      };
    }
    return { width: W, height: H, landscape: false, pieces: [{ x: 0, y: 0 }], cuts: [] };
  }

  function rowsThatFit(height, pitch) {
    let rows = 0;
    while (true) {
      const next = rows + 1;
      const h = next * pitch + Math.floor((next - 1) / GROUP_SIZE) * GROUP_GAP;
      if (h > height + 1e-9) return rows;
      rows = next;
    }
  }

  function rowOffset(row, pitch) {
    return row * pitch + Math.floor(row / GROUP_SIZE) * GROUP_GAP + pitch / 2;
  }

  /**
   * Calcula la posición de todos los elementos de la hoja.
   * Lanza un Error si la cantidad de preguntas no cabe en el formato elegido.
   * @param cfg { paper, numQuestions, numChoices, idDigits, format, fields? }
   */
  function computeLayout(cfg) {
    const c = normalizeConfig(cfg);
    const fieldsOn = normalizeFields(cfg && cfg.fields);
    const paper = PAPERS[c.paper];
    const format = FORMATS[c.format];
    const k = format.k;
    const { width: W, height: H } = pieceSize(c.paper, c.format);
    const m = MARKER_INSET * k;

    const markerSize = MARKER_SIZE * k;
    const markers = [
      { x: m, y: m },
      { x: W - m, y: m },
      { x: W - m, y: H - m },
      { x: m, y: H - m },
    ];
    const orientOffset = ORIENT_OFFSET * k;
    const orientSize = ORIENT_SIZE * k;
    const orientation = { x: m + orientOffset, y: m, size: orientSize };
    // En formatos pequeños las marcas laterales no se acercan tanto al borde
    // (el corte con tijera o guillotina no es exacto).
    const sideX = k === 1 ? SIDE_MARK_X : Math.max(SIDE_MARK_X * k, 6.5);
    const sideSize = SIDE_MARK_SIZE * k;
    const sideMarks = [];
    for (let level = 1; level <= 2; level++) {
      const y = m + ((H - 2 * m) * level) / 3;
      sideMarks.push({ x: sideX, y, size: sideSize, level, side: 'left' });
      sideMarks.push({ x: W - sideX, y, size: sideSize, level, side: 'right' });
    }

    // Celdas de la fila (siempre en la misma posición; sólo se imprimen las activas).
    const form = normalizeForm(cfg && cfg.form);
    const formBits = FORM_CODES[form === null ? 0 : form];
    const formPitch = 7.5 * k;
    const formCells = formBits.map((bit, i) => ({ x: sideX, y: H / 2 + (i - 1) * formPitch, size: CODE_CELL * k, bit }));

    const bits = encodeConfig(c);
    const codePitch = CODE_PITCH * k;
    const codeStart = W / 2 - ((CODE_BITS - 1) * codePitch) / 2;
    const codeCells = bits.map((bit, i) => ({ x: codeStart + i * codePitch, y: H - m, size: CODE_CELL * k, bit }));

    const left = SIDE_MARGIN * k;
    const right = W - SIDE_MARGIN * k;
    const headerTop = HEADER_TOP * k;

    // ----- Encabezado -----
    let idBlock = null;
    let fieldsRight = right;
    let headerH = 27 * k;
    if (c.idDigits > 0) {
      const ik = Math.max(k, 0.8);
      const idPitch = ID_PITCH * ik;
      const idR = ID_R * ik;
      const labelW = ID_LABEL_W * k;
      const blockW = labelW + 10 * idPitch + 2 * k;
      const blockH = 8 * k + c.idDigits * idPitch + 1.5 * k;
      const x0 = right - blockW;
      const y0 = headerTop;
      const rows = [];
      for (let d = 0; d < c.idDigits; d++) {
        const y = y0 + 8 * k + d * idPitch + idPitch / 2;
        const bubbles = [];
        for (let v = 0; v < 10; v++) {
          bubbles.push({ x: x0 + labelW + idPitch * (v + 0.5), y, r: idR, label: String(v) });
        }
        rows.push({ index: d, labelX: x0 + labelW - 1.5 * k, y, bubbles });
      }
      idBlock = { x: x0, y: y0, w: blockW, h: blockH, rows };
      fieldsRight = x0 - 6 * k;
      headerH = Math.max(headerH, blockH);
    }
    const fw = fieldsRight - left;
    const fields = [{ label: 'Nombre', x: left, y: headerTop + 6 * k, x2: fieldsRight }];
    const second = [];
    if (fieldsOn.curso) second.push('Curso');
    if (fieldsOn.fecha) second.push('Fecha');
    if (second.length === 2) {
      fields.push({ label: 'Curso', x: left, y: headerTop + 15 * k, x2: left + fw * 0.55 });
      fields.push({ label: 'Fecha', x: left + fw * 0.6, y: headerTop + 15 * k, x2: fieldsRight });
    } else if (second.length === 1) {
      fields.push({ label: second[0], x: left, y: headerTop + 15 * k, x2: left + fw * 0.55 });
    }
    if (fieldsOn.rut && (c.idDigits === 0 || fw > 60 * k)) {
      const y = second.length ? headerTop + 24 * k : headerTop + 15 * k;
      fields.push({ label: 'RUT', x: left, y, x2: left + fw * 0.55 });
    }

    const instructionsY = headerTop + headerH + 5 * k;
    const areaW = right - left;
    // Espacio libre alrededor de la grilla: el lector verifica que encima de
    // la primera fila y debajo de la última no haya contornos de burbujas.
    const gridTopFor = (p) => instructionsY + (k === 1 ? 8 : Math.max(8 * k, 0.86 * p + 2.2));
    const gridBottomFor = (p) => (k === 1 ? H - 24 : H - Math.max(24 * k, 16.75 * k + 0.86 * p + 1.4));
    const colGap = k === 1 ? COL_GAP : Math.max(3.5, COL_GAP * k);

    // ----- Grilla de preguntas: se busca el mayor espaciado que quepa -----
    let chosen = null;
    for (let p = MAX_PITCH; p >= MIN_PITCH - 1e-9; p = Math.round((p - 0.1) * 100) / 100) {
      const gridTop = gridTopFor(p);
      const areaH = gridBottomFor(p) - gridTop;
      const colW = NUM_WIDTH + c.numChoices * p;
      const colsFit = Math.floor((areaW + colGap) / (colW + colGap));
      if (colsFit < 1) continue;
      const maxRows = rowsThatFit(areaH, p);
      if (maxRows < 1) continue;
      const colsNeeded = Math.ceil(c.numQuestions / maxRows);
      if (colsNeeded <= colsFit) {
        chosen = { pitch: p, colW, cols: colsNeeded, gridTop, gridBottom: gridBottomFor(p) };
        break;
      }
    }
    if (!chosen) {
      const where = c.format === 'full' ? `papel ${paper.label}` : `el formato "${format.label}" en papel ${paper.label}`;
      throw new Error(
        `No caben ${c.numQuestions} preguntas con ${c.numChoices} alternativas en ${where}. ` +
          (c.format === 'full'
            ? 'Reduzca preguntas, alternativas o dígitos de identificación, o use un papel más grande.'
            : 'Use un formato más grande (menos hojas por página) o reduzca preguntas, alternativas o dígitos de identificación.')
      );
    }

    const pitch = chosen.pitch;
    const gridTop = chosen.gridTop;
    const gridBottom = chosen.gridBottom;
    const r = Math.min(2.4, pitch * 0.36);
    const cols = chosen.cols;
    const rowsPerCol = Math.ceil(c.numQuestions / cols);
    const totalFixed = cols * chosen.colW;
    const gap = cols > 1 ? Math.min((areaW - totalFixed) / (cols - 1), 22) : 0;
    const blockW = totalFixed + gap * (cols - 1);
    const startX = left + (areaW - blockW) / 2;

    const columns = [];
    for (let j = 0; j < cols; j++) {
      const rowsHere = Math.min(rowsPerCol, c.numQuestions - j * rowsPerCol);
      const lastRow = rowsHere - 1;
      columns.push({
        x: startX + j * (chosen.colW + gap),
        y: gridTop,
        w: chosen.colW,
        h: rowOffset(lastRow, pitch) + pitch / 2,
        firstQuestion: j * rowsPerCol,
        count: rowsHere,
      });
    }

    const questions = [];
    for (let q = 0; q < c.numQuestions; q++) {
      const col = Math.floor(q / rowsPerCol);
      const row = q % rowsPerCol;
      const x0 = columns[col].x;
      const y = gridTop + rowOffset(row, pitch);
      const bubbles = [];
      for (let j = 0; j < c.numChoices; j++) {
        bubbles.push({ x: x0 + NUM_WIDTH + pitch * (j + 0.5), y, r, label: CHOICE_LABELS[j] });
      }
      questions.push({ index: q, number: q + 1, column: col, row, labelX: x0 + NUM_WIDTH - 1.2, y, bubbles });
    }

    return {
      config: c,
      paper,
      format,
      scale: k,
      width: W,
      height: H,
      markers,
      markerSize,
      orientation,
      sideMarks,
      codeCells,
      formCells,
      form,
      header: {
        top: headerTop,
        height: headerH,
        titleX: m + orientOffset + orientSize / 2 + 6 * k,
        titleY: m + 1.5 * k,
        fields,
        idBlock,
      },
      instructionsY,
      grid: { top: gridTop, bottom: gridBottom, pitch, r, cols, rowsPerCol, columns, choiceLabels: CHOICE_LABELS.slice(0, c.numChoices) },
      questions,
      idRows: idBlock ? idBlock.rows : [],
      footerY: H - 7 * k,
    };
  }

  return {
    PAPERS,
    PAPER_IDS,
    FORMATS,
    FORMAT_IDS,
    LIMITS,
    CHOICE_LABELS,
    CODE_BITS,
    FORM_CODES,
    FORM_LETTERS,
    decodeForm,
    normalizeForm,
    normalizeConfig,
    normalizeFields,
    encodeConfig,
    decodeConfig,
    sameStructure,
    pieceSize,
    pageTiling,
    computeLayout,
  };
});
