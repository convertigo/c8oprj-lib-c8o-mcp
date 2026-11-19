// The No Code form contract of a C8Oforms checkout (C8OFORMS_PROJECT_ROOT) for the tests of js/nocode_forms.js: its
// private sequences NoCode_Contract and NoCode_Form run js/nocode_form_components.js and js/nocode_form_contract.js, with
// the prototypes of its AllTypes.json. One engine per sandbox keeps its id counter between calls, from the clock of
// the sandbox, so that the ids of a test do not depend on the time it runs.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ALL_TYPES = 'DisplayObjects/mobile/assets/components/AllTypes.json';
const FILES = ['js/nocode_form_components.js', 'js/nocode_form_contract.js'];

function hasContract(root) {
  return FILES.every(file => fs.existsSync(path.join(root, file))) && fs.existsSync(path.join(root, ALL_TYPES));
}

// formsEngine(root, now).sequence(name, params): the answer of NoCode_Form as the internal requester gives it.
function formsEngine(root, now) {
  const clock = now == null ? 1800000000000 : Number(now);
  let engine = null;
  function load() {
    if (engine) return engine;
    class FixedDate extends Date {
      constructor(...args) { if (args.length) super(...args); else super(clock); }
      static now() { return clock; }
    }
    const sandbox = { Date: FixedDate };
    vm.createContext(sandbox);
    FILES.forEach(file => vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox, { filename: file }));
    engine = sandbox.c8oNocodeFormContract;
    engine.useCatalog(JSON.parse(fs.readFileSync(path.join(root, ALL_TYPES), 'utf8')), path.join(root, ALL_TYPES));
    return engine;
  }
  return {
    // a project of the engine as js/nocode_forms.js asks for it
    project(dir) {
      return {
        getDirFile: () => dir || root,
        getSequenceByName(name) {
          if ((name === 'NoCode_Form' || name === 'NoCode_Contract') && hasContract(root)) return { name };
          throw new Error('no sequence ' + name);
        }
      };
    },
    handles: sequence => sequence === 'NoCode_Form' || sequence === 'NoCode_Contract',
    sequence(sequence, params) {
      const operation = sequence === 'NoCode_Contract' ? 'contract' : String(params.operation);
      const input = sequence === 'NoCode_Contract' ? {} : JSON.parse(String(params.input || '{}'));
      // JSON text as the engine passes it: a JSON round trip, nothing shared with the sandbox
      const answer = JSON.parse(JSON.stringify(load().run(operation, input)));
      return { document: { res: { json: JSON.stringify(answer) } } };
    }
  };
}

module.exports = { formsEngine, hasContract };
