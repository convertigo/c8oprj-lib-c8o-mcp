// nocode-form-publish publishes a No Code draft only through C8Oforms.APIV2_Publish, on the user's explicit request,
// for the revision the user checked. C8Oforms is faked here; the real sequence is ~/git/C8oForms APIV2_Publish.yaml.
// Run: C8OFORMS_PROJECT_ROOT=<C8Oforms project> node --test tests/scripts/validate_nocode_publish.cjs
// (the drafts are compiled from the C8Oforms prototypes, as in validate_nocode_generation.cjs).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const formsRoot = process.env.C8OFORMS_PROJECT_ROOT || path.resolve(root, '../C8oForms');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const clone = x => JSON.parse(JSON.stringify(x));

const OWNER = 'owner@example.invalid';
const DRAFT = 'form-draft-1';
const MCP_URL = 'https://forms.example.invalid/convertigo/api/mcp';

function sandbox(transport, files) {
  class File {
    constructor(parent, child) { this.path = child ? path.join(String(parent), child) : String(parent); }
    isFile() { return fs.statSync(this.path).isFile(); }
    getAbsolutePath() { return this.path; }
    deleteOnExit() {}
    delete() { files.deleted.push(this.path); return true; }
    static createTempFile(prefix, suffix) { return new File(path.join('/tmp', prefix + (1000 + files.created.length) + suffix)); }
  }
  const empty = new Proxy(function () {}, { get: (_, key) => key === Symbol.toPrimitive ? () => '' : empty });
  class HashMap {
    constructor() { this.values = {}; }
    put(key, value) { this.values[key] = value; }
  }
  class InternalRequester {
    constructor(params) { this.params = params.values; }
    processRequest() {
      const response = transport(this.params.__sequence, clone(this.params));
      return { getDocumentElement: () => response };
    }
    getContext() { return {}; }
  }
  const engine = { theApp: { databaseObjectsManager: { getOriginalProjectByName: () => ({ getDirFile: () => formsRoot }) }, contextManager: { remove() {} } } };
  const engineApi = {
    Engine: engine,
    requesters: { InternalRequester, InternalHttpServletRequest: class {} },
    util: { XMLUtils: { XmlToJson: response => JSON.stringify(response) }, HttpUtils: { originalRequestURL: () => MCP_URL } },
    enums: empty
  };
  const packages = new Proxy(empty, { get: (_, key) => {
    if (key === 'java') return { io: { File }, util: { HashMap, Base64: empty } };
    if (key === 'com') return { twinsoft: { convertigo: { engine: engineApi } } };
    if (key === 'org') return { apache: { commons: { io: { FileUtils: { readFileToString: file => fs.readFileSync(file.path, 'utf8') } } } } };
    return empty;
  } });
  class BufferedImage {
    constructor(width, height) { this.width = width; this.height = height; }
    createGraphics() {
      const image = this;
      return { setColor(color) { image.color = color.rgb; }, fillRect() {}, dispose() {} };
    }
  }
  BufferedImage.TYPE_INT_RGB = 1;
  const context = {
    Packages: packages,
    java: {
      lang: { System: { currentTimeMillis: () => 1800000000000 }, String, reflect: { Array: { newInstance: () => [] } } },
      io: { File },
      awt: { image: { BufferedImage }, Color: class { constructor(rgb) { this.rgb = rgb; } } }
    },
    javax: { imageio: { ImageIO: { write(image, format, file) { files.created.push({ path: file.path, format, color: image.color, size: image.width }); return true; } } } },
    context: { httpServletRequest: { getHeader: () => null, getContextPath: () => '/convertigo' } }
  };
  vm.runInNewContext(read('js/nocode_forms.js'), context, { filename: 'nocode_forms.js' });
  vm.runInNewContext(read('js/nocode_publish.js'), context, { filename: 'nocode_publish.js' });
  return context.C8O;
}

