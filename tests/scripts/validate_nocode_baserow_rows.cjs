// Run: node --test tests/scripts/validate_nocode_baserow_rows.cjs
// nocode-baserow-rows-list against a fake lib_BaseRow: the fields are read with the user's Bearer (the table check), the
// rows through TableGetDataNative called natively (its outputs as a map, the Baserow page as the raw text), as the
// viewer's grids read them. The fake applies the filter expression, the order and the page it receives.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
// Objects built inside the vm come from another realm: compare their JSON.
const plain = value => JSON.parse(JSON.stringify(value));

const FIELDS = [
  { id: 301, name: 'Name', type: 'text', primary: true },
  { id: 302, name: 'Stage', type: 'single_select', select_options: [{ id: 1, value: 'Open', color: 'blue' }, { id: 2, value: 'Won', color: 'green' }] },
  { id: 303, name: 'Company', type: 'link_row', link_row_table_id: 31 },
  { id: 304, name: 'Amount', type: 'number' },
  { id: 305, name: 'Total, VAT', type: 'formula', formula_type: 'number' },
  { id: 306, name: 'Notes', type: 'long_text' },
  { id: 307, name: 'Files', type: 'file' },
  { id: 308, name: 'Tags', type: 'multiple_select' },
  { id: 309, name: 'Prices', type: 'lookup', formula_type: 'array' },
  { id: 310, name: 'Created by', type: 'created_by' }
];

function deal(i) {
  return {
    id: i,
    order: i + '.00000000000000000000',
    Name: 'Deal ' + i,
    Stage: { id: i % 2 ? 1 : 2, value: i % 2 ? 'Open' : 'Won', color: i % 2 ? 'blue' : 'green' },
    Company: [{ id: 100 + i, value: 'Company ' + i, order: '1.0' }],
    Amount: String(i * 100) + '.00',
    'Total, VAT': String(i * 120) + '.00',
    Notes: i === 3 ? 'x'.repeat(2500) : 'note ' + i,
    Files: i === 1 ? [{ url: 'https://media.example.invalid/signed', thumbnails: { tiny: { url: 'https://t' } }, visible_name: 'quote.pdf', name: 'abc_quote.pdf', size: 1200, mime_type: 'application/pdf', is_image: false }] : [],
    Tags: [{ id: 7, value: 'vip', color: 'red' }],
    Prices: [{ id: 200 + i, value: '9.50' }, { id: 300 + i, value: '1.25' }],
    'Created by': { id: 3, name: 'Person' }
  };
}

