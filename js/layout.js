/*
 * Geometría de la hoja de respuestas.
 *
 * Todas las medidas están en milímetros, con el origen en la esquina
 * superior izquierda del papel. El mismo cálculo lo usan el generador de la
 * hoja (para dibujarla) y el lector (para saber dónde buscar cada burbuja),
 * así que ambos siempre coinciden.
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

  const LIMITS = {
    minQuestions: 1,
    maxQuestions: 120,
    minChoices: 2,
    maxChoices: 6,
    maxIdDigits: 10,
  };

  const CHOICE_LABELS = ['A', 'B', 'C', 'D', 'E', 'F'];

  // Marcas de registro (cuadrados negros en las esquinas).
  const MARKER_SIZE = 10;
  const MARKER_INSET = 15; // distancia del centro de la marca al borde del papel
  // Marca de orientación: cuadrado pequeño a la derecha de la marca superior izquierda.
  const ORIENT_SIZE = 5;
  const ORIENT_OFFSET = 13;
  // Marcas laterales a 1/3 y 2/3 de la altura: permiten corregir hojas algo curvadas.
  const SIDE_MARK_SIZE = 5;
  const SIDE_MARK_X = 9;
  // Código de configuración impreso entre las marcas inferiores.
  const CODE_BITS = 20;
  const CODE_CELL = 3.5;
  const CODE_PITCH = 4.5;

  // Grilla de respuestas.
  const SIDE_MARGIN = 14;
  const NUM_WIDTH = 8;
  const COL_GAP = 5;
  const GROUP_SIZE = 5;
  const GROUP_GAP = 1.8;
  const MAX_PITCH = 7;
  const MIN_PITCH = 4.4;

  // Bloque de identificación (una fila por dígito, burbujas 0–9).
  const ID_PITCH = 5.4;
  const ID_R = 2.0;
  const ID_LABEL_W = 9;

  const HEADER_TOP = 25;

  function clampInt(v, min, max, fallback) {
    const n = Math.round(Number(v));
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  function normalizeConfig(cfg) {
    cfg = cfg || {};
    return {
      paper: PAPERS[cfg.paper] ? cfg.paper : 'carta',
      numQuestions: clampInt(cfg.numQuestions, LIMITS.minQuestions, LIMITS.maxQuestions, 30),
      numChoices: clampInt(cfg.numChoices, LIMITS.minChoices, LIMITS.maxChoices, 5),
      idDigits: clampInt(cfg.idDigits, 0, LIMITS.maxIdDigits, 0),
    };
  }

  /* ---------- Código de configuración (20 bits) ----------
   * bits 0–6   número de preguntas (1–120)
   * bits 7–9   alternativas − 2    (0–4)
   * bits 10–13 dígitos de ID       (0–10)
   * bits 14–15 tamaño de papel     (índice en PAPER_IDS)
   * bits 16–19 control: XOR de los cuatro nibbles anteriores XOR 0b1010
   */
  function checksum(value) {
    return ((value & 15) ^ ((value >> 4) & 15) ^ ((value >> 8) & 15) ^ ((value >> 12) & 15) ^ 10) & 15;
  }

  function encodeConfig(cfg) {
    const c = normalizeConfig(cfg);
    const value =
      c.numQuestions |
      ((c.numChoices - 2) << 7) |
      (c.idDigits << 10) |
      (PAPER_IDS.indexOf(c.paper) << 14);
    const full = value | (checksum(value) << 16);
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
    if (checksum(value) !== (full >> 16)) return null;
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
    return { paper, numQuestions, numChoices, idDigits };
  }

  function sameStructure(a, b) {
    const x = normalizeConfig(a);
    const y = normalizeConfig(b);
    return (
      x.paper === y.paper &&
      x.numQuestions === y.numQuestions &&
      x.numChoices === y.numChoices &&
      x.idDigits === y.idDigits
    );
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
   * Lanza un Error si la cantidad de preguntas no cabe en el papel elegido.
   */
  function computeLayout(cfg) {
    const c = normalizeConfig(cfg);
    const paper = PAPERS[c.paper];
    const W = paper.width;
    const H = paper.height;
    const m = MARKER_INSET;

    const markers = [
      { x: m, y: m },
      { x: W - m, y: m },
      { x: W - m, y: H - m },
      { x: m, y: H - m },
    ];
    const orientation = { x: m + ORIENT_OFFSET, y: m, size: ORIENT_SIZE };
    const sideMarks = [];
    for (let level = 1; level <= 2; level++) {
      const y = m + ((H - 2 * m) * level) / 3;
      sideMarks.push({ x: SIDE_MARK_X, y, size: SIDE_MARK_SIZE, level, side: 'left' });
      sideMarks.push({ x: W - SIDE_MARK_X, y, size: SIDE_MARK_SIZE, level, side: 'right' });
    }

    const bits = encodeConfig(c);
    const codeStart = W / 2 - ((CODE_BITS - 1) * CODE_PITCH) / 2;
    const codeCells = bits.map((bit, i) => ({ x: codeStart + i * CODE_PITCH, y: H - m, size: CODE_CELL, bit }));

    const left = SIDE_MARGIN;
    const right = W - SIDE_MARGIN;

    // ----- Encabezado -----
    let idBlock = null;
    let fieldsRight = right;
    let headerH = 27;
    if (c.idDigits > 0) {
      const blockW = ID_LABEL_W + 10 * ID_PITCH + 2;
      const blockH = 8 + c.idDigits * ID_PITCH + 1.5;
      const x0 = right - blockW;
      const y0 = HEADER_TOP;
      const rows = [];
      for (let d = 0; d < c.idDigits; d++) {
        const y = y0 + 8 + d * ID_PITCH + ID_PITCH / 2;
        const bubbles = [];
        for (let v = 0; v < 10; v++) {
          bubbles.push({ x: x0 + ID_LABEL_W + ID_PITCH * (v + 0.5), y, r: ID_R, label: String(v) });
        }
        rows.push({ index: d, labelX: x0 + ID_LABEL_W - 1.5, y, bubbles });
      }
      idBlock = { x: x0, y: y0, w: blockW, h: blockH, rows };
      fieldsRight = x0 - 6;
      headerH = Math.max(headerH, blockH);
    }
    const fields = [
      { label: 'Nombre', x: left, y: HEADER_TOP + 6, x2: fieldsRight },
      { label: 'Curso', x: left, y: HEADER_TOP + 15, x2: left + (fieldsRight - left) * 0.55 },
      { label: 'Fecha', x: left + (fieldsRight - left) * 0.6, y: HEADER_TOP + 15, x2: fieldsRight },
    ];
    if (c.idDigits === 0 || fieldsRight - left > 60) {
      fields.push({ label: 'RUT', x: left, y: HEADER_TOP + 24, x2: left + (fieldsRight - left) * 0.55 });
    }

    const instructionsY = HEADER_TOP + headerH + 5;
    const gridTop = instructionsY + 8;
    const gridBottom = H - 24;
    const areaW = right - left;
    const areaH = gridBottom - gridTop;

    // ----- Grilla de preguntas: se busca el mayor espaciado que quepa -----
    let chosen = null;
    for (let p = MAX_PITCH; p >= MIN_PITCH - 1e-9; p = Math.round((p - 0.1) * 100) / 100) {
      const colW = NUM_WIDTH + c.numChoices * p;
      const colsFit = Math.floor((areaW + COL_GAP) / (colW + COL_GAP));
      if (colsFit < 1) continue;
      const maxRows = rowsThatFit(areaH, p);
      if (maxRows < 1) continue;
      const colsNeeded = Math.ceil(c.numQuestions / maxRows);
      if (colsNeeded <= colsFit) {
        chosen = { pitch: p, colW, cols: colsNeeded };
        break;
      }
    }
    if (!chosen) {
      throw new Error(
        `No caben ${c.numQuestions} preguntas con ${c.numChoices} alternativas en papel ${paper.label}. ` +
          'Reduzca preguntas, alternativas o dígitos de identificación, o use un papel más grande.'
      );
    }

    const pitch = chosen.pitch;
    const r = Math.min(2.4, pitch * 0.36);
    const cols = chosen.cols;
    const rowsPerCol = Math.ceil(c.numQuestions / cols);
    const totalFixed = cols * chosen.colW;
    const gap = cols > 1 ? Math.min((areaW - totalFixed) / (cols - 1), 22) : 0;
    const blockW = totalFixed + gap * (cols - 1);
    const startX = left + (areaW - blockW) / 2;

    const columns = [];
    for (let k = 0; k < cols; k++) {
      const rowsHere = Math.min(rowsPerCol, c.numQuestions - k * rowsPerCol);
      const lastRow = rowsHere - 1;
      columns.push({
        x: startX + k * (chosen.colW + gap),
        y: gridTop,
        w: chosen.colW,
        h: rowOffset(lastRow, pitch) + pitch / 2,
        firstQuestion: k * rowsPerCol,
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
      for (let k = 0; k < c.numChoices; k++) {
        bubbles.push({ x: x0 + NUM_WIDTH + pitch * (k + 0.5), y, r, label: CHOICE_LABELS[k] });
      }
      questions.push({ index: q, number: q + 1, column: col, row, labelX: x0 + NUM_WIDTH - 1.2, y, bubbles });
    }

    return {
      config: c,
      paper,
      width: W,
      height: H,
      markers,
      markerSize: MARKER_SIZE,
      orientation,
      sideMarks,
      codeCells,
      header: { top: HEADER_TOP, height: headerH, titleX: m + ORIENT_OFFSET + ORIENT_SIZE / 2 + 6, titleY: m + 1.5, fields, idBlock },
      instructionsY,
      grid: { top: gridTop, bottom: gridBottom, pitch, r, cols, rowsPerCol, columns, choiceLabels: CHOICE_LABELS.slice(0, c.numChoices) },
      questions,
      idRows: idBlock ? idBlock.rows : [],
      footerY: H - 7,
    };
  }

  return {
    PAPERS,
    PAPER_IDS,
    LIMITS,
    CHOICE_LABELS,
    CODE_BITS,
    normalizeConfig,
    encodeConfig,
    decodeConfig,
    sameStructure,
    computeLayout,
  };
});
