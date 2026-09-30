/*
 * Genera pro.html (versión Pro) a partir de index.html y de las partes de
 * pro/partes.html. Cada parte "<!-- @@ nombre -->" reemplaza el comentario
 * "<!-- pro:nombre -->" de index.html, así la versión normal no cambia y la
 * Pro recibe automáticamente todo lo demás (lector, pestañas, manual…).
 *
 *   node scripts/build-pro.js          escribe pro.html
 *   node scripts/build-pro.js --check  falla si pro.html no está al día
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PRO_TITLE = 'Lector de Hojas de Respuesta Pro';
const NOTICE = '<!-- Archivo generado por scripts/build-pro.js a partir de index.html y pro/partes.html: no editar a mano. -->';

/** Partes de pro/partes.html: { nombre: contenido }. */
function parseParts(text) {
  const parts = {};
  const re = /<!--\s*@@\s*([\w-]+)\s*-->/g;
  const marks = [];
  let m;
  while ((m = re.exec(text))) marks.push({ name: m[1], start: m.index, end: re.lastIndex });
  marks.forEach((mk, i) => {
    if (parts[mk.name] !== undefined) throw new Error(`Parte repetida en pro/partes.html: ${mk.name}`);
    const body = text.slice(mk.end, i + 1 < marks.length ? marks[i + 1].start : text.length);
    parts[mk.name] = body.replace(/^\s*\n/, '').replace(/\s+$/, '');
  });
  return parts;
}

function buildProPage(indexHtml, partsText) {
  const parts = parseParts(partsText);
  let html = indexHtml;
  const swap = (from, to) => {
    if (html.indexOf(from) < 0) throw new Error(`No se encontró en index.html: ${from}`);
    html = html.replace(from, to);
  };
  swap('<!doctype html>\n', `<!doctype html>\n${NOTICE}\n`);
  swap('<html lang="es">', '<html lang="es" data-edition="pro">');
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${PRO_TITLE}</title>`);
  for (const [name, body] of Object.entries(parts)) {
    const anchor = `<!-- pro:${name} -->`;
    const at = html.indexOf(anchor);
    if (at < 0) throw new Error(`index.html no tiene el punto de inserción ${anchor}`);
    if (html.indexOf(anchor, at + anchor.length) >= 0) throw new Error(`${anchor} aparece más de una vez en index.html`);
    const lineStart = html.lastIndexOf('\n', at) + 1;
    const before = html.slice(lineStart, at);
    let text;
    if (/^\s*$/.test(before)) {
      // Comentario solo en su línea: la parte se inserta con la misma sangría.
      text = body
        .split('\n')
        .map((line, i) => (i === 0 || !line.trim() ? line : before + line))
        .join('\n');
    } else {
      text = body.trim();
    }
    html = html.slice(0, at) + text + html.slice(at + anchor.length);
  }
  return html;
}

function build() {
  const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const parts = fs.readFileSync(path.join(ROOT, 'pro', 'partes.html'), 'utf8');
  return buildProPage(index, parts);
}

if (require.main === module) {
  const out = path.join(ROOT, 'pro.html');
  const html = build();
  if (process.argv.includes('--check')) {
    const current = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : '';
    if (current !== html) {
      console.error('pro.html no está al día: ejecuta  node scripts/build-pro.js');
      process.exit(1);
    }
    console.log('pro.html al día');
  } else {
    fs.writeFileSync(out, html);
    console.log('pro.html listo');
  }
}

module.exports = { buildProPage, parseParts, build };