function draftForm(extra = {}) {
  const C8O = sandbox(() => { throw new Error('no call expected'); }, { created: [], deleted: [] });
  const form = clone(C8O.nocodeForms.compile({ name: 'Inscription', pages: [{ name: 'Demande', fields: [{ type: 'text', name: 'nom', label: 'Nom' }] }] }).form);
  return Object.assign(form, { _id: DRAFT, _rev: '3-checked', c8o_view_type_drafts_form: true, creator: OWNER, '~c8oAcl': OWNER }, extra);
}

// The parts of APIV2_Publish (C8Oforms 2.2, js/publish_guard.js) the tool relies on: the editor check, pwa_required on
// a first publication without application metadata, the copy of the current revision (the rev it is given is ignored),
// the version and the access kept from the application document.
function harness(options = {}) {
  const state = { docs: {}, calls: [], publishes: [], reads: [], user: options.user || OWNER };
  const files = { created: [], deleted: [] };
  state.docs[DRAFT] = draftForm(options.draft);
  Object.assign(state.docs, clone(options.docs || {}));
  const transport = (sequence, params) => {
    state.calls.push(sequence);
    if (sequence === 'nocode_validate_token') return { document: { result: { authenticated: !options.authFail, user: state.user } } };
    if (sequence === 'APIV2_getDocument') {
      state.reads.push({ id: params.id, rev: params.rev });
      return { document: { res: state.docs[params.id] ? clone(state.docs[params.id]) : {} } };
    }
    if (sequence === 'APIV2_Publish') {
      const meta = JSON.parse(params.meta);
      state.publishes.push({ id: params.id, rev: params.rev, meta, file: params.file, fileDeleted: files.deleted.includes(params.file) });
      if (options.serverError) return { document: { error: { code: 'pwa_generation_failed', message: 'PWA generation failed' } } };
      if (options.refusal) return { document: { res: { error: options.refusal } } };
      if (options.onPublish) options.onPublish(state);
      const draft = state.docs[params.id];
      const publishedId = 'published_' + params.id;
      const pwaId = publishedId + '_pwa_document';
      if (!draft || draft.c8o_view_type_drafts_form !== true || draft['~c8oAcl'] !== state.user ||
          (meta.pwa && meta.pwa.originalFormId !== publishedId)) {
        return { document: { res: { error: 'unauthorized' } } };
      }
      if (!state.docs[pwaId] && !meta.pwa) return { document: { res: { pwa_required: true } } };
      const before = state.docs[publishedId];
      const anonymous = meta.pwa ? meta.pwa.notAnonymous === false : state.docs[pwaId].notAnonymous === false;
      state.docs[publishedId] = {
        _id: publishedId, parentId: params.id, parentRev: draft._rev, '~c8oAcl': draft.creator, c8o_view_type_published_form: true,
        version: String(before ? Number(before.version) + 1 : 1), sharedAnonymous: anonymous, pwa_subPath: before && before.pwa_subPath
      };
      if (meta.pwa) {
        state.docs[pwaId] = { _id: pwaId, '~c8oAcl': draft.creator, notAnonymous: meta.pwa.notAnonymous, name: meta.pwa.name };
        state.docs[publishedId].pwa_subPath = 'pwas/' + publishedId + '/index.html';
      }
      // An empty JSON object comes back from the XML response as an empty string.
      return { document: { res: '' } };
    }
    throw new Error('Unexpected requestable ' + sequence);
  };
  const C8O = sandbox(transport, files);
  const publish = (args = {}) => C8O.nocodePublish.publish(args.id === undefined ? DRAFT : args.id,
    Object.assign({ rev: '3-checked', confirm: true, token: 'unit-test-token-not-a-credential' }, args));
  return { state, files, publish };
}

function republished(access) {
  return {
    ['published_' + DRAFT]: { _id: 'published_' + DRAFT, version: '4', sharedAnonymous: access === 'anonymous', '~c8oAcl': OWNER, pwa_subPath: 'pwas/published_' + DRAFT + '/index.html' },
    ['published_' + DRAFT + '_pwa_document']: { _id: 'published_' + DRAFT + '_pwa_document', notAnonymous: access !== 'anonymous', '~c8oAcl': OWNER }
  };
}

