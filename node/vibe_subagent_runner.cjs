#!/usr/bin/env node
/*
 * Runner "vibe-session" of the Tigo sub-agents (js/subagents.js): a Mistral Vibe programmatic session (vibe -p) with a
 * fresh context, in a Vibe home of its own built in the run folder from the user's Tigo home: the profile's model, the
 * Convertigo MCP server only (the caller's bearer, a header naming the run), the Convertigo skill and the profile's
 * rules. Vibe enforces the limits (--max-turns, --max-price, --time-limit). The constructor profile builds a lot in one
 * project through the Convertigo MCP.
 *
 * Input: one JSON object on stdin (see normalizeConfig). Secrets come only from the environment (the gateway key and
 * the MCP bearer, under the names the template config uses) and are never written to the run folder.
 * Output: one JSON line on stdout {ok, report, usage, ...}; activity.jsonl gets one line per tool call or message.
 */
"use strict";

var fs = require("fs");
var path = require("path");
var childProcess = require("child_process");

function str(value) {
  return value == null ? "" : String(value).trim();
}

function normalizeConfig(raw) {
  raw = raw || {};
  ["vibeBin", "templateHome", "outDir", "workdir", "model", "task", "project"].forEach(function (key) {
    if (!str(raw[key]).length) {
      throw new Error(key + " is required.");
    }
  });
  return {
    vibeBin: str(raw.vibeBin),
    templateHome: str(raw.templateHome),
    outDir: path.resolve(str(raw.outDir)),
    workdir: path.resolve(str(raw.workdir)),
    projectDir: str(raw.projectDir),
    project: str(raw.project),
    model: str(raw.model),
    profile: str(raw.profile) || "constructor",
    task: str(raw.task),
    inputs: raw.inputs && typeof raw.inputs === "object" ? raw.inputs : {},
    reportFormat: str(raw.reportFormat),
    maxSteps: Math.max(1, Number(raw.maxSteps) || 120),
    timeBudgetMs: Math.max(30000, Number(raw.timeBudgetMs) || 900000),
    maxCostUsd: Math.max(0.01, Number(raw.maxCostUsd) || 1.5),
    callId: str(raw.callId) || "build-" + Date.now().toString(36),
    usageTool: str(raw.usageTool) || "subagent-run",
    lockFile: str(raw.lockFile),
    disabledTools: Array.isArray(raw.disabledTools) ? raw.disabledTools.map(str).filter(Boolean) : []
  };
}

// The rules of the constructor profile, added to the Vibe home's AGENTS.md.
var CONSTRUCTOR_RULES = [
  "# Constructor sub-agent",
  "",
  "You are a constructor sub-agent of Tigo, the Convertigo assistant. The main agent keeps the specification, the plan and the decisions; it handed you one lot to build, with a fresh context. Build exactly that lot, prove it, and report.",
  "",
  "- Work only in the project named in the task, through the Convertigo MCP tools. Never touch another project, never delete or rename an object you did not create in this run unless the task says so.",
  "- Prefer the generators and the shortcuts the Convertigo skill names (sql-transaction-create, business-sequence-create, ngx-page-create, batch-call with callsFile); read the guides it routes you to when you need them, not more.",
  "- Prove each piece before you report: requestable-execute for transactions and sequences (with the values asked), mobile-builder-open with stateOnly and wait for pages (no compile error), project-lint when it is available. Save with project-save at the end.",
  "- Do not verify in the browser and do not start other sub-agents: the main agent does that.",
  "- When something blocks you, stop and say what and why instead of working around the task.",
  "- The main agent already set this session up: do not stop on a guidance version difference between the skill and the MCP; mention it in openIssues and go on.",
  "- Your last message is the report: a few sentences, then one fenced json block {\"verdict\": \"done\" | \"partial\" | \"failed\", \"summary\": \"...\", \"created\": [\"<QName>\", ...], \"modified\": [\"<QName>\", ...], \"checks\": [{\"check\": \"...\", \"status\": \"passed\" | \"failed\", \"evidence\": \"...\"}], \"openIssues\": [\"...\"]}. QNames are exact, copied from the tool results."
].join("\n");

