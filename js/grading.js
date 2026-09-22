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

  return { DEFAULT_SCORING, computeGrade, gradeAnswers, itemAnalysis };
});