test('nothing reaches C8Oforms without the confirmation, the draft id, the revision or a known access', () => {
  for (const [args, status, code] of [
    [{ confirm: false }, 'confirmation_required', 'confirmation_required'],
    [{ confirm: undefined }, 'confirmation_required', 'confirmation_required'],
    [{ confirm: 'yes' }, 'confirmation_required', 'confirmation_required'],
    [{ id: '' }, 'invalid', 'missing_id'],
    [{ id: 'published_' + DRAFT }, 'invalid', 'published_id'],
    [{ rev: '' }, 'invalid', 'missing_revision'],
    [{ access: 'public' }, 'invalid', 'invalid_access']
  ]) {
    const h = harness();
    const result = h.publish(args);
    assert.equal(result.status, status, JSON.stringify(args));
    assert.equal(result.published, false);
    assert.equal(result.error.code, code);
    assert.deepEqual(h.state.calls, [], JSON.stringify(args));
  }
});

test('a token failure publishes nothing', () => {
  const h = harness({ authFail: true });
  const result = h.publish();
  assert.equal(result.status, 'auth_required');
  assert.equal(result.published, false);
  assert.ok(!h.state.calls.includes('APIV2_Publish'));
});

test('a draft saved after the checked revision is a conflict, not a publication', () => {
  const h = harness({ draft: { _rev: '4-newer' } });
  const result = h.publish();
  assert.equal(result.status, 'conflict');
  assert.equal(result.error.code, 'revision_changed');
  assert.equal(result.rev, '4-newer');
  assert.equal(h.state.reads[0].rev, '', 'the latest draft is read, not the checked revision');
  assert.ok(!h.state.calls.includes('APIV2_Publish'));
});

test('a document that is not a draft, or a draft with blocking issues, is not published', () => {
  const notDraft = harness({ draft: { c8o_view_type_drafts_form: undefined } });
  assert.equal(notDraft.publish().error.code, 'not_a_draft');
  assert.ok(!notDraft.state.calls.includes('APIV2_Publish'));
  const broken = draftForm();
  broken.formulaire.push(clone(broken.formulaire[0]));
  const h = harness({ draft: { formulaire: broken.formulaire } });
  const result = h.publish();
  assert.equal(result.status, 'invalid');
  assert.equal(result.error.code, 'form_invalid');
  assert.ok(result.validation.issues.some(issue => issue.code === 'duplicate_component_id'));
  assert.ok(!h.state.calls.includes('APIV2_Publish'));
});

test('a first publication creates the application for signed-in users and answers its link', () => {
  const h = harness();
  const result = h.publish();
  assert.equal(result.status, 'ok', JSON.stringify(result));
  assert.equal(h.state.publishes.length, 2, 'Publish, then the application metadata C8Oforms asked for');
  assert.deepEqual(h.state.publishes[0].meta, { publishing: true });
  const second = h.state.publishes[1];
  assert.equal(second.rev, '3-checked');
  assert.equal(h.state.publishes[0].rev, '3-checked');
  assert.equal(second.meta.publishing, true);
  assert.equal(second.meta.pwa.notAnonymous, true);
  assert.equal(second.meta.pwa.originalFormId, 'published_' + DRAFT);
  assert.equal(second.meta.pwa.name, 'Inscription');
  assert.equal(second.meta.pwa.themeColor, '#0cbbe7');
  assert.equal(second.meta.pwa.originalThumbnail, undefined, 'an uploaded icon must never be written on the draft');
  // No custom thumbnail: a plain icon of the theme color, under a name C8Oforms accepts as an MCP upload.
  assert.deepEqual(second.meta.pwa.thumbnail, { fromVar: true, fromId: '', content_type: 'image/png' });
  assert.match(path.basename(second.file), /^c8o-nocode-thumbnail-\d+\.png$/);
  assert.equal(second.fileDeleted, false);
  assert.deepEqual(h.files.created.map(file => [file.format, file.color, file.size]), [['png', 0x0cbbe7, 512]]);
  assert.deepEqual(h.files.deleted, [second.file], 'the temporary icon is removed after the call');
  assert.deepEqual(Object.keys(result).slice(0, 4), ['status', 'published', 'id', 'rev']);
  assert.equal(result.published, true);
  assert.equal(result.publishedId, 'published_' + DRAFT);
  assert.equal(result.version, '1');
  assert.equal(result.firstPublication, true);
  assert.equal(result.access, 'authenticated');
  assert.equal(result.link, 'https://forms.example.invalid/convertigo/projects/C8Oforms/DisplayObjects/pwas/published_' + DRAFT + '/index.html');
});

