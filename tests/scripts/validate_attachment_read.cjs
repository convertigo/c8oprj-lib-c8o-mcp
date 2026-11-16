// Run: node --test tests/scripts/validate_attachment_read.cjs
// nocode-attachment-read and attachment-read (js/attachment_read.js) read a file the user attached in the Tigo panel:
// spreadsheets as sheets, header and rows, documents as text, among the attachments of the user the request
// authenticated, by their file name only. The files are built here as the zip of XML they are (Office Open XML,
// OpenDocument), the host reads them from memory; the engine's host (javaHost) is checked against real files with the
// engine's Rhino and PDFBox (see the commit that added the tool).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');
const { skillText: nocodeSkillText } = require('../helpers/nocode_skill.cjs');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function load() {
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(read('js/attachment_read.js'), sandbox, { filename: 'js/attachment_read.js' });
  return sandbox.C8O.attachmentRead;
}
const api = load();
const plain = value => JSON.parse(JSON.stringify(value));

// ---- a zip, written and read as Office does it ----------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function zip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, content] of Object.entries(entries)) {
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
    const stored = name === 'mimetype';
    const body = stored ? data : zlib.deflateRawSync(data);
    const nameBuf = Buffer.from(name, 'utf8');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(stored ? 0 : 8, 8);
    local.writeUInt32LE(crc32(data), 14); local.writeUInt32LE(body.length, 18); local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
    central.writeUInt16LE(stored ? 0 : 8, 10); central.writeUInt32LE(crc32(data), 16);
    central.writeUInt32LE(body.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, body);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + body.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(entries).length, 8);
  end.writeUInt16LE(Object.keys(entries).length, 10); end.writeUInt32LE(centralBuf.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuf, end]);
}
function unzip(buf) {
  const entries = new Map();
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error('not a zip file (java.util.zip.ZipException)');
  let p = buf.readUInt32LE(eocd + 16);
  const count = buf.readUInt16LE(eocd + 10);
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLength = buf.readUInt16LE(p + 28);
    const extra = buf.readUInt16LE(p + 30);
    const comment = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLength);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const body = buf.subarray(start, start + size);
    entries.set(name, method === 8 ? zlib.inflateRawSync(body) : body);
    p += 46 + nameLength + extra + comment;
  }
  return entries;
}

// ---- the files ------------------------------------------------------------------------------------------------------

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const letters = i => { let n = i + 1, s = ''; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };

