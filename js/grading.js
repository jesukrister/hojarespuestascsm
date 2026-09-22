/*
 * Corrección de respuestas y cálculo de nota (escala chilena 1,0–7,0 por defecto).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Grading = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DEFAULT_SCORING = {
    pointsCorrect: 1,
    penaltyWrong: 0,
    exigencia: 60, // % del puntaje máximo para obtener la nota de aprobación
    gradeMin: 1,
    gradeMax: 7,
    gradePass: 4,
  };

  /** Nota según puntaje, con escala de exigencia. Redondeada a un decimal. */
  function computeGrade(score, maxScore, scoring) {
    const s = Object.assign({}, DEFAULT_SCORING, scoring || {});
    if (!(maxScore > 0)) return null;
    const e = Math.min(0.99, Math.max(0.01, s.exigencia / 100));
    const cut = e * maxScore;
    let g;
    if (score < cut) g = s.gradeMin + ((s.gradePass - s.gradeMin) * score) / cut;
    else g = s.gradePass + ((s.gradeMax - s.gradePass) * (score - cut)) / (maxScore - cut);
    g = Math.min(s.gradeMax, Math.max(s.gradeMin, g));
    return Math.round(g * 10 + 1e-9) / 10;
  }

  /**
   * @param answers arreglo con { marked: [índices] } por pregunta
   * @param key     arreglo con el índice correcto por pregunta, o null (pregunta sin clave / anulada)
   * @param scoring ver DEFAULT_SCORING
   * Estados: correct, wrong, blank, multiple (más de una marca: cuenta como incorrecta), excluded.
   */
  function gradeAnswers(answers, key, scoring) {
    const s = Object.assign({}, DEFAULT_SCORING, scoring || {});
    const items = [];
    let correct = 0, wrong = 0, blank = 0, multiple = 0, excluded = 0;
    for (let i = 0; i < answers.length; i++) {
      const marked = (answers[i] && answers[i].marked) || [];
      const k = key && key[i] !== undefined ? key[i] : null;
      let status;
      if (k === null || k === undefined || k < 0) {
        status = 'excluded';
        excluded++;
      } else if (marked.length === 0) {
        status = 'blank';
        blank++;
      } else if (marked.length > 1) {
        status = 'multiple';
        multiple++;
      } else if (marked[0] === k) {
        status = 'correct';
        correct++;
      } else {
        status = 'wrong';
        wrong++;
      }
      items.push({ status, marked, key: k });
    }
    const counted = answers.length - excluded;
    const maxScore = counted * s.pointsCorrect;
    const raw = correct * s.pointsCorrect - (wrong + multiple) * s.penaltyWrong;
    const score = Math.max(0, Math.round(raw * 100) / 100);
    const percent = maxScore > 0 ? Math.round((score / maxScore) * 1000) / 10 : 0;
    return {
      items,
      correct,
      wrong,
      blank,
      multiple,
      excluded,
      score,
      maxScore,
      percent,
      grade: computeGrade(score, maxScore, s),
    };
  }

  /** Análisis por pregunta sobre varios resultados: % de acierto y distribución de respuestas. */
  function itemAnalysis(allAnswers, key, numChoices) {
    const n = key.length;
    const stats = [];
    for (let q = 0; q < n; q++) {
      const counts = new Array(numChoices).fill(0);
      let blank = 0, multiple = 0, correct = 0;
      for (const answers of allAnswers) {
        const m = (answers[q] && answers[q].marked) || [];
        if (m.length === 0) blank++;
        else if (m.length > 1) multiple++;
        else {
          counts[m[0]]++;
          if (m[0] === key[q]) correct++;
        }
      }
      const total = allAnswers.length;
      stats.push({
        question: q + 1,
        key: key[q],
        counts,
        blank,
        multiple,
        correctPct: total && key[q] !== null && key[q] >= 0 ? Math.round((correct / total) * 1000) / 10 : null,
      });
    }
    return stats;
  }

  /* ------------------------------------------------------------------ */
  /* Objetivos de aprendizaje (OA)                                        */
  /* ------------------------------------------------------------------ */

  const DEFAULT_LEVELS = { achieved: 75, partial: 50 };
  const LEVEL_LABELS = { L: 'Logrado', ML: 'Medianamente logrado', NL: 'No logrado' };

  /** Interpreta "1-4, 7, 9 a 11" como índices de pregunta (base 0). */
  function parseRanges(text, n) {
    const out = [];
    const bad = [];
    const cleaned = String(text)
      .replace(/\bdel?\b/gi, ' ')
      .replace(/\b(preguntas?|p)\b\.?/gi, ' ')
      .replace(/\s+(a|al|hasta)\s+/gi, '-')
      .replace(/[–—]/g, '-');
    for (const part of cleaned.split(/[,;y\s]+/)) {
      const t = part.trim();
      if (!t) continue;
      const m = t.match(/^(\d+)(?:-(\d+))?$/);
      if (!m) {
        bad.push(t);
        continue;
      }
      let a = parseInt(m[1], 10);
      let b = m[2] ? parseInt(m[2], 10) : a;
      if (b < a) [a, b] = [b, a];
      for (let q = a; q <= b; q++) {
        if (q >= 1 && q <= n) out.push(q - 1);
        else bad.push(String(q));
      }
    }
    return { questions: Array.from(new Set(out)).sort((x, y) => x - y), bad };
  }

  /**
   * Una línea por objetivo:  "OA12: 1-4"  ·  "OA 13 Comprensión lectora: 5, 6, 9"
   * El nombre es lo que está antes de ":" (o "=", tabulación, "->").
   * @returns { objectives: [{ name, questions }], errors: [texto], unassigned: [índices], repeated: [índices] }
   */
  function parseObjectives(text, n) {
    const objectives = [];
    const errors = [];
    const byName = new Map();
    String(text || '')
      .split(/\r?\n/)
      .forEach((raw, i) => {
        const line = raw.trim();
        if (!line) return;
        let m = line.match(/^(.+?)\s*(?::|=|->|→|\t)\s*(.+)$/);
        if (!m) m = line.match(/^(\S+(?:\s+\S+)*?)\s+((?:p\.?\s*)?\d[\d\s,;\-–—ay]*)$/i);
        if (!m) {
          errors.push(`Línea ${i + 1}: escriba el objetivo y sus preguntas, por ejemplo "OA12: 1-4".`);
          return;
        }
        const name = m[1].trim();
        const { questions, bad } = parseRanges(m[2], n);
        if (bad.length) errors.push(`Línea ${i + 1} (${name}): no se entiende o está fuera de rango: ${bad.join(', ')}.`);
        if (!questions.length) return;
        const key = name.toLowerCase();
        if (byName.has(key)) {
          const o = byName.get(key);
          o.questions = Array.from(new Set(o.questions.concat(questions))).sort((x, y) => x - y);
        } else {
          const o = { name, questions };
          byName.set(key, o);
          objectives.push(o);
        }
      });
    const count = new Array(n).fill(0);
    for (const o of objectives) for (const q of o.questions) count[q]++;
    const unassigned = [];
    const repeated = [];
    count.forEach((c, q) => {
      if (c === 0) unassigned.push(q);
      if (c > 1) repeated.push(q);
    });
    return { objectives, errors, unassigned, repeated };
  }

  function levelFor(percent, levels) {
    const l = Object.assign({}, DEFAULT_LEVELS, levels || {});
    if (percent === null || percent === undefined) return null;
    if (percent >= l.achieved) return 'L';
    if (percent >= l.partial) return 'ML';
    return 'NL';
  }

  /**
   * Logro de un estudiante en cada objetivo: % de preguntas correctas del OA
   * (las preguntas sin clave no se consideran).
   * @param items resultado de gradeAnswers(...).items
   */
  function objectiveResults(items, objectives, levels) {
    return objectives.map((o) => {
      let correct = 0;
      let total = 0;
      for (const q of o.questions) {
        const it = items[q];
        if (!it || it.status === 'excluded') continue;
        total++;
        if (it.status === 'correct') correct++;
      }
      const percent = total ? Math.round((correct / total) * 1000) / 10 : null;
      return { name: o.name, questions: o.questions, correct, total, percent, level: levelFor(percent, levels) };
    });
  }

  /** Resumen del curso por objetivo: promedio de logro y cantidad de estudiantes por nivel. */
  function objectiveSummary(perStudent, objectives) {
    return objectives.map((o, i) => {
      const vals = perStudent.map((r) => r[i]).filter((x) => x && x.percent !== null);
      const counts = { L: 0, ML: 0, NL: 0 };
      for (const v of vals) counts[v.level]++;
      const avg = vals.length ? Math.round((vals.reduce((s, v) => s + v.percent, 0) / vals.length) * 10) / 10 : null;
      return { name: o.name, questions: o.questions, average: avg, counts, students: vals.length };
    });
  }

  /** "1-4, 7" a partir de índices base 0. */
  function formatRanges(qs) {
    const s = qs.slice().sort((a, b) => a - b);
    const parts = [];
    for (let i = 0; i < s.length; i++) {
      let j = i;
      while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
      parts.push(j > i ? `${s[i] + 1}-${s[j] + 1}` : `${s[i] + 1}`);
      i = j;
    }
    return parts.join(', ');
  }

  return {
    DEFAULT_SCORING,
    DEFAULT_LEVELS,
    LEVEL_LABELS,
    computeGrade,
    gradeAnswers,
    itemAnalysis,
    parseRanges,
    parseObjectives,
    levelFor,
    objectiveResults,
    objectiveSummary,
    formatRanges,
  };
});
