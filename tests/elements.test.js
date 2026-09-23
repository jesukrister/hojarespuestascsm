'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Charts = require('../js/charts.js');
const TestDoc = require('../js/testdoc.js');

test('datos de gráfico: separadores, decimales con coma y nombres de series', () => {
  assert.deepEqual(Charts.parseChartData('Enero; 12\nFebrero; 8,5\nMarzo 14'), {
    labels: ['Enero', 'Febrero', 'Marzo'],
    series: [{ name: '', values: [12, 8.5, 14] }],
    errors: [],
  });
  const multi = Charts.parseChartData('\t2022\t2023\nNorte\t10\t12\nSur\t1.234,5\t7');
  assert.deepEqual(multi.series.map((s) => s.name), ['2022', '2023']);
  assert.deepEqual(multi.series[0].values, [10, 1234.5]);
  assert.equal(Charts.parseChartData('Uno; 3\nDos; x').errors.length, 1);
});

test('escala del eje con valores "redondos"', () => {
  assert.deepEqual(Charts.niceScale(0, 14, 5).ticks, [0, 5, 10, 15]);
  assert.deepEqual(Charts.niceScale(-3, 9, 5).ticks, [-5, 0, 5, 10]);
  assert.deepEqual(Charts.niceScale(0, 0.8, 5).ticks, [0, 0.2, 0.4, 0.6, 0.8]);
});

test('los cuatro tipos de gráfico generan SVG válido, en color y en blanco y negro', () => {
  const data = Charts.parseChartData('; A; B\nUno; 3; 4\nDos; 5; -1');
  for (const type of Object.keys(Charts.CHART_TYPES)) {
    for (const bw of [false, true]) {
      const svg = Charts.renderChartSVG({ type, data, title: 'T <1>', showValues: true, bw }, 'x');
      assert.match(svg, /^<svg[^>]+viewBox="0 0 640 [\d.]+"/);
      assert.match(svg, /T &lt;1&gt;/);
      assert.doesNotMatch(svg, /NaN|undefined/);
      if (bw) assert.match(svg, /<pattern /, `${type} en blanco y negro usa texturas`);
    }
  }
  // Dos series: con leyenda. Una serie: sin leyenda.
  assert.match(Charts.renderChartSVG({ type: 'column', data }, 'y'), />A</);
  const one = Charts.renderChartSVG({ type: 'column', data: Charts.parseChartData('Uno; 3') }, 'z');
  assert.doesNotMatch(one, /<rect x="[\d.]+" y="[\d.]+" width="18"/);
});

test('tablas pegadas desde Excel, con "|" o estilo Markdown', () => {
  assert.deepEqual(TestDoc.parseTable('País\tCapital\nChile\tSantiago'), [['País', 'Capital'], ['Chile', 'Santiago']]);
  assert.deepEqual(TestDoc.parseTable('| a | b |\n|---|---|\n| 1 | 2 |\n| 3 |'), [['a', 'b'], ['1', '2'], ['3', '']]);
  const html = TestDoc.renderElement({ type: 'table', data: { text: 'A;B\nx;4,5' } });
  assert.match(html, /<th>A<\/th><th>B<\/th>/);
  assert.match(html, /<td class="num">4,5<\/td>/);
});

test('los elementos se ubican antes o después del enunciado de su pregunta', () => {
  const { questions } = TestDoc.parseQuestions('1. Primera\na) x\nb) y\n2. Segunda\na) x\nb) y');
  const elements = [
    [],
    [
      { id: 'e1', type: 'text', position: 'before', data: { text: 'Lee <esto>', boxed: true } },
      { id: 'e2', type: 'image', position: 'after', width: 50, caption: 'Figura 1', src: 'data:image/png;base64,AAAA' },
      { id: 'e3', type: 'chart', position: 'after', data: { type: 'pie', data: Charts.parseChartData('Sí; 3\nNo; 1'), showValues: true } },
    ],
  ];
  const html = TestDoc.renderTestHTML(questions, {}, { elements });
  const q2 = html.slice(html.indexOf('data-q="1"'));
  const iText = q2.indexOf('data-el="e1"');
  const iStem = q2.indexOf('Segunda');
  const iImg = q2.indexOf('data-el="e2"');
  const iChart = q2.indexOf('data-el="e3"');
  const iOpts = q2.indexOf('td-opts');
  assert.ok(iText > 0 && iText < iStem, 'texto antes del enunciado');
  assert.ok(iStem < iImg && iImg < iChart && iChart < iOpts, 'imagen y gráfico después del enunciado y antes de las alternativas');
  assert.match(q2, /class="td-el td-text boxed"/);
  assert.match(q2, /Lee &lt;esto&gt;/);
  assert.match(q2, /style="width:50%"/);
  assert.match(q2, /<figcaption>Figura 1<\/figcaption>/);
  assert.match(q2, /75%/); // circular: 3 de 4
  assert.doesNotMatch(html.slice(0, html.indexOf('data-q="1"')), /data-el=/, 'la pregunta 1 no tiene elementos');
});