function fakeBaserow(options = {}) {
  const state = { calls: [], rows: Array.from({ length: options.rowCount ?? 55 }, (_, i) => deal(i + 1)) };
  const cell = value => value && typeof value === 'object' && !Array.isArray(value) && 'value' in value ? String(value.value) : Array.isArray(value) ? value.map(cell).join(',') : String(value);
  function matches(row, node) {
    const results = node.filters.map(item => item.filters ? matches(row, item) : leaf(row, item));
    return node.mode === 'OR' ? results.some(Boolean) : results.every(Boolean);
  }
  function leaf(row, { field, op, value }) {
    const text = cell(row[field]);
    switch (op) {
      case 'equal': case 'single_select_equal': return text === value;
      case 'contains': return text.toLowerCase().includes(String(value).toLowerCase());
      case 'higher_than': return Number(text) > Number(value);
      case 'single_select_is_any_of': return value.split(',').includes(text);
      default: throw new Error('fake filter ' + op);
    }
  }
  function tableGetDataNative(params) {
    if (options.nativeAnswer) return options.nativeAnswer;
    let rows = state.rows.slice();
    if (params.filterExpression) rows = rows.filter(row => matches(row, JSON.parse(params.filterExpression)));
    if (params.order_by) {
      const sorts = JSON.parse(params.order_by).sorts;
      rows.sort((a, b) => {
        for (const { name, order } of sorts) {
          const x = cell(a[name]); const y = cell(b[name]);
          const delta = isNaN(x) || isNaN(y) ? x.localeCompare(y) : Number(x) - Number(y);
          if (delta) return order === 'desc' ? -delta : delta;
        }
        return a.id - b.id;
      });
    }
    if (params.include_fields) {
      const names = params.include_fields.match(/"(?:[^"\\]|\\.)*"|[^,]+/g).map(n => n.startsWith('"') ? JSON.parse(n) : n);
      rows = rows.map(row => Object.fromEntries(Object.entries(row).filter(([key]) => key === 'id' || key === 'order' || names.includes(key))));
    }
    const page = Number(params.page); const size = Number(params.size);
    if ((page - 1) * size >= rows.length && page > 1) return { raw: JSON.stringify({ error: 'ERROR_INVALID_PAGE', detail: 'Invalid page.' }) };
    const results = rows.slice((page - 1) * size, page * size);
    const next = page * size < rows.length ? 'http://baserow/api/database/rows/table/30/?page=' + (page + 1) : null;
    return { raw: JSON.stringify(options.rawPage || { count: rows.length, next, previous: null, results }) };
  }
  function transport(name, params) {
    state.calls.push({ name, params });
    switch (name) {
      case 'nocode_validate_token':
        return options.unauthenticated
          ? { document: { error: { code: 'invalid_token', message: 'expired' } } }
          : { document: { result: { status: 'ok', authenticated: true, user: 'person@example.invalid' } } };
      case 'formscommon_ApplicationsList': return { document: { array: [{ id: 20, name: 'Sales', type: 'database', workspace: { id: 10, name: 'Team' }, tables: [{ id: 30, name: 'Deals', database_id: 20 }, { id: 32, name: 'Deals copy', database_id: 20 }] }] } };
      case 'BaserowAccountGet': return options.noAccount ? { document: { error: { code: 1, message: 'no account' } } } : { document: { email: 'person@example.invalid', password: 'secret' } };
      case 'TokenGetOrRefresh': return { document: { Bearer: params.email ? 'JWT user-token' : 'JWT admin-token' } };
      case '_api_database_fields_table__table_id___GET':
        assert.equal(params.__nocache, 'true', 'the fields are read past the response cache');
        if (options.foreign || params.table_id !== '30') return { document: { object: { error: 'ERROR_USER_NOT_IN_GROUP', detail: 'The user does not belong to the workspace.' } } };
        return { document: { array: FIELDS.slice() } };
      case 'TableGetDataNative':
        assert.equal(params.__nativeCall, 'true', 'TableGetDataNative is called natively, its outputs as a map');
        return { native: tableGetDataNative(params) };
      default: throw new Error('unexpected call ' + name);
    }
  }
  return { state, transport };
}

function javaMap(object) {
  const entries = Object.entries(object);
  return { entrySet: () => ({ iterator: () => { let i = 0; return { hasNext: () => i < entries.length, next: () => { const [key, value] = entries[i++]; return { getKey: () => key, getValue: () => value }; } }; } }) };
}

function load(transport) {
  const empty = new Proxy(function () {}, { get: (_, key) => key === Symbol.toPrimitive ? () => '' : empty });
  class HashMap { constructor() { this.values = {}; } put(key, value) { this.values[key] = value; } }
  class InternalRequester {
    constructor(params) { this.params = params.values; }
    processRequest() {
      const response = transport(this.params.__sequence || this.params.__transaction, this.params);
      if (response && response.native !== undefined) {
        return typeof response.native === 'string' ? response.native : javaMap(response.native);
      }
      return { getDocumentElement: () => response };
    }
    getContext() { return {}; }
  }
  const engine = { theApp: { contextManager: { remove() {} } } };
  const mdc = {};
  const packages = new Proxy(empty, { get: (_, key) => {
    if (key === 'java') return { util: { HashMap } };
    if (key === 'com') return { twinsoft: { convertigo: { engine: { Engine: engine, requesters: { InternalRequester, InternalHttpServletRequest: class {} }, util: { XMLUtils: { XmlToJson: response => JSON.stringify(response) } }, enums: empty } } } };
    return empty;
  } });
  const sandbox = {
    Packages: packages,
    java: { lang: { System: { currentTimeMillis: () => 1800000000000 }, String, reflect: { Array: { newInstance: () => [] } } } },
    org: { apache: { log4j: { MDC: { get: k => mdc[k], put: (k, v) => { mdc[k] = v; }, remove: k => { delete mdc[k]; } } } } }
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'js/nocode_baserow.js'), 'utf8'), sandbox, { filename: 'js/nocode_baserow.js' });
  return sandbox.C8O.nocodeBaserow;
}

