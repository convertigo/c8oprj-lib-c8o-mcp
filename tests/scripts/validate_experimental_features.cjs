const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// The experimental features of the engine (JSON native steps, JSON native properties of a sequence) are listed by
// palette-list, palette-describe and databaseobject-schema only while the engine switch shows them
// (com.twinsoft.convertigo.engine.util.ExperimentalFeatures.isShown, off by default). The marker is the engine's:
// DboBean.isExperimental() and the descriptor value "experimental". An existing native sequence keeps its
// properties; an engine without the switch or the marker hides nothing.

const root = path.resolve(__dirname, '../..');
const dboSource = fs.readFileSync(path.join(root, 'js/databaseobject.js'), 'utf8');
const paletteSource = fs.readFileSync(path.join(root, 'js/palette.js'), 'utf8');
const describeSource = fs.readFileSync(path.join(root, 'js/tools_palette_describe.js'), 'utf8');

function slice(source, from, to) {
  const start = source.indexOf(from);
  const end = source.indexOf(to, start);
  assert.ok(start >= 0 && end > start, 'Unable to isolate ' + from);
  return source.slice(start, end);
}

const helpers = slice(dboSource, 'C8O.dbo.isExperimentalShown = function', 'C8O.dbo.describeBeanProperties = function');
const collect = slice(paletteSource, 'C8O.palette._buildEntry = function', 'C8O.palette._collectNgxEntries = function');
const locate = slice(describeSource, 'function locateExplorerEntry', 'function locateNgxEntry');

// a Java iterable (getGroups, getCategories, getBeans)
function list(items) {
  return {
    iterator() {
      let i = 0;
      return { hasNext: () => i < items.length, next: () => items[i++] };
    }
  };
}

function javaString(text) {
  const value = new String(text);
  value.isEmpty = () => text.length === 0;
  return value;
}

// switchState: true / false, or undefined for an engine without the switch
function packages(switchState) {
  const util = {};
  if (switchState !== undefined) {
    util.ExperimentalFeatures = { isShown: () => switchState };
  }
  const beanInfos = {};
  return {
    beanInfos,
    com: {
      twinsoft: {
        convertigo: {
          engine: {
            util,
            Engine: null,
            DatabaseObjectsManager: { checkParent: () => true }
          },
          beans: {
            core: {
              DatabaseObject: { getFolderType: () => null },
              MySimpleBeanInfo: { getIconName: () => 'icon.png' },
              Sequence: function Sequence() {}
            },
            ngx: { components: { ApplicationComponent: function NgxApp() {} } },
            mobile: { components: { ApplicationComponent: function MobileApp() {} } }
          }
        }
      }
    },
    java: {
      beans: { BeanInfo: { ICON_COLOR_32x32: 2 } },
      lang: {
        Class: {
          forName: (name) => ({
            getConstructor: () => ({
              newInstance: () => ({
                getBeanDescriptor: () => ({
                  getDisplayName: () => name.replace(/^.*\./, '').replace(/BeanInfo$/, ''),
                  getShortDescription: () => 'short|long'
                })
              })
            })
          })
        }
      }
    }
  };
}

const NATIVE = 'com.twinsoft.convertigo.beans.steps.JsonGroupStep';
const CLASSIC = 'com.twinsoft.convertigo.beans.steps.JsonObjectStep';

function bean(className, experimental) {
  const b = { getClassName: () => className, isDocumented: () => true };
  if (experimental !== undefined) {
    b.isExperimental = () => experimental;
  }
  return b;
}

function explorer(beans) {
  return {
    getGroups: () => list([{
      getName: () => javaString('Sequencer'),
      getCategories: () => list([{
        getName: () => javaString('Steps'),
        getBeans: () => list([{ getName: () => javaString('JSON steps'), getBeans: () => list(beans) }])
      }])
    }])
  };
}