test('anonymous access is set only when asked, on the first publication', () => {
  const h = harness();
  const result = h.publish({ access: 'anonymous' });
  assert.equal(result.status, 'ok');
  assert.equal(h.state.publishes[1].meta.pwa.notAnonymous, false);
  assert.equal(result.access, 'anonymous');
});

test('the application icon is the custom thumbnail of the draft, else its thumbnail color', () => {
  const custom = harness({ draft: { thumbnail: { enabled: true, index: 0, type: 'custom' }, _attachments: { thumbnail: { content_type: 'image/png', stub: true } } } });
  assert.equal(custom.publish().status, 'ok');
  assert.deepEqual(custom.state.publishes[1].meta.pwa.thumbnail, { fromVar: false, fromId: DRAFT, content_type: '' });
  assert.equal(custom.state.publishes[1].file, undefined);
  assert.deepEqual(custom.files.created, []);
  const missing = harness({ draft: { thumbnail: { enabled: true, index: 0, type: 'custom' } } });
  assert.equal(missing.publish().status, 'ok');
  assert.equal(missing.state.publishes[1].meta.pwa.thumbnail.fromVar, true, 'a custom thumbnail without attachment has nothing to copy');
  const color = harness({ draft: { thumbnail: { enabled: true, index: 0, type: 'color', color: '#2F6' } } });
  assert.equal(color.publish().status, 'ok');
  assert.equal(color.files.created[0].color, 0x22ff66);
});

test('a republication keeps the application and its access', () => {
  for (const access of ['authenticated', 'anonymous']) {
    const h = harness({ docs: republished(access) });
    const result = h.publish();
    assert.equal(result.status, 'ok');
    assert.equal(h.state.publishes.length, 1);
    assert.deepEqual(h.state.publishes[0].meta, { publishing: true });
    assert.equal(result.firstPublication, false);
    assert.equal(result.version, '5');
    assert.equal(result.access, access);
    assert.deepEqual(h.files.created, []);
    assert.equal(harness({ docs: republished(access) }).publish({ access }).status, 'ok', 'the current access may be repeated');
  }
});

test('publishing never changes the access of a published form', () => {
  const h = harness({ docs: republished('authenticated') });
  const result = h.publish({ access: 'anonymous' });
  assert.equal(result.status, 'refused');
  assert.equal(result.error.code, 'access_change_not_supported');
  assert.equal(result.access, 'authenticated');
  assert.match(result.error.message, /Manage access rights/);
  assert.ok(!h.state.calls.includes('APIV2_Publish'));
});

test('C8Oforms refusals and failures are answered as such, without retry', () => {
  const reader = harness({ draft: { '~c8oAcl': 'someone-else@example.invalid', creator: 'someone-else@example.invalid' } });
  const refused = reader.publish();
  assert.equal(refused.status, 'unauthorized');
  assert.equal(refused.published, false);
  assert.equal(reader.state.publishes.length, 1);
  const failing = harness({ serverError: true });
  const failed = failing.publish();
  assert.equal(failed.status, 'error');
  assert.equal(failed.error.code, 'publish_failed');
  assert.match(failed.error.message, /PWA generation failed/);
  assert.match(failed.error.message, /partly published/);
  assert.equal(failing.state.publishes.length, 1);
  const deleted = harness({ refusal: 'draft_not_found' });
  const gone = deleted.publish();
  assert.equal(gone.status, 'error');
  assert.equal(gone.error.code, 'draft_not_found');
  assert.equal(gone.published, false);
});