// sheets: [{name, hidden, rows: [[cell]]}]; a cell: text, number, boolean, null, or
// {date: serial, style}, {f, v}, {inline}, {str, f}, {error}
function xlsx(sheets, { prefix = '', date1904 = false } = {}) {
  const x = prefix ? prefix + ':' : '';
  const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const strings = [];
  const stringIndex = s => { let i = strings.indexOf(s); if (i < 0) { strings.push(s); i = strings.length - 1; } return i; };
  const files = {
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
    '_rels/.rels': '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'
  };
  const rels = [];
  const sheetTags = [];
  sheets.forEach((sheet, s) => {
    rels.push(`<Relationship Id="rId${s + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${s + 1}.xml"/>`);
    sheetTags.push(`<${x}sheet name="${esc(sheet.name)}" sheetId="${s + 1}"${sheet.hidden ? ' state="hidden"' : ''} r:id="rId${s + 1}"/>`);
    const rowXml = sheet.rows.map((row, r) => {
      if (row === null) return '';
      const cells = row.map((cell, c) => {
        const ref = letters(c) + (r + 1);
        if (cell === null || cell === undefined) return '';
        if (typeof cell === 'string') return `<${x}c r="${ref}" t="s"><${x}v>${stringIndex(cell)}</${x}v></${x}c>`;
        if (typeof cell === 'number') return `<${x}c r="${ref}"><${x}v>${cell}</${x}v></${x}c>`;
        if (typeof cell === 'boolean') return `<${x}c r="${ref}" t="b"><${x}v>${cell ? 1 : 0}</${x}v></${x}c>`;
        if (cell.date !== undefined) return `<${x}c r="${ref}" s="${cell.style || 1}"><${x}v>${cell.date}</${x}v></${x}c>`;
        if (cell.inline !== undefined) return `<${x}c r="${ref}" t="inlineStr"><${x}is><${x}t>${esc(cell.inline)}</${x}t></${x}is></${x}c>`;
        if (cell.str !== undefined) return `<${x}c r="${ref}" t="str"><${x}f>${esc(cell.f)}</${x}f><${x}v>${esc(cell.str)}</${x}v></${x}c>`;
        if (cell.error !== undefined) return `<${x}c r="${ref}" t="e"><${x}v>${esc(cell.error)}</${x}v></${x}c>`;
        if (cell.f !== undefined) return `<${x}c r="${ref}"><${x}f>${esc(cell.f)}</${x}f>${cell.v === undefined ? '' : `<${x}v>${cell.v}</${x}v>`}</${x}c>`;
        throw new Error('cell ' + JSON.stringify(cell));
      }).join('');
      return `<${x}row r="${r + 1}" spans="1:${row.length}">${cells}</${x}row>`;
    }).join('');
    files[`xl/worksheets/sheet${s + 1}.xml`] = `<?xml version="1.0" encoding="UTF-8"?><${x}worksheet xmlns${prefix ? ':' + prefix : ''}="${ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><${x}dimension ref="A1"/><${x}sheetViews><${x}sheetView workbookViewId="0"/></${x}sheetViews><${x}cols><${x}col min="1" max="3" width="20"/></${x}cols><${x}sheetData>${rowXml}</${x}sheetData></${x}worksheet>`;
  });
  rels.push(`<Relationship Id="rIdS" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>`);
  rels.push(`<Relationship Id="rIdT" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="/xl/styles.xml"/>`);
  files['xl/workbook.xml'] = `<?xml version="1.0"?><${x}workbook xmlns${prefix ? ':' + prefix : ''}="${ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><${x}workbookPr${date1904 ? ' date1904="1"' : ''}/><${x}sheets>${sheetTags.join('')}</${x}sheets></${x}workbook>`;
  files['xl/_rels/workbook.xml.rels'] = `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join('')}</Relationships>`;
  files['xl/styles.xml'] = `<?xml version="1.0"?><${x}styleSheet xmlns${prefix ? ':' + prefix : ''}="${ns}"><${x}numFmts count="3"><${x}numFmt numFmtId="164" formatCode="dd/mm/yyyy\\ hh:mm"/><${x}numFmt numFmtId="165" formatCode="#,##0.00\\ &quot;€&quot;"/><${x}numFmt numFmtId="166" formatCode="[h]:mm"/></${x}numFmts><${x}cellStyleXfs count="1"><${x}xf numFmtId="0"/></${x}cellStyleXfs><${x}cellXfs count="6"><${x}xf numFmtId="0" fontId="0"/><${x}xf numFmtId="14" fontId="0" applyNumberFormat="1"/><${x}xf numFmtId="164" fontId="0" applyNumberFormat="1"><${x}alignment horizontal="left"/></${x}xf><${x}xf numFmtId="165" fontId="0"/><${x}xf numFmtId="20"/><${x}xf numFmtId="166"/></${x}cellXfs></${x}styleSheet>`;
  files['xl/sharedStrings.xml'] = `<?xml version="1.0"?><${x}sst xmlns${prefix ? ':' + prefix : ''}="${ns}" count="${strings.length}">${strings.map(s => /^rich:/.test(s)
    ? `<${x}si><${x}r><${x}t>${esc(s.slice(5, 9))}</${x}t></${x}r><${x}r><${x}rPr><${x}b/></${x}rPr><${x}t xml:space="preserve">${esc(s.slice(9))}</${x}t></${x}r><${x}rPh sb="0" eb="1"><${x}t>PHONETIC</${x}t></${x}rPh></${x}si>`
    : `<${x}si><${x}t xml:space="preserve">${esc(s)}</${x}t></${x}si>`).join('')}</${x}sst>`;
  return zip(files);
}

function ods(tables) {
  const body = tables.map(t => `<table:table table:name="${esc(t.name)}">` + t.rows.map(r => r.xml ? r.xml : `<table:table-row>${r.map(cell => {
    if (cell === null) return '<table:table-cell/>';
    if (typeof cell === 'number') return `<table:table-cell office:value-type="float" office:value="${cell}"><text:p>${cell}</text:p></table:table-cell>`;
    if (cell.date) return `<table:table-cell office:value-type="date" office:date-value="${cell.date}"><text:p>x</text:p></table:table-cell>`;
    if (cell.xml) return cell.xml;
    return `<table:table-cell office:value-type="string"><text:p>${esc(cell)}</text:p></table:table-cell>`;
  }).join('')}</table:table-row>`).join('') + '</table:table>').join('');
  return zip({
    mimetype: 'application/vnd.oasis.opendocument.spreadsheet',
    'content.xml': `<?xml version="1.0" encoding="UTF-8"?><office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"><office:body><office:spreadsheet>${body}</office:spreadsheet></office:body></office:document-content>`
  });
}

