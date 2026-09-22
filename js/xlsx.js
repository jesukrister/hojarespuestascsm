/*
 * Generador mínimo de planillas Excel (.xlsx, Office Open XML) con
 * hipervínculos a archivos. No depende de librerías externas.
 *
 * Una celda puede ser:
 *   - string o número
 *   - null / undefined (vacía)
 *   - { v: valor, s: estilo, link: 'ruta/relativa.jpg' }
 * Estilos disponibles: 'bold', 'header', 'title', 'link', 'dec1', 'dec2', 'ok', 'bad', 'muted'.
 */
(function (root, factory) {
  const zip = root && root.ZipWriter ? root.ZipWriter : typeof require === 'function' ? require('./zip.js') : null;
  const api = factory(zip);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Xlsx = api;
})(typeof self !== 'undefined' ? self : this, function (ZipWriter) {
  'use strict';

  const STYLE_IDS = { normal: 0, bold: 1, header: 2, title: 3, link: 4, dec1: 5, dec2: 6, ok: 7, bad: 8, muted: 9 };

  const STYLES_XML =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<numFmts count="2"><numFmt numFmtId="164" formatCode="0.0"/><numFmt numFmtId="165" formatCode="0.00"/></numFmts>' +
    '<fonts count="7">' +
    '<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>' +
    '<font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font>' +
    '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>' +
    '<font><b/><sz val="14"/><name val="Calibri"/><family val="2"/></font>' +
    '<font><u/><sz val="11"/><color rgb="FF0563C1"/><name val="Calibri"/><family val="2"/></font>' +
    '<font><b/><sz val="11"/><color rgb="FF1E8E3E"/><name val="Calibri"/><family val="2"/></font>' +
    '<font><b/><sz val="11"/><color rgb="FFC62828"/><name val="Calibri"/><family val="2"/></font>' +
    '</fonts>' +
    '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FF1F4E79"/><bgColor indexed="64"/></patternFill></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="10">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
    '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="164" fontId="5" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>' +
    '<xf numFmtId="164" fontId="6" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '</cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>';

  function xmlEsc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      // Caracteres de control no permitidos en XML.
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  }

  function colName(i) {
    let s = '';
    i += 1;
    while (i > 0) {
      const m = (i - 1) % 26;
      s = String.fromCharCode(65 + m) + s;
      i = Math.floor((i - 1) / 26);
    }
    return s;
  }

  /** Codifica una ruta relativa como URI (espacios, tildes, etc.). */
  function encodeTarget(path) {
    return path.split('/').map(encodeURIComponent).join('/');
  }

  function sheetXml(sheet) {
    const links = [];
    const rowsXml = [];
    let maxCol = 0;
    sheet.rows.forEach((row, r) => {
      const cells = [];
      (row || []).forEach((cell, c) => {
        if (cell === null || cell === undefined || cell === '') return;
        const obj = typeof cell === 'object' ? cell : { v: cell };
        if (obj.v === null || obj.v === undefined || obj.v === '') return;
        const ref = colName(c) + (r + 1);
        maxCol = Math.max(maxCol, c + 1);
        let styleName = obj.s || (obj.link ? 'link' : 'normal');
        const s = STYLE_IDS[styleName] || 0;
        const sAttr = s ? ` s="${s}"` : '';
        if (typeof obj.v === 'number' && Number.isFinite(obj.v)) {
          cells.push(`<c r="${ref}"${sAttr}><v>${obj.v}</v></c>`);
        } else {
          cells.push(`<c r="${ref}"${sAttr} t="inlineStr"><is><t xml:space="preserve">${xmlEsc(obj.v)}</t></is></c>`);
        }
        if (obj.link) links.push({ ref, target: obj.link, tooltip: obj.tooltip });
      });
      const ht = sheet.rowHeights && sheet.rowHeights[r] ? ` ht="${sheet.rowHeights[r]}" customHeight="1"` : '';
      if (cells.length || ht) rowsXml.push(`<row r="${r + 1}"${ht}>${cells.join('')}</row>`);
    });

    let xml =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">';
    if (sheet.freeze) {
      const { row = 0, col = 0 } = sheet.freeze;
      const topLeft = colName(col) + (row + 1);
      const attrs = [col ? `xSplit="${col}"` : '', row ? `ySplit="${row}"` : ''].filter(Boolean).join(' ');
      const pane = row && col ? 'bottomRight' : row ? 'bottomLeft' : 'topRight';
      xml += `<sheetViews><sheetView workbookViewId="0"><pane ${attrs} topLeftCell="${topLeft}" activePane="${pane}" state="frozen"/></sheetView></sheetViews>`;
    }
    if (sheet.cols && sheet.cols.length) {
      xml += '<cols>' + sheet.cols.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('') + '</cols>';
    }
    xml += `<sheetData>${rowsXml.join('')}</sheetData>`;
    if (sheet.autoFilter) xml += `<autoFilter ref="${sheet.autoFilter}"/>`;
    const rels = [];
    if (links.length) {
      xml += '<hyperlinks>';
      links.forEach((l, i) => {
        const id = `rId${i + 1}`;
        const tip = l.tooltip ? ` tooltip="${xmlEsc(l.tooltip)}"` : '';
        xml += `<hyperlink ref="${l.ref}" r:id="${id}"${tip}/>`;
        rels.push(
          `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" ` +
            `Target="${xmlEsc(encodeTarget(l.target))}" TargetMode="External"/>`
        );
      });
      xml += '</hyperlinks>';
    }
    xml += '<pageMargins left="0.5" right="0.5" top="0.75" bottom="0.75" header="0.3" footer="0.3"/></worksheet>';
    const relsXml = rels.length
      ? '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        rels.join('') +
        '</Relationships>'
      : null;
    return { xml, relsXml };
  }

  function sanitizeSheetName(name, used) {
    let n = String(name || 'Hoja').replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31) || 'Hoja';
    let k = 2;
    const base = n;
    while (used.has(n.toLowerCase())) n = `${base.slice(0, 28)} ${k++}`;
    used.add(n.toLowerCase());
    return n;
  }

  /**
   * @param sheets [{ name, rows, cols?, freeze?: {row, col}, autoFilter?, rowHeights? }]
   * @returns Uint8Array con el archivo .xlsx
   */
  function build(sheets, meta) {
    meta = meta || {};
    const used = new Set();
    const names = sheets.map((s) => sanitizeSheetName(s.name, used));
    const entries = [];
    entries.push({
      name: '[Content_Types].xml',
      data:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        sheets
          .map(
            (s, i) =>
              `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
          )
          .join('') +
        '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
        '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
        '</Types>',
    });
    entries.push({
      name: '_rels/.rels',
      data:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
        '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
        '</Relationships>',
    });
    const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    entries.push({
      name: 'docProps/core.xml',
      data:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
        'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" ' +
        'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
        `<dc:title>${xmlEsc(meta.title || 'Resultados')}</dc:title>` +
        '<dc:creator>Lector de hojas de respuesta</dc:creator>' +
        `<dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>` +
        `<dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>` +
        '</cp:coreProperties>',
    });
    entries.push({
      name: 'docProps/app.xml',
      data:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Microsoft Excel</Application></Properties>',
    });
    entries.push({
      name: 'xl/workbook.xml',
      data:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<bookViews><workbookView/></bookViews><sheets>' +
        names.map((n, i) => `<sheet name="${xmlEsc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
        '</sheets></workbook>',
    });
    entries.push({
      name: 'xl/_rels/workbook.xml.rels',
      data:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        sheets
          .map(
            (s, i) =>
              `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
          )
          .join('') +
        `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
        '</Relationships>',
    });
    entries.push({ name: 'xl/styles.xml', data: STYLES_XML });
    sheets.forEach((s, i) => {
      const { xml, relsXml } = sheetXml(s);
      entries.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: xml });
      if (relsXml) entries.push({ name: `xl/worksheets/_rels/sheet${i + 1}.xml.rels`, data: relsXml });
    });
    return ZipWriter.create(entries);
  }

  return { build, colName };
});