function rowsList(options, fakeOptions) {
  const fake = fakeBaserow(fakeOptions);
  const result = plain(load(fake.transport).rowsList(Object.assign({ token: 't' }, options)));
  return { result, calls: fake.state.calls, native: fake.state.calls.find(c => c.name === 'TableGetDataNative') };
}

const WRITES = /POST|PATCH|DELETE|Create|Update|Delete|forms_AddRow/;

test('a page of rows is read with the user\'s Baserow account through TableGetDataNative, nothing written', () => {
  const { result, calls, native } = rowsList({ table: 30 });
  assert.equal(result.status, 'ok', JSON.stringify(result.error));
  assert.equal(native.params.authorization, 'JWT user-token', 'the Bearer of the user, never the admin account');
  assert.equal(native.params.raw_json, 'true');
  assert.equal(native.params.table_id, '30');
  assert.deepEqual([native.params.page, native.params.size], ['1', '20']);
  assert.equal(native.params.include_fields, undefined, 'every field by default');
  assert.equal(calls.find(c => c.name === '_api_database_fields_table__table_id___GET').params.__header_Authorization, 'JWT user-token');
  assert.ok(!calls.some(c => c.name === 'TokenGetOrRefresh' && !c.params.email), 'the admin account is never asked');
  assert.ok(!calls.some(c => WRITES.test(c.name)), 'nothing is written');
  assert.deepEqual([result.count, result.total, result.page, result.size, result.nextPage], [20, 55, 1, 20, 2]);
  assert.deepEqual(result.table, { id: 30 });
  assert.deepEqual(result.fields.map(f => f.name), FIELDS.map(f => f.name));
  assert.deepEqual(result.fields[0], { name: 'Name', type: 'text', primary: true });
  assert.deepEqual(result.fields[4], { name: 'Total, VAT', type: 'formula', formulaType: 'number' });
});

test('cells read as an agent compares them: labels, links, values of a lookup, names of files and users, long texts cut', () => {
  const { result } = rowsList({ table: 30, size: 3 });
  const [first, , third] = result.rows;
  assert.deepEqual(first, {
    id: 1, Name: 'Deal 1', Stage: 'Open', Company: [{ id: 101, value: 'Company 1' }], Amount: '100.00', 'Total, VAT': '120.00',
    Notes: 'note 1', Files: [{ name: 'quote.pdf', mimeType: 'application/pdf', size: 1200 }], Tags: ['vip'], Prices: ['9.50', '1.25'], 'Created by': 'Person'
  });
  assert.equal(first.order, undefined);
  assert.doesNotMatch(JSON.stringify(result), /signed|thumbnails|color/);
  assert.equal(third.Notes.length, 2001);
  assert.ok(third.Notes.endsWith('…'));
  assert.deepEqual(result.notes, ['1 text cell longer than 2000 characters is cut (…).']);
});

test('fields, sort and pages: names matched to the table, quoted for Baserow, the last page has no next', () => {
  const { result, native } = rowsList({ table: '30', fields: '["amount", "Total, VAT", "Name"]', sort: '-Amount,name', page: '3', size: '25' });
  assert.equal(result.status, 'ok', JSON.stringify(result.error));
  assert.equal(native.params.include_fields, 'Amount,"Total, VAT",Name');
  assert.deepEqual(JSON.parse(native.params.order_by), { sorts: [{ name: 'Amount', order: 'desc' }, { name: 'Name', order: 'asc' }] });
  assert.deepEqual(result.fields.map(f => f.name), ['Amount', 'Total, VAT', 'Name']);
  assert.deepEqual(Object.keys(result.rows[0]), ['id', 'Amount', 'Total, VAT', 'Name']);
  assert.deepEqual([result.count, result.total, result.nextPage, result.rows[0].Name], [5, 55, null, 'Deal 5']);
  const listed = rowsList({ table: 30, fields: ['Name'], sort: '[{"column":"amount","order":"desc"}]', size: 1 });
  assert.deepEqual(JSON.parse(listed.native.params.order_by), { sorts: [{ name: 'Amount', order: 'desc' }] });
  assert.deepEqual(listed.result.rows, [{ id: 55, Name: 'Deal 55' }]);
});

