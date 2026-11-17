/*
 * Scheduler tools: list and maintain scheduled sequence runs (job + CRON schedule + scheduled job),
 * the same objects as the Administration Console Scheduler page, through the engine SchedulerManager.
 * Follows the console service (admin/services/scheduler/CreateScheduledElements): check problems,
 * save, refresh jobs, and reload the saved state when anything fails.
 * The engine builds each CRON trigger with Quartz's CronScheduleBuilder.cronSchedule(cron) (SchedulerManager), so an
 * expression is evaluated in the JVM's default time zone: the answers name that zone and the next runs it gives.
 * apply with dryRun checks a definition and answers its next runs without saving anything.
 */
if (typeof C8O === "undefined") { var C8O = {}; }
C8O.scheduler = C8O.scheduler || {};

(function () {
  var Engine = Packages.com.twinsoft.convertigo.engine.Engine;
  var Beans = Packages.com.twinsoft.convertigo.beans.scheduler;

  function str(value) {
    return value == null ? "" : String(value).trim();
  }

  function bool(value, fallback) {
    var text = str(value).toLowerCase();
    if (text === "true" || text === "1" || text === "yes") {
      return true;
    }
    if (text === "false" || text === "0" || text === "no") {
      return false;
    }
    return fallback;
  }

  function parseObject(value, label) {
    if (value == null || str(value) === "") {
      return {};
    }
    // Sequence variables arrive as Java strings (typeof "object"): only a plain JS object is used as is.
    if (Object.prototype.toString.call(value) === "[object Object]") {
      return value;
    }
    try {
      var parsed = JSON.parse(String(value));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch (_invalidJson) {}
    throw new Error(label + " must be a JSON object.");
  }

  function manager() {
    var schedulerManager = Engine.theApp.schedulerManager;
    if (!schedulerManager) {
      throw new Error("The engine scheduler is not available.");
    }
    return schedulerManager;
  }

  function className(bean) {
    var name = String(bean.getClass().getName());
    return name.substring(name.lastIndexOf(".") + 1);
  }

  function parametersOf(job) {
    var out = {};
    try {
      var it = job.getParameters().entrySet().iterator();
      while (it.hasNext()) {
        var entry = it.next();
        var values = entry.getValue();
        var list = [];
        for (var i = 0; values != null && i < values.length; i++) {
          list.push(String(values[i]));
        }
        out[String(entry.getKey())] = list.length === 1 ? list[0] : list;
      }
    } catch (_ignoreParameters) {}
    return out;
  }

  function describeJob(job) {
    var item = { name: String(job.getName()), type: className(job), enabled: job.isEnable() === true,
      description: str(job.getDescription()) };
    if (job instanceof Beans.AbstractConvertigoJob) {
      item.project = str(job.getProjectName());
      item.context = str(job.getContextName());
      item.writeOutput = job.isWriteOutput() === true;
      item.parameters = parametersOf(job);
    }
    if (job instanceof Beans.SequenceConvertigoJob) {
      item.sequence = str(job.getSequenceName());
    }
    if (job instanceof Beans.TransactionConvertigoJob) {
      item.connector = str(job.getConnectorName());
      item.transaction = str(job.getTransactionName());
    }
    return item;
  }

  function describeSchedule(schedule) {
    var item = { name: String(schedule.getName()), type: className(schedule), enabled: schedule.isEnable() === true,
      description: str(schedule.getDescription()) };
    if (schedule instanceof Beans.ScheduleCron) {
      item.cron = str(schedule.getCron());
    }
    return item;
  }

  function withNextRun(item) {
    if (item.cron && item.enabled) {
      var next = nextRunsOf(item.cron, 1);
      if (next.nextRuns.length) {
        item.nextRun = next.nextRuns[0];
      }
    }
    return item;
  }

  function jobProject(job) {
    return job instanceof Beans.AbstractConvertigoJob ? str(job.getProjectName()) : "";
  }

  var NEXT_RUNS = 5;

  // The zone the engine evaluates CRON expressions in, and its offset now.
  function timeZoneOf() {
    var zone = java.time.ZoneId.systemDefault();
    var offset = String(zone.getRules().getOffset(java.time.Instant.now()).getId());
    return { timeZone: String(zone.getId()), utcOffset: offset === "Z" ? "+00:00" : offset };
  }

  function formatInstant(date) {
    return String(java.time.ZonedDateTime.ofInstant(date.toInstant(), java.time.ZoneId.systemDefault())
      .truncatedTo(java.time.temporal.ChronoUnit.SECONDS).format(java.time.format.DateTimeFormatter.ISO_OFFSET_DATE_TIME));
  }

  // {nextRuns} as the engine's trigger would fire them, or {cronError} when Quartz refuses the expression.
  function nextRunsOf(cron, count) {
    var expression;
    try {
      expression = new Packages.org.quartz.CronExpression(String(cron));
    } catch (invalid) {
      var message = invalid && invalid.message ? String(invalid.message) : String(invalid);
      return { nextRuns: [], cronError: message.replace(/^[\w.]*Exception:\s*/, "") };
    }
    expression.setTimeZone(java.util.TimeZone.getDefault());
    var runs = [];
    var after = new java.util.Date();
    for (var i = 0; i < count; i++) {
      var next = expression.getNextValidTimeAfter(after);
      if (next == null) {
        break;
      }
      runs.push(formatInstant(next));
      after = next;
    }
    return { nextRuns: runs };
  }

  function withZone(answer) {
    var zone = timeZoneOf();
    answer.timeZone = zone.timeZone;
    answer.utcOffset = zone.utcOffset;
    return answer;
  }

  C8O.scheduler.list = function (args) {
    var projectFilter = str(args && args.project);
    var schedulerManager = manager();
    var xml = schedulerManager.getSchedulerXML();
    var jobs = [];
    var schedules = [];
    var scheduledJobs = [];
    var usedSchedules = {};
    var jobIt = xml.getJobs().iterator();
    while (jobIt.hasNext()) {
      var job = jobIt.next();
      if (!projectFilter.length || jobProject(job) === projectFilter) {
        jobs.push(describeJob(job));
      }
    }
    var sjIt = xml.getScheduledJobs().iterator();
    while (sjIt.hasNext()) {
      var sj = sjIt.next();
      var sjJob = sj.getJob();
      if (projectFilter.length && (!sjJob || jobProject(sjJob) !== projectFilter)) {
        continue;
      }
      var scheduleName = sj.getSchedule() ? String(sj.getSchedule().getName()) : "";
      usedSchedules[scheduleName] = true;
      scheduledJobs.push({ name: String(sj.getName()), enabled: sj.isEnable() === true,
        allEnabled: sj.isAllEnabled() === true, job: sjJob ? String(sjJob.getName()) : "", schedule: scheduleName });
    }
    var schIt = xml.getSchedules().iterator();
    while (schIt.hasNext()) {
      var schedule = schIt.next();
      if (!projectFilter.length || usedSchedules[String(schedule.getName())]) {
        schedules.push(withNextRun(describeSchedule(schedule)));
      }
    }
    return withZone({
      status: "ok",
      schedulerOn: schedulerManager.isSchedulerOn() === true,
      paused: schedulerManager.isPaused() === true,
      project: projectFilter,
      jobs: jobs,
      schedules: schedules,
      scheduledJobs: scheduledJobs
    });
  };

  function removeByName(xml, name) {
    var removed = [];
    var scheduled = xml.getScheduledJob(name + "@" + name);
    if (scheduled) {
      xml.delAbstractBase(scheduled);
      removed.push("scheduledJob");
    }
    var job = xml.getJob(name);
    if (job) {
      xml.delAbstractBase(job);
      removed.push("job");
    }
    var schedule = xml.getSchedule(name);
    if (schedule) {
      if (xml.getScheduledJobsForSchedule(schedule).isEmpty()) {
        xml.delAbstractBase(schedule);
        removed.push("schedule");
      }
    }
    return removed;
  }

  function addChecked(xml, bean, problems) {
    var found = xml.checkProblems(bean);
    for (var i = 0; i < found.size(); i++) {
      problems.push(String(found.get(i)));
    }
    if (found.isEmpty()) {
      xml.addAbstractBase(bean);
    }
  }

  // What removeByName(xml, name) would remove, without changing anything.
  function wouldRemove(xml, name) {
    var removed = [];
    var scheduled = xml.getScheduledJob(name + "@" + name);
    if (scheduled) {
      removed.push("scheduledJob");
    }
    if (xml.getJob(name)) {
      removed.push("job");
    }
    var schedule = xml.getSchedule(name);
    if (schedule) {
      var users = xml.getScheduledJobsForSchedule(schedule);
      if (users.isEmpty() || (scheduled && users.size() === 1 && users.contains(scheduled))) {
        removed.push("schedule");
      }
    }
    return removed;
  }

  function problemsOf(bean) {
    var list = new java.util.LinkedList();
    bean.checkProblems(list);
    var out = [];
    for (var i = 0; i < list.size(); i++) {
      out.push(String(list.get(i)));
    }
    return out;
  }

  // One scheduled sequence run is three console objects sharing one name: a SequenceConvertigoJob,
  // a ScheduleCron and the ScheduledJob <name>@<name> linking them.
  C8O.scheduler.apply = function (args) {
    args = args || {};
    var action = str(args.action).toLowerCase() || "upsert";
    var name = str(args.name);
    var dryRun = bool(args.dryRun, false);
    if (!name.length) {
      throw new Error("name is required.");
    }
    var schedulerManager = manager();
    var xml = schedulerManager.getSchedulerXML();
    if (action !== "upsert" && action !== "delete") {
      throw new Error("action must be upsert or delete.");
    }
    if (dryRun && action === "delete") {
      var wouldBeRemoved = wouldRemove(xml, name);
      return withZone({ status: "dry_run", dryRun: true, saved: false, action: "delete", name: name,
        wouldBe: wouldBeRemoved.length ? "deleted" : "not_found", removes: wouldBeRemoved,
        schedulerOn: schedulerManager.isSchedulerOn() === true });
    }
    var job = null;
    var schedule = null;
    var description = "";
    var enabled = true;
    var cron = "";
    if (action === "upsert") {
      var project = str(args.project);
      var sequence = str(args.sequence);
      cron = str(args.cron);
      if (!project.length || !sequence.length || !cron.length) {
        throw new Error("upsert requires project, sequence and cron (Quartz syntax with seconds, e.g. 0 0 8 * * ?).");
      }
      var projectObject = Engine.theApp.databaseObjectsManager.getOriginalProjectByName(project, false);
      if (!projectObject || !projectObject.getSequenceByName(sequence)) {
        throw new Error("Unknown sequence " + project + "." + sequence + ".");
      }
      enabled = bool(args.enabled, true);
      description = str(args.description) || ("Scheduled run of " + project + "." + sequence);
      var parameters = parseObject(args.parameters, "parameters");

      job = new Beans.SequenceConvertigoJob();
      job.setName(name);
      job.setDescription(description);
      job.setEnable(enabled);
      job.setProjectName(project);
      job.setSequenceName(sequence);
      job.setContextName(str(args.context) || name);
      job.setWriteOutput(bool(args.writeOutput, false));
      var javaParameters = new java.util.HashMap();
      var keys = Object.keys(parameters);
      for (var k = 0; k < keys.length; k++) {
        var raw = parameters[keys[k]];
        var values = Array.isArray(raw) ? raw : [raw];
        var javaValues = java.lang.reflect.Array.newInstance(java.lang.String, values.length);
        for (var v = 0; v < values.length; v++) {
          javaValues[v] = values[v] == null ? "" : String(values[v]);
        }
        javaParameters.put(keys[k], javaValues);
      }
      job.setParameters(javaParameters);

      schedule = new Beans.ScheduleCron();
      schedule.setName(name);
      schedule.setDescription(description);
      schedule.setEnable(enabled);
      schedule.setCron(cron);
    }
    if (dryRun) {
      // The checks of the save (bean problems, a schedule of that name another scheduled job keeps), nothing saved.
      var replaced = wouldRemove(xml, name);
      var dryProblems = problemsOf(job).concat(problemsOf(schedule));
      if (xml.getSchedule(name) && replaced.indexOf("schedule") < 0) {
        dryProblems.push("a schedule named " + name + " is used by another scheduled job: choose another name");
      }
      var runs = nextRunsOf(cron, NEXT_RUNS);
      if (runs.cronError) {
        dryProblems.push("cron: " + runs.cronError);
      }
      var preview = { status: dryProblems.length ? "error" : "dry_run", dryRun: true, saved: false, action: "upsert", name: name,
        wouldBe: replaced.length ? "updated" : "created", scheduledJob: name + "@" + name,
        job: describeJob(job), schedule: describeSchedule(schedule), nextRuns: enabled ? runs.nextRuns : [],
        schedulerOn: schedulerManager.isSchedulerOn() === true };
      if (dryProblems.length) {
        preview.problems = dryProblems;
      }
      if (!enabled) {
        preview.message = "enabled is false: the run is defined but never fires until it is enabled.";
      } else if (preview.schedulerOn !== true) {
        preview.message = "The engine scheduler is off: these runs happen only once it is on.";
      }
      return withZone(preview);
    }
    try {
      if (action === "delete") {
        var removed = removeByName(xml, name);
        schedulerManager.save();
        schedulerManager.refreshJobs();
        return { status: removed.length ? "deleted" : "not_found", name: name, removed: removed };
      }
      var removedBefore = removeByName(xml, name);
      var problems = [];
      addChecked(xml, job, problems);
      addChecked(xml, schedule, problems);
      if (!problems.length) {
        var scheduled = new Beans.ScheduledJob();
        scheduled.setDescription(description);
        scheduled.setEnable(enabled);
        scheduled.setJob(job);
        scheduled.setSchedule(schedule);
        addChecked(xml, scheduled, problems);
      }
      if (problems.length) {
        schedulerManager.load();
        return { status: "error", name: name, problems: problems };
      }
      schedulerManager.save();
      schedulerManager.refreshJobs();
      return withZone({
        status: removedBefore.length ? "updated" : "created",
        name: name,
        scheduledJob: name + "@" + name,
        job: describeJob(job),
        schedule: describeSchedule(schedule),
        nextRuns: enabled ? nextRunsOf(cron, 3).nextRuns : [],
        schedulerOn: schedulerManager.isSchedulerOn() === true
      });
    } catch (e) {
      try {
        schedulerManager.load();
      } catch (_ignoreReload) {}
      throw e;
    }
  };
})();