function docx(bodyXml) {
  return zip({
    '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
    'word/document.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${bodyXml}<w:sectPr><w:pgSz w:w="11906"/></w:sectPr></w:body></w:document>`
  });
}
const para = (text, extra = '') => `<w:p><w:pPr><w:tabs><w:tab w:val="left" w:pos="720"/></w:tabs></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${esc(text)}</w:t></w:r>${extra}</w:p>`;

const OWNER = 'testuser-convertigo_example.com--0123456789abcdef';

function host(files, { owner = OWNER, pdf } = {}) {
  const calls = { zipText: 0, pdf: [] };
  return {
    calls,
    owner: () => owner,
    list: () => files.map((f, i) => ({ name: f.name, bytes: f.bytes !== undefined ? f.bytes : f.data.length, modified: f.modified || (1000 + i), ref: f })),
    head: (ref, n) => Array.from(ref.data.subarray(0, n)),
    zipNames: (ref, max) => [...unzip(ref.data).keys()].slice(0, max),
    zipText: (ref, name, maxChars) => {
      calls.zipText++;
      const entries = unzip(ref.data);
      if (!entries.has(name)) return null;
      const data = entries.get(name);
      if (data.length > maxChars) {
        const e = new Error('A part of the file inflates to more than ' + maxChars + ' bytes: it is not read.');
        e.attachmentCode = 'too_big';
        throw e;
      }
      return data.toString('utf8');
    },
    text: ref => {
      const latin = ref.encoding === 'windows-1252';
      const text = latin ? ref.data.toString('latin1') : ref.data.toString('utf8');
      return { text: text.replace(/^﻿/, ''), encoding: latin ? 'windows-1252' : 'UTF-8' };
    },
    pdf: (ref, maxChars, maxPages) => {
      calls.pdf.push({ maxChars, maxPages });
      const texts = [];
      let chars = 0;
      for (let i = 0; i < ref.pages.length && i < maxPages && chars < maxChars; i++) {
        texts.push(ref.pages[i]);
        chars += ref.pages[i].length;
      }
      return { pages: ref.pages.length, texts };
    }
  };
}
const file = (name, data, extra = {}) => Object.assign({ name, data: Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8') }, extra);
const pdfFile = (name, pages, extra = {}) => Object.assign({ name, data: Buffer.from('%PDF-1.7\n'), pages }, extra);
const run = (args, h) => plain(api.run(args, h));
const size = value => JSON.stringify(value, null, 2).length;

// ---- spreadsheets ---------------------------------------------------------------------------------------------------

const WORKBOOK = xlsx([
  { name: 'Directions', rows: [
    ['Liste des directions'],
    null,
    ['Direction', 'Code', 'Responsable', 'Créée le', 'Budget', 'Active'],
    ['Direction des finances', 'DF', 'A. Martin', { date: 45292 }, 125000.5, true],
    ['Direction des ressources humaines', 'DRH', { inline: 'B. Durand & fils' }, { date: 45658.5, style: 2 }, { f: 'SUM(E4:E4)*2', v: 251001 }, false],
    ['Direction du numérique', 'DN', 'rich:C. Lefèvre', { date: 45000 }, { f: 'NOW()' }, { str: 'oui', f: 'IF(1,"oui")' }],
    ['Direction des sports', 'DS', null, null, { error: '#DIV/0!' }, true]
  ] },
  { name: 'Sites', rows: [['Site', 'Ville', 'Capacité'], ['Siège', 'Reims', 120], ['Annexe', 'Châlons', 0.1 + 0.2]] },
  { name: 'Archive', hidden: true, rows: [['Ancien'], ['x']] }
]);

test('an Excel workbook answers its sheets, then the header and the values of the first visible sheet', () => {
  const h = host([file('liste_directions.xlsx', WORKBOOK)]);
  const answer = run({ name: 'liste_directions.xlsx' }, h);
  assert.equal(answer.status, 'ok', JSON.stringify(answer));
  assert.deepEqual(answer.attachment, { name: 'liste_directions.xlsx', format: 'xlsx', bytes: WORKBOOK.length, modified: '1970-01-01T00:00:01Z' });
  assert.deepEqual(answer.sheets, [
    { name: 'Directions', rows: 4, columns: 6 },
    { name: 'Sites', rows: 2, columns: 3 },
    { name: 'Archive', rows: 1, columns: 1, hidden: true }
  ]);
  const sheet = answer.sheet;
  assert.equal(sheet.name, 'Directions');
  assert.deepEqual(sheet.title, ['Liste des directions']);
  assert.deepEqual(sheet.header, ['Direction', 'Code', 'Responsable', 'Créée le', 'Budget', 'Active']);
  assert.equal(sheet.headerRow, 3);
  assert.equal(sheet.totalRows, 4);
  assert.equal(sheet.returned, 4);
  assert.equal(sheet.nextOffset, undefined);
  assert.deepEqual(sheet.rows, [
    ['Direction des finances', 'DF', 'A. Martin', '2024-01-01', 125000.5, true],
    // inline string, a date and time of a custom format, a formula's computed value
    ['Direction des ressources humaines', 'DRH', 'B. Durand & fils', '2025-01-01T12:00', 251001, false],
    // rich text without its phonetic run, a formula saved without a value, a formula's text
    ['Direction du numérique', 'DN', 'C. Lefèvre', '2023-03-15', '', 'oui'],
    ['Direction des sports', 'DS', '', '', '#DIV/0!', true]
  ]);
  assert.ok(answer.notes.some(n => /1 formula cell\(s\) were saved without a computed value/.test(n)), answer.notes.join('\n'));
});

test('a sheet is chosen by its name or number, the rows come a page at a time with nextOffset', () => {
  const h = host([file('liste_directions.xlsx', WORKBOOK)]);
  const sites = run({ name: 'liste_directions.xlsx', sheet: 'sites' }, h);
  assert.deepEqual(sites.sheet.header, ['Site', 'Ville', 'Capacité']);
  // 0.1 + 0.2 as Excel shows it, without the float noise
  assert.deepEqual(sites.sheet.rows, [['Siège', 'Reims', 120], ['Annexe', 'Châlons', 0.3]]);
  assert.equal(run({ name: 'liste_directions.xlsx', sheet: '2' }, h).sheet.name, 'Sites');
  assert.equal(run({ name: 'liste_directions.xlsx', sheet: 'Archive' }, h).notes.includes('This sheet is hidden in the workbook.'), true);
  const page = run({ name: 'liste_directions.xlsx', offset: 1, limit: 2 }, h).sheet;
  assert.deepEqual(page.rows.map(r => r[1]), ['DRH', 'DN']);
  assert.equal(page.offset, 1);
  assert.equal(page.nextOffset, 3);
  const unknown = run({ name: 'liste_directions.xlsx', sheet: 'Budget' }, h);
  assert.equal(unknown.error.code, 'invalid_argument');
  assert.deepEqual(unknown.error.sheets, ['Directions', 'Sites', 'Archive']);
});

test('prefixed SpreadsheetML (x:), a 1904 workbook and a sheet without values read as Excel shows them', () => {
  const book = xlsx([{ name: 'Data', rows: [['Jour', 'Début', 'Heure', 'Durée'], [{ date: 0 }, { date: 1.75, style: 2 }, { date: 0.75, style: 4 }, { date: 1.5, style: 5 }]] }, { name: 'Vide', rows: [] }], { prefix: 'x', date1904: true });
  const answer = run({ name: 'data.xlsx' }, host([file('data.xlsx', book)]));
  // a date, a date and time, a time of day, elapsed hours
  assert.deepEqual(answer.sheet.rows, [['1904-01-01', '1904-01-02T18:00', '18:00', '36:00']]);
  assert.deepEqual(answer.sheets[1], { name: 'Vide', rows: 0, columns: 0 });
});

test('a big sheet answers a page under the 16 KB of indented JSON Vibe keeps inline, the rest by nextOffset', () => {
  const rows = [['Référence', 'Libellé', 'Description', 'Quantité', 'Prix']];
  for (let i = 0; i < 3000; i++) rows.push(['REF-' + i, 'Article numéro ' + i, 'Une description assez longue pour remplir la cellule ' + 'x'.repeat((i * 37) % 400), i, i * 1.5]);
  const book = xlsx([{ name: 'Catalogue', rows }]);
  const h = host([file('catalogue.xlsx', book)]);
  const first = run({ name: 'catalogue.xlsx', limit: 500 }, h);
  assert.ok(size(first) < 16000, 'answer size ' + size(first));
  assert.ok(first.sheet.returned > 10 && first.sheet.returned < 500, String(first.sheet.returned));
  assert.equal(first.sheet.totalRows, 3000);
  assert.equal(first.sheet.nextOffset, first.sheet.returned);
  assert.ok(first.notes.some(n => /cut at 300 characters/.test(n)));
  assert.ok(first.notes.some(n => n === 'More rows: call again with offset ' + first.sheet.returned + '.'));
  const next = run({ name: 'catalogue.xlsx', offset: first.sheet.nextOffset }, h);
  assert.equal(next.sheet.rows[0][0], 'REF-' + first.sheet.returned);
  const last = run({ name: 'catalogue.xlsx', offset: 2999 }, h);
  assert.deepEqual(last.sheet.rows.map(r => r[0]), ['REF-2999']);
  assert.equal(last.sheet.nextOffset, undefined);
});

test('an OpenDocument spreadsheet: repeated cells and rows, dates, covered cells, several paragraphs', () => {
  const book = ods([{ name: 'Inventaire', rows: [
    ['Objet', 'Nombre', 'Acheté le'],
    { xml: '<table:table-row table:number-rows-repeated="2"><table:table-cell office:value-type="string"><text:p>Chaise</text:p></table:table-cell><table:table-cell office:value-type="float" office:value="4"/><table:table-cell table:number-columns-repeated="1020"/></table:table-row>' },
    ['Bureau', 2, { date: '2026-03-01T00:00:00' }],
    [{ xml: '<table:table-cell office:value-type="string"><text:p>Lampe</text:p><text:p>de<text:s text:c="2"/>bureau</text:p></table:table-cell>' }, { xml: '<table:covered-table-cell/>' }, { date: '2026-03-02T08:30:00' }],
    { xml: '<table:table-row table:number-rows-repeated="1048000"><table:table-cell table:number-columns-repeated="1024"/></table:table-row>' }
  ] }]);
  const answer = run({ name: 'inventaire.ods' }, host([file('inventaire.ods', book)]));
  assert.equal(answer.attachment.format, 'ods');
  assert.deepEqual(answer.sheets, [{ name: 'Inventaire', rows: 4, columns: 3 }]);
  assert.deepEqual(answer.sheet.rows, [['Chaise', 4, ''], ['Chaise', 4, ''], ['Bureau', 2, '2026-03-01'], ['Lampe\nde  bureau', '', '2026-03-02T08:30:00']]);
});

test('a CSV: its delimiter found, quoted fields with delimiters and line breaks, a Windows encoding named', () => {
  const csv = '﻿Nom;Ville;Commentaire\r\nDupont;Lyon;"Client ; fidèle"\r\n\r\nMartin;"Paris";"Deux\nlignes"\r\n"Le ""Grand"" Café";Nice;\r\n';
  const answer = run({ name: 'clients.csv' }, host([file('clients.csv', csv)]));
  assert.equal(answer.attachment.format, 'csv');
  assert.equal(answer.attachment.delimiter, ';');
  assert.deepEqual(answer.sheets, [{ name: 'clients', rows: 3, columns: 3 }]);
  assert.deepEqual(answer.sheet.header, ['Nom', 'Ville', 'Commentaire']);
  assert.deepEqual(answer.sheet.rows, [['Dupont', 'Lyon', 'Client ; fidèle'], ['Martin', 'Paris', 'Deux\nlignes'], ['Le "Grand" Café', 'Nice', '']]);
  const latin = run({ name: 'export.tsv' }, host([file('export.tsv', Buffer.from('a\tb\nCaf\xe9\t1\n', 'latin1'), { encoding: 'windows-1252' })]));
  assert.equal(latin.attachment.delimiter, 'tab');
  assert.equal(latin.attachment.encoding, 'windows-1252');
  assert.deepEqual(latin.sheet.rows, [['Café', '1']]);
});

// ---- documents ------------------------------------------------------------------------------------------------------

test('a Word document answers its paragraphs and tables as text, never its tab stops', () => {
  const body = para('Cahier des charges') + para('Objet :', '<w:r><w:tab/><w:t>Demande de matériel</w:t></w:r>')
    + '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Article</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Quantité</w:t></w:r></w:p></w:tc></w:tr>'
    + '<w:tr><w:tc><w:p><w:r><w:t>Gants</w:t></w:r></w:p><w:p><w:r><w:t>taille M</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>10</w:t></w:r></w:p></w:tc></w:tr></w:tbl>'
    + para('Fin', '<w:r><w:delText>supprimé</w:delText><w:instrText>PAGE</w:instrText><w:br/><w:t>suite</w:t></w:r>');
  const answer = run({ name: 'cahier.docx' }, host([file('cahier.docx', docx(body))]));
  assert.equal(answer.attachment.format, 'docx');
  assert.equal(answer.document.text, 'Cahier des charges\nObjet :\tDemande de matériel\n| Article | Quantité |\n| Gants taille M | 10 |\n\nFin\nsuite');
  assert.equal(answer.document.totalChars, answer.document.text.length);
  assert.equal(answer.document.nextOffset, undefined);
});

test('OpenDocument text and PowerPoint slides answer their text', () => {
  const odt = zip({
    mimetype: 'application/vnd.oasis.opendocument.text',
    'content.xml': '<office:document-content xmlns:office="o" xmlns:text="t" xmlns:table="b"><office:automatic-styles><style:style/></office:automatic-styles><office:body><office:text><text:h>Note</text:h><text:p>Un<text:s/>texte<text:tab/>avec <text:span>style</text:span><text:line-break/>fin</text:p><table:table><table:table-row><table:table-cell><text:p>A</text:p></table:table-cell><table:table-cell><text:p>B</text:p></table:table-cell></table:table-row></table:table></office:text></office:body></office:document-content>'
  });
  assert.equal(run({ name: 'note.odt' }, host([file('note.odt', odt)])).document.text, 'Note\nUn texte\tavec style\nfin\n| A | B |');
  const slide = n => `<p:sld xmlns:p="p" xmlns:a="a"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Titre ${n}</a:t></a:r></a:p><a:p><a:r><a:t>Point</a:t></a:r><a:r><a:t> ${n}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`;
  const pptx = zip({ 'ppt/presentation.xml': '<p:presentation xmlns:p="p"/>', 'ppt/slides/slide10.xml': slide(10), 'ppt/slides/slide2.xml': slide(2) });
  const answer = run({ name: 'deck.pptx' }, host([file('deck.pptx', pptx)]));
  assert.equal(answer.document.slides, 2);
  assert.equal(answer.document.text, '[slide 1]\nTitre 2\nPoint 2\n\n[slide 2]\nTitre 10\nPoint 10');
});

test('a PDF answers its pages a chunk at a time, read only as far as the chunk asked', () => {
  const pages = [];
  for (let i = 0; i < 40; i++) pages.push(`Article ${i + 1}  \r\n` + 'Le texte de la page. '.repeat(60));
  const h = host([pdfFile('reglement.pdf', pages)]);
  const first = run({ name: 'reglement.pdf' }, h);
  assert.equal(first.attachment.format, 'pdf');
  assert.equal(first.document.pages, 40);
  assert.ok(first.document.text.startsWith('[page 1]\nArticle 1\nLe texte'));
  assert.equal(first.document.returned, 10000);
  assert.equal(first.document.totalChars, undefined);
  assert.ok(first.document.pagesRead < 40, String(first.document.pagesRead));
  assert.equal(first.document.nextOffset, 10000);
  assert.ok(h.calls.pdf[0].maxChars < 20000, JSON.stringify(h.calls.pdf));
  const tail = run({ name: 'reglement.pdf', offset: 45000 }, h);
  assert.equal(tail.document.totalChars, tail.document.offset + tail.document.returned);
  assert.equal(tail.document.nextOffset, undefined);
  assert.ok(tail.document.text.endsWith('Le texte de la page.'));
  const scan = run({ name: 'scan.pdf' }, host([pdfFile('scan.pdf', ['', ''])]));
  assert.ok(scan.notes.some(n => /no text layer/.test(n)));
});

test('a text file answers its text, a long one by offset', () => {
  const text = 'ligne\n'.repeat(3000);
  const h = host([file('notes.md', text)]);
  const first = run({ name: 'notes.md' }, h);
  assert.equal(first.attachment.format, 'text');
  assert.equal(first.document.totalChars, 18000);
  assert.ok(size(first) < 16000, String(size(first)));
  const second = run({ name: 'notes.md', offset: first.document.nextOffset }, h);
  assert.equal(second.document.offset + second.document.returned <= 18000, true);
});

// ---- the user's own attachments, by name only ----------------------------------------------------------------------

test('only the attachments of the authenticated user, chosen by file name: a path keeps its name, never its folders', () => {
  const files = [file('old.csv', 'a,b\n1,2\n', { modified: 1 }), file('liste.csv', 'x,y\n1,2\n', { modified: 5 }), file('liste.csv', 'x,y\n3,4\n', { modified: 9 })];
  assert.equal(run({ name: 'liste.csv' }, host(files, { owner: '' })).error.code, 'auth_required');
  const h = host(files);
  const viaPath = run({ name: '/workspace/agents/attachments/someone-else--0000/shared/liste.csv' }, h);
  assert.equal(viaPath.status, 'ok');
  // two attachments of that name: the newest
  assert.deepEqual(viaPath.sheet.rows, [['3', '4']]);
  assert.ok(viaPath.notes[0].startsWith('2 attachments are named "liste.csv"'));
  assert.equal(run({ name: '..\\..\\LISTE.CSV' }, h).status, 'ok');
  const missing = run({ name: 'budget.xlsx' }, h);
  assert.equal(missing.error.code, 'not_found');
  assert.deepEqual(missing.error.available, ['liste.csv', 'liste.csv', 'old.csv']);
  const listed = run({}, h);
  assert.equal(listed.total, 3);
  assert.deepEqual(listed.attachments.map(a => a.name), ['liste.csv', 'liste.csv', 'old.csv']);
  assert.equal(JSON.stringify(listed).includes('/'), false, 'no path is answered');
  assert.equal(run({}, host([])).notes[0].startsWith('The user has no attachment.'), true);
});

test('refused clearly: images, Office 97-2003 files, files too big, a DTD, a zip bomb, an unknown binary, a damaged file', () => {
  const ole = Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1, 0, 0]);
  const cases = [
    [file('photo.png', Buffer.from([0x89, 0x50, 0x4E, 0x47])), 'unsupported_type', /is an image/],
    [file('ancien.xls', ole), 'unsupported_type', /Excel 97-2003 workbook \(\.xls\).*\.xlsx, \.docx, \.csv or \.pdf/],
    [file('renomme.xlsx', ole), 'unsupported_type', /Excel 97-2003/],
    [file('gros.xlsx', WORKBOOK, { bytes: 11 * 1024 * 1024 }), 'too_big', /11 MB; attachments are read up to 10 MB/],
    [file('dtd.docx', docx('').toString('latin1').length ? zip({ 'word/document.xml': '<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "aaaa">]><w:document/>' }) : null), 'unreadable', /DTD/],
    [file('bomb.xlsx', zip(Object.assign(Object.fromEntries(unzip(xlsx([{ name: 'S', rows: [['a']] }]))), { 'xl/worksheets/sheet1.xml': 'x'.repeat(31 * 1024 * 1024) }))), 'too_big', /inflates/],
    [file('archive.zip', zip({ 'a.txt': 'hello' })), 'unsupported_type', /zip archive/],
    [file('data.bin', Buffer.from([1, 0, 2, 0, 3])), 'unsupported_type', /binary file/],
    [file('faux.pdf', 'pas un pdf'), 'unreadable', /named \.pdf but does not hold a valid \.pdf file/]
  ];
  for (const [f, code, message] of cases) {
    const answer = run({ name: f.name }, host([f]));
    assert.equal(answer.status, 'error', f.name);
    assert.equal(answer.error.code, code, f.name + ': ' + JSON.stringify(answer));
    assert.match(answer.error.message, message, f.name);
  }
  // rows left open (a damaged or crafted sheet) are refused at once, not searched for to the end from each row
  const open = zip(Object.assign(Object.fromEntries(unzip(xlsx([{ name: 'S', rows: [['a']] }]))), {
    'xl/worksheets/sheet1.xml': '<worksheet><sheetData>' + '<row r="1"><c r="A1"><v>1</v></c>'.repeat(40000) + '</sheetData></worksheet>'
  }));
  const started = Date.now();
  const damagedRows = run({ name: 'open.xlsx' }, host([file('open.xlsx', open)]));
  assert.equal(damagedRows.error.code, 'unreadable');
  assert.match(damagedRows.error.message, /not closed/);
  assert.ok(Date.now() - started < 3000, 'linear check');
  // the bomb part is never inflated past the cap of one part
  const workbook = xlsx([{ name: 'S', rows: [['a']] }]);
  const broken = Buffer.from(workbook);
  broken.write('PK\u0003\u0004', 0, 'latin1');
  const damaged = run({ name: 'damaged.xlsx' }, host([file('damaged.xlsx', broken.subarray(0, 60))]));
  assert.equal(damaged.error.code, 'unreadable');
});

