// Run: node --test tests/scripts/validate_scheduler_dry_run.cjs
// scheduler-apply with dryRun checks a scheduled run and answers its next runs and the time zone the engine evaluates
// the CRON expression in, saving nothing; "Confirmer avant de modifier" treats it as a read. scheduler-list names the
// zone too. The engine (SchedulerManager, scheduler beans, Quartz, java.time) is played by fakes.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));

class JavaList {
  constructor(items = []) { this.items = items; }
  size() { return this.items.length; }
  get(i) { return this.items[i]; }
  add(v) { this.items.push(v); }
  isEmpty() { return this.items.length === 0; }
  contains(v) { return this.items.includes(v); }
  iterator() { let i = 0; const items = this.items; return { hasNext: () => i < items.length, next: () => items[i++] }; }
}

function engine(options = {}) {
  const calls = [];
  class Base {
    constructor() { this.name = ''; this.description = ''; this.enable = true; }
    getName() { return this.name; } setName(v) { this.name = v; }
    getDescription() { return this.description; } setDescription(v) { this.description = v; }
    isEnable() { return this.enable; } setEnable(v) { this.enable = v; }
    getClass() { return { getName: () => 'com.twinsoft.convertigo.beans.scheduler.' + this.constructor.name }; }
    checkProblems(list) { if (!this.name.length) list.add('the name is empty'); }
  }
  class AbstractConvertigoJob extends Base {
    getProjectName() { return this.projectName; } setProjectName(v) { this.projectName = v; }
    getContextName() { return this.contextName; } setContextName(v) { this.contextName = v; }
    isWriteOutput() { return this.writeOutput; } setWriteOutput(v) { this.writeOutput = v; }
    getParameters() { return this.parameters || { entrySet: () => new JavaList() }; }
    setParameters(v) { this.parameters = { entrySet: () => new JavaList([...v.entries()].map(([k, val]) => ({ getKey: () => k, getValue: () => val }))) }; }
  }
  class SequenceConvertigoJob extends AbstractConvertigoJob {
    getSequenceName() { return this.sequenceName; } setSequenceName(v) { this.sequenceName = v; }
  }
  class TransactionConvertigoJob extends AbstractConvertigoJob {}
  class ScheduleCron extends Base {
    getCron() { return this.cron; } setCron(v) { this.cron = v; }
    checkProblems(list) { super.checkProblems(list); if (/bad/.test(this.cron)) list.add('the cron value must respect the CRON syntax'); }
  }
  class ScheduledJob extends Base {
    setJob(j) { this.job = j; this.name = j.getName() + '@' + (this.schedule ? this.schedule.getName() : ''); } getJob() { return this.job; }
    setSchedule(s) { this.schedule = s; this.name = (this.job ? this.job.getName() : '') + '@' + s.getName(); } getSchedule() { return this.schedule; }
    isAllEnabled() { return this.enable; }
  }
  const jobs = new JavaList(); const schedules = new JavaList(); const scheduledJobs = new JavaList();
  const xml = {
    getJobs: () => jobs, getSchedules: () => schedules, getScheduledJobs: () => scheduledJobs,
    getJob: n => jobs.items.find(j => j.getName() === n) || null,
    getSchedule: n => schedules.items.find(s => s.getName() === n) || null,
    getScheduledJob: n => scheduledJobs.items.find(s => s.getName() === n) || null,
    getScheduledJobsForSchedule: s => new JavaList(scheduledJobs.items.filter(sj => sj.getSchedule() === s)),
    checkProblems: bean => { const l = new JavaList(); bean.checkProblems(l); return l; },
    addAbstractBase: bean => { calls.push('add'); (bean instanceof ScheduleCron ? schedules : bean instanceof ScheduledJob ? scheduledJobs : jobs).items.push(bean); },
    delAbstractBase: bean => { calls.push('del'); for (const list of [jobs, schedules, scheduledJobs]) list.items = list.items.filter(b => b !== bean); }
  };
  const manager = {
    getSchedulerXML: () => xml, isSchedulerOn: () => options.schedulerOn !== false, isPaused: () => false,
    save: () => calls.push('save'), refreshJobs: () => calls.push('refresh'), load: () => calls.push('load')
  };
  // Quartz: an expression fires every day at the hour of its third field, in the default zone (UTC+1 here).
  class CronExpression {
    constructor(text) {
      if (/bad/.test(text)) throw new Error('java.text.ParseException: Illegal characters for this position: \'BAD\'');
      this.hour = Number(String(text).split(' ')[2]) || 0;
    }
    setTimeZone(zone) { this.zone = zone; }
    getNextValidTimeAfter(date) {
      const base = date.getTime();
      let next = Date.UTC(2026, 10, 18, this.hour - 1, 0, 0);
      while (next <= base) next += 86400000;
      return new FakeDate(next);
    }
  }
  class FakeDate {
    constructor(ms) { this.ms = ms === undefined ? Date.UTC(2026, 10, 17, 12, 0, 0) : ms; }
    getTime() { return this.ms; }
    toInstant() { return { ms: this.ms }; }
  }
  const zoneId = {
    getId: () => 'Europe/Paris',
    getRules: () => ({ getOffset: () => ({ getId: () => '+01:00' }) })
  };
  const java = {
    util: { Date: FakeDate, HashMap: Map, LinkedList: JavaList, TimeZone: { getDefault: () => 'Europe/Paris' } },
    lang: { String, reflect: { Array: { newInstance: (_t, n) => new Array(n) } } },
    time: {
      ZoneId: { systemDefault: () => zoneId },
      Instant: { now: () => ({}) },
      temporal: { ChronoUnit: { SECONDS: 'SECONDS' } },
      format: { DateTimeFormatter: { ISO_OFFSET_DATE_TIME: 'ISO' } },
      ZonedDateTime: {
        ofInstant: instant => ({
          truncatedTo: () => ({ format: () => new Date(instant.ms + 3600000).toISOString().replace(/\.\d{3}Z$/, '+01:00') })
        })
      }
    }
  };
  const projects = { App: { getSequenceByName: n => (n === 'Remind' ? {} : null) } };
  const Packages = {
    com: { twinsoft: { convertigo: {
      engine: { Engine: { theApp: { schedulerManager: manager, databaseObjectsManager: { getOriginalProjectByName: n => projects[n] || null } } } },
      beans: { scheduler: { AbstractConvertigoJob, SequenceConvertigoJob, TransactionConvertigoJob, ScheduleCron, ScheduledJob } }
    } } },
    org: { quartz: { CronExpression } }
  };
  const sandbox = { Packages, java };
  vm.createContext(sandbox);
  vm.runInContext(read('js/tools_scheduler.js'), sandbox, { filename: 'js/tools_scheduler.js' });
  return { scheduler: sandbox.C8O.scheduler, calls, xml };
}

