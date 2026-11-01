/*
 * Versión Pro · Análisis de las preguntas de una prueba (psicometría clásica):
 *  - dificultad (% de acierto),
 *  - discriminación: acierto del 27 % de mejor puntaje menos el del 27 % más bajo,
 *    y correlación punto-biserial corregida (pregunta vs. resto de la prueba),
 *  - distractores: cuánto se eligió cada alternativa, en total y en cada grupo,
 *  - confiabilidad de la prueba (KR-20),
 *  - una sugerencia por pregunta (revisar la clave, mejorar, anular…).
 * Sólo lógica (sin pantalla), para poder probarla aparte.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AnalisisCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const LETTERS = 'ABCDEF';
  const MIN_STUDENTS = 10; // con menos hojas los índices son poco confiables

  function mean(a) {
    return a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
  }

  /** Correlación de Pearson (null si alguna variable no varía). */
  function pearson(x, y) {
    const n = x.length;
    if (n < 3) return null;
    const mx = mean(x);
    const my = mean(y);
    let sxy = 0;
    let sxx = 0;
    let syy = 0;
    for (let i = 0; i < n; i++) {
      sxy += (x[i] - mx) * (y[i] - my);
      sxx += (x[i] - mx) * (x[i] - mx);
      syy += (y[i] - my) * (y[i] - my);
    }
    return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null;
  }

  function difficultyLabel(p) {
    if (p === null) return null;
    if (p >= 0.85) return 'muy fácil';
    if (p >= 0.7) return 'fácil';
    if (p >= 0.3) return 'adecuada';
    if (p >= 0.15) return 'difícil';
    return 'muy difícil';
  }

  function discriminationLabel(d) {
    if (d === null) return null;
    if (d >= 0.4) return 'muy buena';
    if (d >= 0.3) return 'buena';
    if (d >= 0.2) return 'regular';
    if (d >= 0) return 'deficiente';
    return 'negativa';
  }

  function reliabilityLabel(r) {
    if (r === null) return null;
    if (r >= 0.8) return 'alta';
    if (r >= 0.7) return 'aceptable';
    if (r >= 0.6) return 'baja';
    return 'muy baja';
  }

  /**
   * @param answers  por estudiante, las respuestas en el orden de la fila A: [[{ marked: [..] }]]
   * @param key      clave (índice por pregunta o null = anulada)
   * @param numChoices alternativas
   * @returns { n, enough, groupSize, kr20, reliability, meanP, items: [...], review, improve }
   *   Con menos de MIN_STUDENTS hojas sólo se sugiere revisar la clave (cuando más
   *   estudiantes eligen otra alternativa); la discriminación necesita más hojas.
   */
  function analyze(answers, key, numChoices) {
    const n = answers.length;
    const nq = key.length;
    const scored = [];
    for (let q = 0; q < nq; q++) if (key[q] !== null && key[q] !== undefined) scored.push(q);
    // Aciertos por estudiante y pregunta (1/0) y puntaje total (preguntas con clave).
    const hit = answers.map((a) =>
      key.map((k, q) => {
        const m = (a[q] && a[q].marked) || [];
        return k !== null && k !== undefined && m.length === 1 && m[0] === k ? 1 : 0;
      })
    );
    const totals = hit.map((h) => scored.reduce((s, q) => s + h[q], 0));
    // Grupos superior e inferior (27 %), por puntaje total.
    const order = totals.map((t, i) => i).sort((a, b) => totals[b] - totals[a] || a - b);
    const enough = n >= MIN_STUDENTS;
    const groupSize = n >= 4 ? Math.max(1, Math.round(n * 0.27)) : 0;
    const upper = order.slice(0, groupSize);
    const lower = order.slice(n - groupSize);

    const items = key.map((k, q) => {
      const counts = new Array(numChoices).fill(0);
      const up = new Array(numChoices).fill(0);
      const lo = new Array(numChoices).fill(0);
      let blank = 0;
      let multiple = 0;
      answers.forEach((a, i) => {
        const m = (a[q] && a[q].marked) || [];
        if (m.length === 0) blank++;
        else if (m.length > 1) multiple++;
        else if (m[0] < numChoices) counts[m[0]]++;
      });
      for (const i of upper) {
        const m = (answers[i][q] && answers[i][q].marked) || [];
        if (m.length === 1 && m[0] < numChoices) up[m[0]]++;
      }
      for (const i of lower) {
        const m = (answers[i][q] && answers[i][q].marked) || [];
        if (m.length === 1 && m[0] < numChoices) lo[m[0]]++;
      }
      const noKey = k === null || k === undefined;
      const p = noKey || !n ? null : counts[k] / n;
      const pu = noKey || !groupSize ? null : up[k] / groupSize;
      const pl = noKey || !groupSize ? null : lo[k] / groupSize;
      const d = pu === null ? null : pu - pl;
      const rpb = noKey ? null : pearson(hit.map((h) => h[q]), totals.map((t, i) => t - hit[i][q]));
      const options = counts.map((c, o) => ({
        index: o,
        letter: LETTERS[o],
        isKey: o === k,
        count: c,
        pct: n ? c / n : 0,
        upper: groupSize ? up[o] / groupSize : null,
        lower: groupSize ? lo[o] / groupSize : null,
      }));
      const distractors = noKey ? [] : options.filter((o) => !o.isKey);
      // Distractores que nadie eligió: no aportan a la pregunta.
      const unused = distractors.filter((o) => o.count === 0).map((o) => o.letter);
      // Uno que eligen más los mejores estudiantes que la clave sugiere que la clave está mal.
      const rival = enough && groupSize ? distractors.filter((o) => o.upper > pu && o.upper > o.lower).sort((a, b) => b.upper - a.upper)[0] || null : null;
      // Uno que eligen más estudiantes que la clave (y bastante más que los otros
      // distractores, para no confundirlo con respuestas al azar): clave
      // equivocada o error frecuente.
      const byPct = distractors.slice().sort((a, b) => b.pct - a.pct);
      const top = byPct[0];
      const popular = top && top.pct >= 0.4 && top.pct > p && top.pct >= 1.5 * (byPct[1] ? byPct[1].pct : 0) ? top : null;
      const flags = [];
      const notes = [];
      let level = 'ok'; // 'ok' | 'mejorar' | 'revisar' | 'sinclave'
      const pctTxt = (v) => Math.round(v * 100) + '%';
      if (noKey) {
        level = 'sinclave';
      } else if (n >= 2) {
        if (rival && d < 0.1) {
          level = 'revisar';
          flags.push('clave');
          notes.push(`Revisar la clave: los estudiantes con mejor puntaje eligieron más la ${rival.letter} que la ${LETTERS[k]}.`);
        } else if (popular) {
          level = 'revisar';
          flags.push('clave');
          notes.push(
            `Revisar la clave: más estudiantes eligieron la ${popular.letter} (${pctTxt(popular.pct)}) que la ${LETTERS[k]} (${pctTxt(p)}). Si la clave está bien, es un error frecuente que conviene reforzar.`
          );
        } else if (enough && d < 0 && (rpb === null || rpb < 0)) {
          level = 'revisar';
          flags.push('negativa');
          notes.push('Revisar la pregunta: la respondieron mejor los estudiantes de bajo puntaje que los de alto (puede estar ambigua o mal redactada).');
        } else if (enough && p < 0.15 && d < 0.2) {
          level = 'revisar';
          flags.push('anular');
          notes.push('Considerar anularla: casi nadie la respondió bien y no distingue entre quienes saben y quienes no.');
        } else if (enough && p >= 0.9) {
          notes.push('Muy fácil: casi todos la respondieron bien.');
        } else if (enough && d < 0.2) {
          level = 'mejorar';
          flags.push('discrimina');
          notes.push('Mejorar la pregunta: distingue poco entre quienes saben y quienes no.');
        } else if (enough) {
          notes.push(d >= 0.3 ? 'Buena pregunta.' : 'Pregunta aceptable.');
        }
        if (enough && unused.length) {
          if (level === 'ok') level = 'mejorar';
          flags.push('distractor');
          notes.push(`Cambiar ${unused.length === 1 ? 'la alternativa' : 'las alternativas'} ${unused.join(', ')}: nadie ${unused.length === 1 ? 'la' : 'las'} eligió.`);
        }
        if (blank / n >= 0.3) {
          flags.push('omitida');
          notes.push(`La omitió el ${pctTxt(blank / n)} de los estudiantes (¿no alcanzaron a responderla o el contenido no se vio?).`);
        }
      }
      return {
        question: q + 1,
        key: noKey ? null : k,
        p,
        difficulty: difficultyLabel(p),
        d,
        discrimination: discriminationLabel(d),
        rpb,
        options,
        blank: n ? blank / n : 0,
        multiple: n ? multiple / n : 0,
        unused,
        rival: rival ? rival.letter : null,
        popular: popular ? popular.letter : null,
        // Alternativa que convendría dejar como clave si la actual está mal.
        altKey: rival ? rival.index : popular ? popular.index : null,
        flags,
        level,
        suggestion: notes.join(' '),
      };
    });

    // KR-20: confiabilidad de la prueba (preguntas con clave).
    let kr20 = null;
    if (scored.length >= 2 && n >= 2) {
      const m = mean(totals);
      const variance = totals.reduce((s, t) => s + (t - m) * (t - m), 0) / n;
      const pq = scored.reduce((s, q) => {
        const p = items[q].p;
        return s + p * (1 - p);
      }, 0);
      if (variance > 0) kr20 = (scored.length / (scored.length - 1)) * (1 - pq / variance);
    }
    const ps = items.filter((it) => it.p !== null).map((it) => it.p);
    return {
      n,
      enough,
      groupSize,
      kr20,
      reliability: reliabilityLabel(kr20),
      meanP: ps.length ? mean(ps) : null,
      items,
      review: items.filter((it) => it.level === 'revisar').length,
      improve: items.filter((it) => it.level === 'mejorar').length,
    };
  }

  return { analyze, pearson, difficultyLabel, discriminationLabel, reliabilityLabel, MIN_STUDENTS };
});