test('a page is 50 rows at most and starts from 1', () => {
  const capped = rowsList({ table: 30, size: 200 });
  assert.equal(capped.native.params.size, '50');
  assert.deepEqual([capped.result.size, capped.result.count, capped.result.nextPage], [50, 50, 2]);
  assert.match(capped.result.notes[0], /size 200 is above 50/);
  for (const page of ['0', '-1', 'two']) {
    const refused = rowsList({ table: 30, page });
    assert.deepEqual([refused.result.status, refused.result.error.code], ['invalid_request', 'invalid_page'], page);
    assert.equal(refused.native, undefined);
  }
  const past = rowsList({ table: 30, page: 9 });
  assert.deepEqual([past.result.status, past.result.error.code], ['invalid_request', 'invalid_page']);
  assert.match(past.result.error.message, /past the last page/);
});

test('the reduced filter of the contract becomes the filter expression of TableGetDataNative', () => {
  const filter = { all: [
    { column: 'stage', operator: 'single_select_is_any_of', value: ['Open', 'Won'] },
    { any: [{ column: 'Name', operator: 'contains', value: 'Deal 1' }, { column: 'Amount', operator: 'higher_than', value: 5000 }] },
    { column: 'Name', operator: 'contains', value: { value: 'Deal' } }
  ] };
  const { result, native } = rowsList({ table: 30, filter: JSON.stringify(filter), fields: ['Name'], size: 50 });
  assert.equal(result.status, 'ok', JSON.stringify(result.error));
  assert.deepEqual(JSON.parse(native.params.filterExpression), { mode: 'AND', filters: [
    { field: 'Stage', op: 'single_select_is_any_of', value: 'Open,Won' },
    { mode: 'OR', filters: [{ field: 'Name', op: 'contains', value: 'Deal 1' }, { field: 'Amount', op: 'higher_than', value: '5000' }] },
    { field: 'Name', op: 'contains', value: 'Deal' }
  ] });
  // Deal 1, 10..19 contain "Deal 1"; 51..55 are above 5000.
  assert.deepEqual(result.rows.map(r => r.id), [1, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 51, 52, 53, 54, 55]);
  assert.equal(result.total, 16);
  const single = rowsList({ table: 30, filter: { column: 'Stage', operator: 'single_select_equal', value: 'Won' } });
  assert.deepEqual(JSON.parse(single.native.params.filterExpression), { mode: 'AND', filters: [{ field: 'Stage', op: 'single_select_equal', value: 'Won' }] });
  assert.equal(single.result.total, 27);
  assert.equal(rowsList({ table: 30, filter: { all: [] } }).native.params.filterExpression, undefined, 'an empty group filters nothing');
  for (const none of [{}, '{}', 'null', '']) {
    const absent = rowsList({ table: 30, filter: none, sort: 'null', page: 'null', size: '' });
    assert.equal(absent.result.status, 'ok', JSON.stringify(none));
    assert.deepEqual([absent.native.params.filterExpression, absent.native.params.order_by, absent.native.params.page, absent.native.params.size], [undefined, undefined, '1', '20']);
  }
  // A sequence variable reaches the code as a Java string: its JSON is read, not taken for an object.
  const javaString = text => ({ getClass: () => ({}), toString: () => text });
  const fromJava = rowsList({ table: javaString('30'), fields: javaString('["Name"]'), filter: javaString('{"column":"Stage","operator":"single_select_equal","value":"Won"}'), size: javaString('2') });
  assert.equal(fromJava.result.status, 'ok', JSON.stringify(fromJava.result.error));
  assert.deepEqual(fromJava.result.rows, [{ id: 2, Name: 'Deal 2' }, { id: 4, Name: 'Deal 4' }]);
});