function buildTask(config) {
  var lines = [];
  lines.push("Project: " + config.project);
  lines.push("");
  lines.push("Task:");
  lines.push(config.task);
  var inputs = config.inputs || {};
  var keys = Object.keys(inputs).filter(function (k) { return k !== "project"; });
  if (keys.length) {
    lines.push("");
    lines.push("Inputs:");
    keys.forEach(function (k) {
      var value = inputs[k];
      lines.push("- " + k + ": " + (typeof value === "string" ? value : JSON.stringify(value)));
    });
  }
  if (config.reportFormat.length) {
    lines.push("");
    lines.push("Report wanted: " + config.reportFormat);
  }
  lines.push("");
  lines.push("Limits: at most " + config.maxSteps + " model turns, " + Math.round(config.timeBudgetMs / 1000) + " s and " +
    config.maxCostUsd + " USD. End with the report described in your instructions.");
  return lines.join("\n");
}

// The child Vibe home: the template's config with the profile model as active model, the Convertigo MCP server only
// (Playwright and other servers removed) with a header naming the run, the skill, the prompts and AGENTS.md with the
// profile rules. Hooks and history are not copied.
function buildHome(config, home) {
  fs.mkdirSync(home, { recursive: true });
  var source = fs.readFileSync(path.join(config.templateHome, "config.toml"), "utf8");
  fs.writeFileSync(path.join(home, "config.toml"), childConfig(source, config));
  var agents = "";
  try {
    agents = fs.readFileSync(path.join(config.templateHome, "AGENTS.md"), "utf8");
  } catch (_noAgents) {}
  fs.writeFileSync(path.join(home, "AGENTS.md"), agents + (agents.length ? "\n\n" : "") + CONSTRUCTOR_RULES + "\n");
  ["skills", "prompts"].forEach(function (dir) {
    var from = path.join(config.templateHome, dir);
    if (fs.existsSync(from)) {
      fs.cpSync(from, path.join(home, dir), { recursive: true });
    }
  });
  fs.writeFileSync(path.join(home, "trusted_folders.toml"), "trusted = [" + JSON.stringify(config.workdir) + "]\n");
}

