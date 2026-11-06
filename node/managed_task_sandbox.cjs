"use strict";
// Server-owned launch policy. Callers cannot opt out through tool inputs.
var fs = require('fs');
var path = require('path');
var cp = require('child_process');
var SYSTEM_READ = ['/bin', '/sbin', '/lib', '/lib32', '/lib64', '/usr/bin', '/usr/sbin', '/usr/lib', '/usr/lib64', '/usr/share', '/etc', '/dev', '/sys', '/proc/self', '/proc/thread-self', '/proc/cpuinfo', '/proc/meminfo', '/proc/stat', '/proc/uptime', '/proc/version'];
var PINNED_VERSION = '3.1.0';
function allowedTools(config) {
  if (!['Convertigo', 'convertigo-flow'].includes(config.server || 'Convertigo')) throw new Error('Unsupported managed task server');
  var names = [(config.server || 'Convertigo') + '_*', 'todo', 'skill'];
  if (config.pack !== 'flow') names = names.concat(['read_file', 'write_file', 'edit']);
  return names;
}
function policyLines(config) {
  return ['enable_auto_approve = true', 'bypass_tool_permissions = false', 'enabled_tools = ' + JSON.stringify(allowedTools(config)), 'enable_background_processes = false', 'enable_subagents = false', 'outside_workdir = "deny"'];
}
function prepare(config, home, deps) {
  deps = deps || {};
  if ((deps.platform || process.platform) !== 'linux') throw new Error('Managed tasks require Landlock confinement');
  var helper = config.sandboxHelper || '/usr/local/bin/c8o-agent-sandbox';
  if (!path.isAbsolute(helper) || !path.isAbsolute(config.vibeBin)) throw new Error('Managed task executables must be absolute paths');
  var exec = deps.spawnSync || cp.spawnSync;
  var probe = exec(helper, ['--probe'], {encoding: 'utf8', timeout: 5000, env: {}, maxBuffer: 4096});
  if (probe.error || probe.status !== 0 || !/^[1-9]\d*\s*$/.test(probe.stdout || '')) throw new Error('Managed tasks require a usable Landlock helper');
  var runtime = path.dirname(path.dirname(config.vibeBin));
  var ro = SYSTEM_READ.concat([runtime]);
  // A venv may use a Python installation outside its own directory.
  try {
    var python = fs.realpathSync(path.join(runtime, 'bin', 'python3'));
    ro.push(python);
    var pythonPrefix = path.dirname(path.dirname(python));
    // Never grant a whole system prefix such as /usr/local: it can also hold the engine.
    ['lib', 'lib64'].forEach(function (folder) {
      var lib = path.join(pythonPrefix, folder);
      try { fs.readdirSync(lib).filter(function (name) { return /^python\d+\.\d+$|^libpython[\d.]+\.so(?:\.[\d.]+)?$/.test(name); }).forEach(function (name) { ro.push(path.join(lib, name)); }); } catch (_noLib) {}
    });
  } catch (_noPython) {}
  if (config.sandboxPythonPath) ro.push(config.sandboxPythonPath);
  var prefix = [];
  ro.forEach(p => prefix.push('--ro', p));
  [config.outDir, config.workdir, '/dev/null'].forEach(p => prefix.push('--rw', p));
  prefix.push('--', config.vibeBin);
  var env = Object.assign({}, deps.env || process.env, {VIBE_HOME: home, HOME: home, XDG_CACHE_HOME: path.join(home, '.cache'), TMPDIR: path.join(home, '.tmp')});
  // Environment and CLI overrides keep project-level settings from widening the task policy.
  env.VIBE_ENABLED_TOOLS = JSON.stringify(allowedTools(config));
  env.VIBE_ENABLE_BACKGROUND_PROCESSES = 'false';
  env.VIBE_ENABLE_SUBAGENTS = 'false';
  env.VIBE_OUTSIDE_WORKDIR = 'deny';
  env.VIBE_ENABLE_AUTO_APPROVE = 'true';
  env.VIBE_BYPASS_TOOL_PERMISSIONS = 'false';
  fs.mkdirSync(env.TMPDIR, {recursive: true});
  // Do not inherit a global Python hook; ABI 1 compatibility comes from the shipped helper only.
  delete env.PYTHONPATH;
  if (config.sandboxPythonPath) env.PYTHONPATH = config.sandboxPythonPath;
  var version = exec(helper, prefix.concat(['--version']), {encoding: 'utf8', timeout: 10000, env: env, cwd: config.workdir, maxBuffer: 4096});
  if (version.error || version.status !== 0 || !new RegExp('(?:^|\\s)' + PINNED_VERSION.replace(/\./g, '\\.') + '(?:\\s|$)').test(version.stdout || '')) throw new Error('Managed task runtime version must be ' + PINNED_VERSION);
  return {bin: helper, prefix: prefix, env: env};
}
module.exports = {prepare, allowedTools, policyLines, PINNED_VERSION};