// ---- registration ---------------------------------------------------------------------------------------------------

test('registered as a read of the No Code tools and of the Studio, held by no write confirmation', () => {
  const project = read('c8oProject.yaml');
  assert.match(project, /↓tools_nocode_attachment_read \[sequences\.GenericSequence\]: 🗏 sequences\/tools_nocode_attachment_read\.yaml/);
  assert.match(project, /↓tools_attachment_read \[sequences\.GenericSequence\]: 🗏 sequences\/tools_attachment_read\.yaml/);
  const nocodeSequence = read('_c8oProject/sequences/tools_nocode_attachment_read.yaml');
  assert.match(nocodeSequence, /owner: C8O\.reporting\.requestFeedbackUserKey\(\)/);
  assert.match(nocodeSequence, /never with a shell or its path/);
  const studioSequence = read('_c8oProject/sequences/tools_attachment_read.yaml');
  assert.match(studioSequence, /if \(!C8O\.reporting\.localStudio\(\)\) \{/);
  assert.match(studioSequence, /owner: "studio"/);
  for (const sequence of [nocodeSequence, studioSequence]) {
    assert.match(sequence, /↓\w+ \[steps\.SimpleStep-\d+\]: \n/, 'trailing space of a key line');
    const js = /expression: \|\n((?:    .*\n)+?)↓/.exec(sequence)[1].trim();
    assert.equal(js.slice(1, -1).includes("'"), false, 'no apostrophe inside the quoted expression');
  }
  const policy = {};
  vm.runInNewContext(read('js/nocode_tool_policy.js'), policy);
  assert.equal(policy.C8O.nocodeToolPolicy.allows('tools_nocode_attachment_read'), true);
  assert.equal(policy.C8O.nocodeToolPolicy.allows('tools_attachment_read'), false);
  const confirm = read('js/studio_write_confirm.js');
  assert.match(confirm, /tools_attachment_read: true/);
  assert.match(confirm, /tools_nocode_attachment_read: true/);
  assert.match(read('js/setup_vibe.js'), /"Convertigo_attachment-read",/);
  assert.match(read('js/mcp_endpoint_router.js'), /tools_nocode_attachment_read: \{ file: "name",[^}]*path: "name"/);
  assert.match(read('TOOLS.md'), /\| `nocode-attachment-read` \| `tools_nocode_attachment_read` \|/);
  assert.match(read('TOOLS.md'), /\| `attachment-read` \| `tools_attachment_read` \|/);
  assert.match(nocodeSkillText(), /`nocode-attachment-read`/);
});

test('the input schema takes a file name, never a path, and every answer fits its output schema', () => {
  const sandbox = { C8O: {} };
  sandbox.include = file => vm.runInContext(read(file), sandbox, { filename: file });
  vm.createContext(sandbox);
  vm.runInContext(read('js/schema_overrides.js'), sandbox);
  const input = sandbox.C8O.schemaOverrides.applyInput('tools_nocode_attachment_read', {}, null);
  assert.deepEqual(Object.keys(input.properties).sort(), ['limit', 'name', 'offset', 'sheet', 'token']);
  assert.equal(input.additionalProperties, false);
  assert.deepEqual(Object.keys(sandbox.C8O.schemaOverrides.applyInput('tools_attachment_read', {}, null).properties).sort(), ['limit', 'name', 'offset', 'sheet']);
  const output = sandbox.C8O.schemaOverrides.applyOutput('tools_nocode_attachment_read', {}, null);
  assert.equal(output.additionalProperties, true);
  assert.equal(output.properties.sheet.additionalProperties, true);
});