const RUN = { name: 'daily-reminder', project: 'App', sequence: 'Remind', cron: '0 0 8 * * ?' };

test('a dry run answers the next runs and the zone, and saves nothing', () => {
  const e = engine();
  const answer = plain(e.scheduler.apply(Object.assign({ dryRun: 'true' }, RUN)));
  assert.equal(answer.status, 'dry_run');
  assert.equal(answer.saved, false);
  assert.equal(answer.wouldBe, 'created');
  assert.equal(answer.timeZone, 'Europe/Paris');
  assert.equal(answer.utcOffset, '+01:00');
  assert.deepEqual(answer.nextRuns, ['2026-11-18T08:00:00+01:00', '2026-11-19T08:00:00+01:00', '2026-11-20T08:00:00+01:00',
    '2026-11-21T08:00:00+01:00', '2026-11-22T08:00:00+01:00']);
  assert.equal(answer.schedule.cron, '0 0 8 * * ?');
  assert.equal(answer.job.sequence, 'Remind');
  assert.deepEqual(e.calls, [], 'no add, delete, save, refresh or reload');
  assert.ok(JSON.stringify(answer).length < 15000);
});

test('a dry run reports a CRON error and an unknown sequence like the save, without saving', () => {
  const e = engine();
  const bad = plain(e.scheduler.apply(Object.assign({}, RUN, { cron: '0 0 bad * * ?', dryRun: true })));
  assert.equal(bad.status, 'error');
  assert.ok(bad.problems.some(p => /CRON syntax/.test(p)));
  assert.ok(bad.problems.some(p => /^cron: Illegal characters/.test(p)), JSON.stringify(bad.problems));
  assert.deepEqual(bad.nextRuns, []);
  assert.throws(() => e.scheduler.apply(Object.assign({}, RUN, { sequence: 'Missing', dryRun: true })), /Unknown sequence App\.Missing/);
  assert.deepEqual(e.calls, []);
});