function sandbox(switchState, beans) {
  const Packages = packages(switchState);
  const Engine = { theApp: { getDboExplorerManager: () => explorer(beans) } };
  Packages.com.twinsoft.convertigo.engine.Engine = Engine;
  const context = {
    Packages,
    Engine,
    toJsString: (value) => (value == null ? '' : String(value)),
    C8O: {
      dbo: {
        normalizeValue: (descriptor, value) => value,
        _propertyKindFromType: () => 'boolean',
        _exampleValueForKind: (kind, value) => value,
        _getBooleanDescriptorFlag: () => false
      },
      palette: { splitDescription: (text) => ({ short: String(text).split('|')[0], long: '' }) },
      util: { fromFqcn: (fqcn) => String(fqcn).replace(/^com\.twinsoft\.convertigo\.beans\./, '') }
    }
  };
  vm.runInNewContext(helpers + '\n' + collect + '\n' + locate + '\nthis.locateExplorerEntry = locateExplorerEntry;', context);
  return context;
}

function paletteList(context) {
  const names = [];
  context.C8O.palette._collectExplorerEntries({
    parentDbo: null,
    pushEntry: (entry, extra) => {
      names.push(String(extra.classFqcn));
      return true;
    }
  });
  return names;
}

test('palette-list leaves out an experimental step while the switch is off', () => {
  const beans = [bean(NATIVE, true), bean(CLASSIC, false)];
  assert.deepEqual(paletteList(sandbox(false, beans)), [CLASSIC]);
  assert.deepEqual(paletteList(sandbox(true, beans)), [NATIVE, CLASSIC]);
});

test('palette-list hides nothing on an engine without the marker or the switch', () => {
  assert.deepEqual(paletteList(sandbox(false, [bean(NATIVE), bean(CLASSIC)])), [NATIVE, CLASSIC]);
  assert.deepEqual(paletteList(sandbox(undefined, [bean(NATIVE, true), bean(CLASSIC, false)])), [NATIVE, CLASSIC]);
});

test('palette-describe does not find an experimental step while the switch is off', () => {
  const beans = [bean(NATIVE, true), bean(CLASSIC, false)];
  assert.equal(sandbox(false, beans).locateExplorerEntry(NATIVE), null);
  assert.ok(sandbox(false, beans).locateExplorerEntry(CLASSIC));
  assert.ok(sandbox(true, beans).locateExplorerEntry(NATIVE));
  assert.ok(sandbox(undefined, beans).locateExplorerEntry(NATIVE));
});

function descriptor(name, experimental) {
  return {
    getName: () => name,
    getValue: (key) => (key === 'experimental' && experimental ? { toString: () => 'true' } : null),
    getReadMethod: () => ({ invoke: (instance) => instance[name] }),
    getWriteMethod: () => ({}),
    getPropertyType: () => ({ getName: () => 'boolean' }),
    getShortDescription: () => name + ' description',
    getDisplayName: () => name
  };
}

function described(context, instance) {
  return [descriptor('nativeExecution', true), descriptor('jsonNativeOutput', true), descriptor('autoStart', false)]
    .map((d) => context.C8O.dbo.describePropertyDescriptor(d, instance))
    .filter(Boolean)
    .map((hint) => hint.name);
}

test('databaseobject-schema leaves out the experimental properties that are off while the switch is off', () => {
  const classic = { nativeExecution: false, jsonNativeOutput: false, autoStart: false };
  assert.deepEqual(described(sandbox(false, []), classic), ['autoStart']);
  assert.deepEqual(described(sandbox(false, []), null), ['autoStart']);
  assert.deepEqual(described(sandbox(true, []), classic), ['nativeExecution', 'jsonNativeOutput', 'autoStart']);
  assert.deepEqual(described(sandbox(undefined, []), classic), ['nativeExecution', 'jsonNativeOutput', 'autoStart']);
});

test('an existing native sequence keeps the properties that make it native', () => {
  const nativeSequence = { nativeExecution: true, jsonNativeOutput: false, autoStart: false };
  assert.deepEqual(described(sandbox(false, []), nativeSequence), ['nativeExecution', 'autoStart']);
  nativeSequence.jsonNativeOutput = true;
  assert.deepEqual(described(sandbox(false, []), nativeSequence), ['nativeExecution', 'jsonNativeOutput', 'autoStart']);
});