test('a filter, a field or a sort the table cannot take is refused before any row is read', () => {
  const cases = [
    [{ filter: { column: 'Stage', operator: 'equal', value: { field: 'stage_input' } } }, 'invalid_filter', /literal values/],
    [{ filter: { column: 'Stge', operator: 'equal', value: 'Open' } }, 'unknown_field', /filter: the table has no field "Stge"\. Did you mean "Stage"\? Its fields: Name, Stage/],
    [{ filter: { column: 'Stage', operator: 'is equal', value: 'Open' } }, 'invalid_filter', /not a Baserow filter type/],
    [{ filter: { column: 'Stage' } }, 'invalid_filter', /\{ column, operator, value \}/],
    [{ filter: { any: [{ column: 'Name', operator: 'contains', value: 'a' }, 'Stage'] } }, 'invalid_filter', /filter\.any\[1\]/],
    [{ filter: '[1, 2]' }, 'invalid_filter', /a condition/],
    [{ fields: ['Name', 'Amout'] }, 'unknown_field', /fields: the table has no field "Amout"\. Did you mean "Amount"\?/],
    [{ sort: 'Stage,-Dte' }, 'unknown_field', /sort: the table has no field "Dte"/]
  ];
  for (const [options, code, message] of cases) {
    const { result, native } = rowsList(Object.assign({ table: 30 }, options));
    assert.deepEqual([result.status, result.error.code], ['invalid_request', code], JSON.stringify(options));
    assert.match(result.error.message, message);
    assert.equal(native, undefined, 'no row is read');
  }
  let deep = { column: 'Name', operator: 'contains', value: 'a' };
  for (let i = 0; i < 10; i++) deep = { all: [deep] };
  assert.equal(rowsList({ table: 30, filter: deep }).result.error.code, 'invalid_filter');
});

test('a table the user cannot read is refused, and no row is read', () => {
  const foreign = rowsList({ table: 30 }, { foreign: true });
  assert.deepEqual([foreign.result.status, foreign.result.error.code], ['unauthorized', 'table_not_readable']);
  assert.match(foreign.result.error.message, /ERROR_USER_NOT_IN_GROUP/);
  assert.equal(foreign.native, undefined);
  const noAccount = rowsList({ table: 30 }, { noAccount: true });
  assert.deepEqual([noAccount.result.status, noAccount.result.error.code], ['unauthorized', 'baserow_account_unavailable']);
  assert.ok(!noAccount.calls.some(c => c.name === 'TokenGetOrRefresh' || c.name === '_api_database_fields_table__table_id___GET' || c.name === 'TableGetDataNative'), 'without the user\'s account nothing is read, the admin account is never asked');
  const anonymous = rowsList({ table: 30 }, { unauthenticated: true });
  assert.equal(anonymous.result.status, 'auth_required');
  assert.deepEqual(anonymous.calls.map(c => c.name), ['nocode_validate_token']);
  const missing = rowsList({});
  assert.deepEqual([missing.result.status, missing.result.error.code], ['invalid_request', 'table_required']);
});

test('a table named by its path is found in the user\'s catalog', () => {
  const byPath = rowsList({ table: 'team~>sales~>deals', fields: ['Name'], size: 1 });
  assert.equal(byPath.result.status, 'ok', JSON.stringify(byPath.result.error));
  assert.deepEqual(byPath.result.table, { id: 30, path: 'Team~>Sales~>Deals' });
  assert.equal(byPath.native.params.table_id, '30');
  assert.equal(rowsList({ table: 'Deals', size: 1 }).result.table.id, 30, 'a name alone when one table has it');
  const unknown = rowsList({ table: 'Team~>Sales~>Leads' });
  assert.deepEqual([unknown.result.status, unknown.result.error.code], ['invalid_request', 'table_not_in_catalog']);
  const elsewhere = rowsList({ table: 32 });
  assert.equal(elsewhere.result.error.code, 'table_not_readable', 'an id the user cannot read, whatever the catalog');
});

