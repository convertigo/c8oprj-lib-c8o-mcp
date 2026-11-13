const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// An agent reported every sequence of a CRM as "role-checked" while 4 of 27 checked a role, list, create, update and
// delete only requiring a session (PipelineCrm 12/11). project-security-audit now says who can call each sequence.

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function loadAudit() {
  const context = { include() {}, C8O: {} };
  vm.runInNewContext(read('js/security_audit_rules.js'), context);
  vm.runInNewContext(read('js/security_audit_collect.js'), context);
  return context.C8O.securityAudit;
}

test('the role check signal: a role compared or looked up, not the word alone', () => {
  const A = loadAudit();
  assert.equal(A.scanJsSignals("if (resp === null && [\"ADMIN\",\"SALES\"].indexOf(String(me.role)) < 0) { resp = forbidden; }").checksRole, true);
  assert.equal(A.scanJsSignals("if (me.role !== 'ADMIN') throw new Error('FORBIDDEN');").checksRole, true);
  assert.equal(A.scanJsSignals("if (!context.hasRole('MANAGER')) {}").checksRole, true);
  assert.equal(A.scanJsSignals("var label = 'Your role';").checksRole, false);
  assert.equal(A.scanJsSignals("rows = list.map(function (r) { return r; });").checksRole, false);
});

test('access: role checked, signed in only, anonymous and private sequences of the project', () => {
  const A = loadAudit();
  const seq = (name, extra) => Object.assign({ qname: 'Crm.' + name, kind: 'sequence', accessibility: 'Hidden', authenticatedContextRequired: true, calls: [] }, extra || {});
  const model = {
    project: { name: 'Crm' },
    requestables: [seq('crm_dashboard'), seq('crm_list_deals'), seq('crm_delete_deal'), seq('crm_admin_purge', { calls: ['Crm.check_admin'] }),
      seq('check_admin', { accessibility: 'Private' }), seq('auth_signin', { authenticatedContextRequired: false }),
      { qname: 'Crm.db.list_deals', kind: 'transaction', accessibility: 'Private', calls: [] },
      { qname: 'lib_UserManager.SignIn', kind: 'sequence', accessibility: 'Public', authenticatedContextRequired: false, calls: [] }],
    steps: [{ owner: 'Crm.crm_dashboard', kind: 'js', enabled: true, signals: { checksRole: true } },
      { owner: 'Crm.check_admin', kind: 'condition', enabled: true, signals: { checksRole: true } },
      { owner: 'Crm.crm_delete_deal', kind: 'js', enabled: false, signals: { checksRole: true } }]
  };
  const access = JSON.parse(JSON.stringify(A.accessSummary(model)));
  assert.deepEqual(access.roleChecked, ['crm_admin_purge', 'crm_dashboard']);
  assert.deepEqual(access.signedInOnly, ['crm_delete_deal', 'crm_list_deals'], 'a disabled check checks nothing');
  assert.deepEqual(access.anonymous, ['auth_signin']);
  assert.deepEqual(access.private, ['check_admin']);
  assert.match(access.note, /only roleChecked sequences check a role/);
  assert.match(read('js/security_audit_rules.js'), /access: api\.accessSummary\(model\),/);
  assert.match(read('js/security_audit_collect.js'), /\} else if \(\/\^If\/\.test\(className\) && has\(dbo, "getCondition"\) && ROLE_CHECK_JS\.test/);
});