test('a save during the publication is reported: C8Oforms publishes the current revision', () => {
  const h = harness({ docs: republished('authenticated'), onPublish: state => { state.docs[DRAFT]._rev = '4-saved-meanwhile'; } });
  const result = h.publish();
  assert.equal(result.status, 'ok');
  assert.equal(result.publishedRev, '4-saved-meanwhile');
  assert.equal(result.warnings[0].code, 'newer_revision_published');
  const quiet = harness({ docs: republished('authenticated') }).publish();
  assert.equal(quiet.publishedRev, undefined);
  assert.equal(quiet.warnings, undefined);
});

test('a No Code token reaches nocode-form-publish, a guarded mutation listed in the No Code catalog', () => {
  const routerSource = read('js/mcp_endpoint_router.js');
  const start = routerSource.indexOf('  var toolNameRaw = paramsObject');
  const end = routerSource.indexOf('  if (mappingError) {', start);
  const context = {
    context: { httpServletRequest: { getHeader: () => 'nocode' } },
    C8O: { guidance: { warningForToolCall: () => '', stripToolArguments: args => args } },
    paramsObject: { name: 'nocode-form-publish', arguments: {} },
    mcpAuthentication: { kind: 'nocode' }
  };
  vm.runInNewContext(read('js/nocode_tool_policy.js'), context);
  vm.runInNewContext(read('js/gateway_tool_policy.js'), context);
  vm.runInNewContext(routerSource.slice(start, end), context);
  assert.equal(context.mappingError, null);
  assert.equal(context.targetSequence, 'tools_nocode_form_publish');
  const guidance = { include: () => {}, Packages: {}, java: { lang: { System: { getProperty: () => null } } } };
  vm.runInNewContext(read('js/guidance_version.js'), guidance);
  assert.equal(guidance.C8O.guidance.isGuardedTool('nocode-form-publish'), true);
});

test('the tool asks for the checked revision and the confirmation, and offers only the two accesses', () => {
  const schemaSource = read('js/schema_overrides.js');
  const start = schemaSource.indexOf('  function nocodeFormPublishInputSchema()');
  const end = schemaSource.indexOf('\n  }\n', start) + 4;
  const context = { nocodeFormsProjectProperty: () => ({ type: 'string' }), nocodeFormsTokenProperty: () => ({ type: 'string' }) };
  vm.runInNewContext(schemaSource.slice(start, end), context);
  const schema = clone(context.nocodeFormPublishInputSchema());
  assert.deepEqual(schema.required, ['id', 'rev', 'confirm']);
  assert.equal(schema.properties.confirm.type, 'boolean');
  assert.deepEqual(schema.properties.access.enum, ['authenticated', 'anonymous']);
  assert.equal(schema.additionalProperties, false);
  assert.match(schemaSource, /seq === "tools_nocode_form_publish"\) \{\n\s+return nocodeFormPublishInputSchema\(\);/);
  const sequence = read('_c8oProject/sequences/tools_nocode_form_publish.yaml');
  assert.match(sequence, /^accessibility: Private$/m);
  assert.match(sequence, /include\("js\/nocode_forms\.js"\);\n\s+include\("js\/nocode_publish\.js"\);/);
  assert.match(read('c8oProject.yaml'), /tools_nocode_form_publish \[sequences\.GenericSequence\]: 🗏 sequences\/tools_nocode_form_publish\.yaml/);
  const skill = read('resources/convertigo-nocode/SKILL.md');
  assert.match(skill, /^- `nocode-form-publish`$/m);
  assert.match(skill, /^## Publishing$/m);
  assert.match(skill, /Never publish on your own initiative/);
});