test('a dry run of an existing run says it would be updated or deleted, and a disabled run fires nowhere', () => {
  const e = engine();
  e.scheduler.apply(RUN);
  e.calls.length = 0;
  const update = plain(e.scheduler.apply(Object.assign({ dryRun: true }, RUN, { cron: '0 0 9 * * ?' })));
  assert.equal(update.wouldBe, 'updated');
  assert.equal(update.nextRuns[0], '2026-11-18T09:00:00+01:00');
  const disabled = plain(e.scheduler.apply(Object.assign({ dryRun: true, enabled: 'false' }, RUN)));
  assert.deepEqual(disabled.nextRuns, []);
  assert.match(disabled.message, /never fires until it is enabled/);
  const remove = plain(e.scheduler.apply({ action: 'delete', name: RUN.name, dryRun: true }));
  assert.equal(remove.wouldBe, 'deleted');
  assert.deepEqual(remove.removes, ['scheduledJob', 'job', 'schedule']);
  assert.deepEqual(e.calls, [], 'nothing removed or saved');
  assert.equal(e.xml.getJobs().size(), 1);
});

test('the save itself and the list name the zone and the next run', () => {
  const e = engine({ schedulerOn: false });
  const saved = plain(e.scheduler.apply(RUN));
  assert.equal(saved.status, 'created');
  assert.equal(saved.timeZone, 'Europe/Paris');
  assert.equal(saved.nextRuns.length, 3);
  assert.ok(e.calls.includes('save'));
  const off = plain(e.scheduler.apply(Object.assign({ dryRun: true }, RUN)));
  assert.match(off.message, /scheduler is off/);
  const list = plain(e.scheduler.list({ project: 'App' }));
  assert.equal(list.timeZone, 'Europe/Paris');
  assert.equal(list.utcOffset, '+01:00');
  assert.equal(list.schedules[0].nextRun, '2026-11-18T08:00:00+01:00');
});

test('a dry run is a read for the change confirmation, and the tool declares dryRun', () => {
  const sandbox = { include: file => vm.runInContext(read(file), sandbox) };
  vm.createContext(sandbox);
  vm.runInContext(read('js/nocode_write_confirm.js'), sandbox);
  vm.runInContext(read('js/studio_write_confirm.js'), sandbox);
  const confirm = sandbox.C8O.studioWriteConfirm;
  assert.deepEqual(plain(confirm.writesOf('tools_scheduler_apply', Object.assign({ dryRun: 'true' }, RUN))), []);
  assert.equal(confirm.writesOf('tools_scheduler_apply', RUN).length, 1);
  assert.deepEqual(plain(confirm.writesOf('tools_batch_call', { calls: [{ tool: 'scheduler-apply', arguments: Object.assign({ dryRun: true }, RUN) }] })), []);
  const overrides = { C8O: {} };
  overrides.include = file => vm.runInContext(read(file), overrides);
  vm.createContext(overrides);
  vm.runInContext(read('js/schema_overrides.js'), overrides);
  const input = overrides.C8O.schemaOverrides.applyInput('tools_scheduler_apply', { type: 'object', properties: {} }, null);
  assert.equal(input.properties.dryRun.type, 'boolean');
  assert.match(read('_c8oProject/sequences/tools_scheduler_apply.yaml'), /↓dryRun \[variables\.RequestableVariable-\d+\]: \n/);
  assert.match(read('_c8oProject/sequences/tools_scheduler_apply.yaml'), /dryRun: dryRun\}\);/);
});