// Edits the template config.toml text: active_model, MCP servers other than Convertigo dropped, a run header added.
function childConfig(text, config) {
  var lines = String(text).split(/\r?\n/);
  var out = [];
  var blocks = [];
  var current = { header: null, lines: [] };
  lines.forEach(function (line) {
    if (/^\s*\[\[?[^\]]+\]\]?\s*$/.test(line)) {
      blocks.push(current);
      current = { header: line.trim(), lines: [line] };
    } else {
      current.lines.push(line);
    }
  });
  blocks.push(current);
  // A [[mcp_servers]] block owns the [mcp_servers.*] tables that follow it.
  var keepServer = true;
  for (var i = 0; i < blocks.length; i++) {
    var block = blocks[i];
    var header = block.header || "";
    if (header === "[[mcp_servers]]") {
      keepServer = block.lines.some(function (l) { return /^\s*name\s*=\s*["']Convertigo["']/i.test(l); });
    } else if (!/^\[mcp_servers\./.test(header)) {
      keepServer = true;
    }
    if (!keepServer) {
      continue;
    }
    if (header === "[mcp_servers.auth.headers]") {
      block.lines.splice(1, 0, '"X-Convertigo-Subagent-Run" = ' + JSON.stringify(config.callId));
    }
    out = out.concat(block.lines);
  }
  var result = out.join("\n");
  if (/^\s*active_model\s*=.*$/m.test(result)) {
    result = result.replace(/^\s*active_model\s*=.*$/m, "active_model = " + JSON.stringify(config.model));
  } else {
    result = "active_model = " + JSON.stringify(config.model) + "\n" + result;
  }
  // An inline http_headers / headers table instead of [mcp_servers.auth.headers]: add the run header there.
  if (result.indexOf("X-Convertigo-Subagent-Run") < 0) {
    result = result.replace(/^(\s*headers\s*=\s*\{)/m, '$1 "X-Convertigo-Subagent-Run" = ' + JSON.stringify(config.callId) + ",");
  }
  return result;
}

function activityOf(entry) {
  if (!entry || typeof entry !== "object") {
    return "";
  }
  if (entry.type === "effect") {
    var display = (entry.detail && entry.detail.display) || {};
    return str(display.summary || display.message || entry.title).substring(0, 160);
  }
  if (entry.type === "message" && entry.role === "assistant") {
    var text = (entry.content || []).map(function (c) { return c && c.text ? c.text : ""; }).join(" ").replace(/\s+/g, " ").trim();
    return text.length ? "« " + text.substring(0, 140) + (text.length > 140 ? "…" : "") + " »" : "";
  }
  return "";
}

function logActivity(config, entry) {
  try {
    fs.appendFileSync(path.join(config.outDir, "activity.jsonl"), JSON.stringify(entry) + "\n");
  } catch (_noActivity) {}
}

// The json block of the final message, else the message itself as the summary.
function parseReport(finalText) {
  var text = String(finalText || "");
  var blocks = [];
  var re = /```json\s*([\s\S]*?)```/g;
  var match;
  while ((match = re.exec(text)) !== null) {
    blocks.push(match[1]);
  }
  for (var i = blocks.length - 1; i >= 0; i--) {
    try {
      var parsed = JSON.parse(blocks[i]);
      if (parsed && typeof parsed === "object") {
        var list = function (v) { return Array.isArray(v) ? v.map(function (x) { return typeof x === "string" ? x : JSON.stringify(x); }).slice(0, 80) : []; };
        return {
          verdict: /^(done|partial|failed)$/.test(str(parsed.verdict)) ? str(parsed.verdict) : "partial",
          summary: str(parsed.summary) || str(text.replace(re, "")).substring(0, 1200),
          created: list(parsed.created),
          modified: list(parsed.modified),
          checks: Array.isArray(parsed.checks) ? parsed.checks.slice(0, 30).map(function (c) {
            c = c || {};
            return { check: str(c.check), status: /^(passed|failed)$/.test(str(c.status)) ? str(c.status) : "not_checked", evidence: str(c.evidence).substring(0, 400) };
          }) : [],
          openIssues: list(parsed.openIssues)
        };
      }
    } catch (_notJson) {}
  }
  return { verdict: "partial", summary: text.substring(0, 1500), created: [], modified: [], checks: [], openIssues: ["The sub-agent ended without the json report."] };
}

// Usage from the child's own session journal (the export leaves cached tokens at 0): one completion_succeeded record
// per model request, as the Agent Bridge reads it.
function journalUsage(home) {
  var totals = { requests: 0, inputTokens: 0, cachedTokens: 0, outputTokens: 0 };
  var root = path.join(home, "logs", "session", "unified");
  var sessions;
  try {
    sessions = fs.readdirSync(root);
  } catch (_noJournal) {
    return totals;
  }
  sessions.forEach(function (session) {
    var dir = path.join(root, session, "journal");
    var files;
    try {
      files = fs.readdirSync(dir).filter(function (f) { return /\.jsonl$/.test(f); });
    } catch (_noDir) {
      return;
    }
    files.forEach(function (file) {
      String(fs.readFileSync(path.join(dir, file), "utf8")).split("\n").forEach(function (line) {
        if (line.indexOf("completion_succeeded") < 0) {
          return;
        }
        var record;
        try {
          record = JSON.parse(line);
        } catch (_partial) {
          return;
        }
        var outer = record && record.type === "action_result" && record.payload ? (record.payload.result || {}) : null;
        var result = outer ? (outer.result || {}) : {};
        if (!outer || (outer.type || result.type) !== "completion_succeeded") {
          return;
        }
        var usage = result.usage || {};
        totals.requests++;
        totals.inputTokens += Number(usage.input_tokens) || 0;
        totals.cachedTokens += Number(usage.cached_input_tokens) || 0;
        totals.outputTokens += Number(usage.output_tokens) || 0;
      });
    });
  });
  return totals;
}

// Prices of a model per million tokens, from the [[models]] entry of the child config whose alias or name is it.
function modelPrices(configText, model) {
  var blocks = String(configText).split(/\n(?=\[\[models\]\])/);
  for (var i = 0; i < blocks.length; i++) {
    var block = blocks[i];
    if (block.indexOf("[[models]]") !== 0) {
      continue;
    }
    var alias = (/\nalias\s*=\s*"([^"]*)"/.exec(block) || [])[1];
    var name = (/\nname\s*=\s*"([^"]*)"/.exec(block) || [])[1];
    if (alias === model || name === model) {
      var num = function (key) {
        var m = new RegExp("\\n" + key + "\\s*=\\s*([0-9.]+)").exec(block);
        return m ? Number(m[1]) : null;
      };
      return { input: num("input_price"), cachedInput: num("cached_input_price"), output: num("output_price") };
    }
  }
  return null;
}

function tokenCost(totals, prices) {
  if (!prices || prices.input === null || prices.output === null) {
    return null;
  }
  var cachedPrice = prices.cachedInput === null ? prices.input : prices.cachedInput;
  var uncached = Math.max(0, totals.inputTokens - totals.cachedTokens);
  return (uncached * prices.input + totals.cachedTokens * cachedPrice + totals.outputTokens * prices.output) / 1000000;
}

// Project files written during the run, as a check of what the report says it created or modified.
function changedFiles(dir, since) {
  var out = [];
  if (!dir || !fs.existsSync(dir)) {
    return out;
  }
  var skip = /^(_private|DisplayObjects|node_modules|Traces|\.git|\.metadata|wsdl|xsd)$/;
  (function walk(current, rel) {
    var entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch (_unreadable) {
      return;
    }
    entries.forEach(function (entry) {
      if (out.length >= 200 || skip.test(entry.name)) {
        return;
      }
      var full = path.join(current, entry.name);
      var relative = rel ? rel + "/" + entry.name : entry.name;
      if (entry.isDirectory()) {
        walk(full, relative);
      } else {
        try {
          if (fs.statSync(full).mtimeMs >= since) {
            out.push(relative);
          }
        } catch (_gone) {}
      }
    });
  })(dir, "");
  return out.sort();
}

function run(rawConfig, deps) {
  var config = normalizeConfig(rawConfig);
  var started = Date.now();
  fs.mkdirSync(config.outDir, { recursive: true });
  var home = path.join(config.outDir, "vibe-home");
  buildHome(config, home);
  var promptFile = path.join(config.outDir, "task.md");
  fs.writeFileSync(promptFile, buildTask(config));
  var exportDir = path.join(config.outDir, "vibe");
  // Vibe prices every input token as uncached, several times the real cost of a cached session: its --max-price is
  // only a safety net, and the runner holds the budget on the journal's real figures.
  var prices = modelPrices(fs.readFileSync(path.join(home, "config.toml"), "utf8"), config.model);
  var args = ["-p", "--prompt-file", promptFile, "--max-turns", String(config.maxSteps), "--max-price", String(Math.round(config.maxCostUsd * 5 * 100) / 100),
    "--time-limit", String(Math.round(config.timeBudgetMs / 1000)), "--output", "streaming", "--output-dir", exportDir,
    "--auto-approve", "--workdir", config.workdir];
  config.disabledTools.forEach(function (tool) {
    args.push("--disabled-tools", tool);
  });
  var env = Object.assign({}, deps.env || process.env, { VIBE_HOME: home });
  return new Promise(function (resolve) {
    var child = (deps.spawn || childProcess.spawn)(config.vibeBin, args, { cwd: config.workdir, env: env, stdio: ["ignore", "pipe", "pipe"] });
    var buffer = "";
    var overBudget = false;
    var budgetWatch = setInterval(function () {
      var spent = tokenCost(journalUsage(home), prices);
      if (spent !== null && spent >= config.maxCostUsd && !overBudget) {
        overBudget = true;
        logActivity(config, { at: Date.now(), text: "! cost budget reached (" + spent.toFixed(3) + " USD): stopping" });
        try { child.kill("SIGTERM"); } catch (_gone) {}
      }
    }, 5000);
    var lastAssistant = "";
    var toolCalls = 0;
    var stderr = "";
    child.stdout.on("data", function (chunk) {
      buffer += chunk.toString("utf8");
      var lines = buffer.split("\n");
      buffer = lines.pop();
      lines.forEach(function (line) {
        var entry;
        try {
          entry = JSON.parse(line);
        } catch (_notJson) {
          return;
        }
        if (entry.type === "effect") {
          toolCalls++;
        }
        if (entry.type === "message" && entry.role === "assistant") {
          var text = (entry.content || []).map(function (c) { return c && c.text ? c.text : ""; }).join("\n").trim();
          if (text.length) {
            lastAssistant = text;
          }
        }
        var activity = activityOf(entry);
        if (activity.length) {
          logActivity(config, { at: Date.now(), text: activity });
        }
      });
    });
    child.stderr.on("data", function (chunk) {
      stderr = (stderr + chunk.toString("utf8")).slice(-4000);
    });
    child.on("close", function (code) {
      clearInterval(budgetWatch);
      var exported = {};
      try {
        exported = JSON.parse(fs.readFileSync(path.join(exportDir, "export.json"), "utf8"));
      } catch (_noExport) {}
      var usage = exported.usage || {};
      var report = parseReport(lastAssistant);
      report.changedFiles = changedFiles(config.projectDir, started);
      var journal = journalUsage(home);
      var journalCost = tokenCost(journal, prices);
      var cost = journal.requests > 0 && journalCost !== null ? journalCost : Number(exported.cost_usd);
      var result = {
        ok: !!exported.outcome || code === 0,
        error: exported.outcome || code === 0 ? "" : ("vibe exited with code " + code + ": " + stderr.split("\n").filter(Boolean).slice(-3).join(" ")).substring(0, 600),
        report: report,
        finalMessage: lastAssistant.substring(0, 6000),
        stopReason: overBudget ? "cost budget" : (str(exported.stop_reason) || (exported.outcome === "finished" ? "finished" : str(exported.outcome) || "exit " + code)),
        toolCalls: toolCalls,
        durationMs: Date.now() - started,
        usage: {
          tool: config.usageTool,
          callId: config.callId,
          runId: config.callId,
          profile: config.profile,
          model: config.model,
          requests: journal.requests || Number(exported.steps) || 0,
          inputTokens: journal.requests ? journal.inputTokens : Number(usage.input_tokens) || 0,
          cachedTokens: journal.requests ? journal.cachedTokens : Number(usage.cached_input_tokens) || 0,
          outputTokens: journal.requests ? journal.outputTokens : Number(usage.output_tokens) || 0,
          reasoningTokens: 0,
          totalTokens: journal.requests ? journal.inputTokens + journal.outputTokens : Number(usage.total_tokens) || 0,
          cost: isFinite(cost) ? Math.round(cost * 1e8) / 1e8 : null,
          costSource: "journal",
          currency: isFinite(cost) ? "USD" : "",
          durationMs: Date.now() - started
        }
      };
      try {
        fs.writeFileSync(path.join(config.outDir, "report.json"), JSON.stringify(result, null, 2));
      } catch (_noReportFile) {}
      resolve(result);
    });
  });
}

function readStdin() {
  return new Promise(function (resolve, reject) {
    var chunks = [];
    process.stdin.on("data", function (c) { chunks.push(c); });
    process.stdin.on("end", function () { resolve(Buffer.concat(chunks).toString("utf8")); });
    process.stdin.on("error", reject);
  });
}

function finish(output, lockFile) {
  process.stdout.write(JSON.stringify(output) + "\n", function () {
    if (lockFile) {
      try {
        fs.unlinkSync(lockFile);
      } catch (_noLock) {}
    }
    process.exit(0);
  });
}

async function main() {
  var input = {};
  var output;
  try {
    input = JSON.parse(await readStdin() || "{}");
    output = await run(input, { env: process.env });
  } catch (e) {
    output = { ok: false, error: String(e && e.message ? e.message : e).substring(0, 600) };
  }
  finish(output, str(input.lockFile));
}

module.exports = {
  normalizeConfig: normalizeConfig,
  buildTask: buildTask,
  childConfig: childConfig,
  parseReport: parseReport,
  activityOf: activityOf,
  changedFiles: changedFiles,
  journalUsage: journalUsage,
  modelPrices: modelPrices,
  tokenCost: tokenCost,
  run: run,
  CONSTRUCTOR_RULES: CONSTRUCTOR_RULES
};

if (require.main === module) {
  main();
}
