// project-js-get and project-js-set name one file of a project's js/ folder (js/project_js_files.js). A folder ("js/",
// ".", a sub-folder) reached the read and failed with the engine's generic "An exception occured while executing step":
// it is refused before, with the files that can be read; a path outside js/ and a missing file say what to give instead.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function load() {
  const sandbox = { C8O: {} };
  vm.runInNewContext(read('js/project_js_files.js'), sandbox);
  return sandbox.C8O.projectJsFiles;
}

// java.io.File as the resolver uses it, over the real file system.
class JFile {
  constructor(parent, child) {
    this.p = child === undefined ? String(parent) : path.join(parent instanceof JFile ? parent.p : String(parent), String(child));
  }
  static get separator() { return path.sep; }
  getPath() { return this.p; }
  getName() { return path.basename(this.p); }
  isAbsolute() { return path.isAbsolute(this.p); }
  getCanonicalFile() {
    const resolved = path.resolve(this.p);
    let real = resolved;
    try { real = fs.realpathSync(resolved); } catch (_missing) {
      try { real = path.join(fs.realpathSync(path.dirname(resolved)), path.basename(resolved)); } catch (_missingParent) {}
    }
    return new JFile(real);
  }
  isDirectory() { try { return fs.statSync(this.p).isDirectory(); } catch (_missing) { return false; } }
  isFile() { try { return fs.statSync(this.p).isFile(); } catch (_missing) { return false; } }
  exists() { return fs.existsSync(this.p); }
  listFiles() { return this.isDirectory() ? fs.readdirSync(this.p).map(name => new JFile(this, name)) : null; }
}

function project() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-js-'));
  fs.mkdirSync(path.join(dir, 'js', 'lib'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'js', 'app.js'), '// app');
  fs.writeFileSync(path.join(dir, 'js', 'lib', 'helpers.js'), '// helpers');
  fs.writeFileSync(path.join(dir, 'c8oProject.yaml'), 'name: Probe');
  return { dir, jsDir: new JFile(dir, 'js') };
}

test('a file of js/ resolves whatever the spelling: js/app.js, app.js, /app.js, a backslash or its absolute path', () => {
  const api = load();
  const { dir, jsDir } = project();
  for (const name of ['app.js', 'js/app.js', '/app.js', 'js//app.js', path.join(dir, 'js', 'app.js')]) {
    const resolved = api.resolve(jsDir, name, 'Probe', JFile);
    assert.equal(resolved.name, 'app.js', name);
    assert.ok(resolved.file.isFile(), name);
  }
  assert.equal(api.resolve(jsDir, 'lib\\helpers.js', 'Probe', JFile).name, 'lib/helpers.js');
  // A new file (project-js-set) resolves too; it does not exist yet.
  assert.equal(api.resolve(jsDir, 'js/new/tool.js', 'Probe', JFile).name, 'new/tool.js');
});

test('a folder is refused before any read, with the files it holds (bounded)', () => {
  const api = load();
  const { dir, jsDir } = project();
  for (const name of ['js/', 'js', '.', '/', 'lib/..', path.join(dir, 'js')]) {
    assert.throws(() => api.resolve(jsDir, name, 'Probe', JFile),
      e => /^filename names a folder, not a file: js\/ of Probe\. Give one file of it, its path relative to js\/\. Files in js\/: app\.js, lib\/helpers\.js\.$/.test(e.message), name);
  }
  assert.throws(() => api.resolve(jsDir, 'lib', 'Probe', JFile), /folder, not a file: js\/lib\/ of Probe\..*Files in js\/lib\/: helpers\.js\./);
  for (let i = 0; i < 40; i++) fs.writeFileSync(path.join(dir, 'js', 'f' + String(i).padStart(2, '0') + '.js'), '');
  assert.throws(() => api.resolve(jsDir, 'js/', 'Probe', JFile), e => /\(and 17 more\)\.$/.test(e.message) && e.message.length < 900);
  const empty = new JFile(fs.mkdtempSync(path.join(os.tmpdir(), 'project-js-empty-')), 'js');
  assert.throws(() => api.resolve(empty, 'js/', 'Probe', JFile), /That folder does not exist yet: project-js-set creates it/);
});

test('a path outside js/ is refused with what to give instead', () => {
  const api = load();
  const { dir, jsDir } = project();
  for (const name of ['../c8oProject.yaml', 'js/../../x.js', path.join(dir, 'c8oProject.yaml'), '/etc/passwd/../../..']) {
    assert.throws(() => api.resolve(jsDir, name, 'Probe', JFile), e => /^filename must name a file inside the js\/ folder of Probe: .* points outside it\. Give a path relative to js\/, for example app\.js/.test(e.message), name);
  }
  // An absolute path that exists nowhere keeps the old reading: relative to js/ (a missing file, or a new one).
  assert.equal(api.resolve(jsDir, '/no/such/dir/x.js', 'Probe', JFile).name, 'no/such/dir/x.js');
  assert.throws(() => api.resolve(jsDir, '  ', 'Probe', JFile), /filename is required/);
  // A sibling folder whose name starts like js/ is outside it too.
  fs.mkdirSync(path.join(dir, 'jsx'));
  assert.throws(() => api.resolve(jsDir, '../jsx/a.js', 'Probe', JFile), /points outside it/);
});

test('project-js-get and project-js-set resolve through the shared helper; a missing file lists what can be read', () => {
  for (const file of ['tools_project_js_get', 'tools_project_js_set']) {
    const yaml = read('_c8oProject/sequences/' + file + '.yaml');
    assert.match(yaml, /include\("js\/project_js_files\.js"\);\n\s+var resolved = C8O\.projectJsFiles\.resolve\(jsDir, filenameText, projectName, java\.io\.File\);/, file);
    assert.doesNotMatch(yaml, /Invalid filename/, file);
  }
  const get = read('_c8oProject/sequences/tools_project_js_get.yaml');
  assert.match(get, /fileExists = targetFile\.isFile\(\);/);
  assert.match(get, /"File not found: js\/" \+ resolved\.name \+ " of " \+ projectName \+ "\. " \+ C8O\.projectJsFiles\.listText\(resolved\.base, "js\/"\)/);
  const api = load();
  const { jsDir } = project();
  assert.equal(api.listText(jsDir.getCanonicalFile(), 'js/'), 'Files in js/: app.js, lib/helpers.js.');
});