test('the answers of TableGetDataNative that are not a page say what Baserow refused', () => {
  const refusedFilter = rowsList({ table: 30, filter: { column: 'Files', operator: 'higher_than', value: 1 } },
    { nativeAnswer: { raw: JSON.stringify({ error: 'ERROR_VIEW_FILTER_TYPE_UNSUPPORTED_FIELD', detail: 'The filter type higher_than is not compatible with the type file.' }) } });
  assert.deepEqual([refusedFilter.result.status, refusedFilter.result.error.code], ['invalid_request', 'baserow_refused_query']);
  assert.match(refusedFilter.result.error.message, /ERROR_VIEW_FILTER_TYPE_UNSUPPORTED_FIELD: The filter type higher_than/);
  // An error step of the sequence builds a document: the native call answers its JSON text.
  const errorStep = rowsList({ table: 30 }, { nativeAnswer: JSON.stringify({ error: { code: '100', message: 'A filter field was not found in the list of table columns' } }) });
  assert.equal(errorStep.result.error.code, 'baserow_refused_query');
  const token = rowsList({ table: 30 }, { nativeAnswer: { error: JSON.stringify({ code: 'ERROR_USER_NOT_IN_GROUP', message: 'no access' }) } });
  assert.deepEqual([token.result.status, token.result.error.code], ['unauthorized', 'table_not_readable']);
  const empty = rowsList({ table: 30 }, { nativeAnswer: {} });
  assert.deepEqual([empty.result.status, empty.result.error.code], ['error', 'baserow_rows_failed']);
  const noRows = rowsList({ table: 30 }, { rowCount: 0 });
  assert.deepEqual([noRows.result.status, noRows.result.count, noRows.result.total, noRows.result.nextPage], ['ok', 0, 0, null]);
});

test('the tool is declared, allowed in No Code with its schema and aliases, and documented in the skill', () => {
  const read = file => fs.readFileSync(path.join(root, file), 'utf8');
  assert.match(read('c8oProject.yaml'), /↓tools_nocode_baserow_rows_list \[sequences\.GenericSequence\]: 🗏 sequences\/tools_nocode_baserow_rows_list\.yaml\n/);
  const sequence = read('_c8oProject/sequences/tools_nocode_baserow_rows_list.yaml');
  assert.match(sequence, /^accessibility: Private\n/);
  assert.match(sequence, /include\("js\/nocode_baserow\.js"\);\n\s+result = C8O\.nocodeBaserow\.rowsList\(\{/);
  for (const name of ['token', 'table', 'fields', 'filter', 'sort', 'page', 'size']) {
    assert.match(sequence, new RegExp('↓' + name + ' \\[variables\\.RequestableVariable-\\d+\\]: \\n'), name);
    if (name !== 'token') assert.match(sequence, new RegExp(name + ': typeof ' + name + ' === "undefined" \\? null : ' + name), name);
  }
  assert.match(sequence, /↓table \[variables\.RequestableVariable-\d+\]: \n(?:  .*\n)*  required: true\n/);
  assert.doesNotMatch(sequence, /^  (comment|description): [^'|].*: /m, 'a value holding ": " is quoted');
  const policy = {};
  vm.runInNewContext(read('js/nocode_tool_policy.js'), policy);
  assert.equal(policy.C8O.nocodeToolPolicy.allows('tools_nocode_baserow_rows_list'), true);

  const overrides = { C8O: {}, include() {} };
  vm.runInNewContext(read('js/schema_overrides.js'), overrides);
  const schema = plain(overrides.C8O.schemaOverrides.applyInput('tools_nocode_baserow_rows_list', null, null));
  assert.deepEqual(schema.required, ['table']);
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(Object.keys(schema.properties).sort(), ['fields', 'filter', 'page', 'size', 'sort', 'table', 'token']);
  assert.deepEqual([schema.properties.size.maximum, schema.properties.size.default], [50, 20]);

  const router = read('js/mcp_endpoint_router.js');
  const aliases = /var ARGUMENT_ALIASES = (\{[\s\S]*?\n\});/.exec(router)[1];
  const table = vm.runInNewContext('(' + aliases + ')').tools_nocode_baserow_rows_list;
  assert.deepEqual([table.tableId, table.table_id_int, table.columns, table.order_by, table.limit], ['table', 'table', 'fields', 'sort', 'size']);

  const skill = read('resources/convertigo-nocode/SKILL.md');
  assert.match(skill, /^- `nocode-baserow-rows-list`$/m);
  const section = skill.slice(skill.indexOf('## Reading Baserow rows'), skill.indexOf('## Preview capture'));
  assert.ok(section.length > 200, 'the skill says when to read rows');
  for (const when of [/After a save/, /computed value/, /list, gallery or chart/, /never writes/, /table_not_readable/]) {
    assert.match(section, when);
  }
  assert.match(read('TOOLS.md'), /\| `nocode-baserow-rows-list` \| `tools_nocode_baserow_rows_list` \|/);
});
