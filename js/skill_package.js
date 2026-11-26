if (typeof C8O === "undefined") {
  var C8O = {};
}
if (typeof C8O.util === "undefined" || typeof C8O.util.toBoolean !== "function") {
  include("js/util.js");
}
include("js/catalog_loader.js");
include("js/guidance_version.js");

// The Convertigo skills an agent installs, built from one source: the files of resources/convertigo-nocode (SKILL.md
// and the drawers its "> Drawer" lines name) and the generalist skill of js/setup_common.js. The setups (_setupCodex,
// _setupClaude), the skill-install tool and the MCP resources convertigo://skills/... all render them here; the Agent
// Bridge installs the same files for Tigo. This file is part of the guidance fingerprint (js/guidance_version.js): a
// change of the rendering makes an installed copy stale.
//
// skill-install answers a skill for a client that has none or an out-of-date one (its SKILL.md carries the guidance
// version it was made from): the content to apply in the current session at once, the files with their checksums to
// write for the next sessions, the obsolete files to delete, or "up to date". It never writes anything itself, never
// answers a token, a key or a client configuration, and names files by a plain relative name only.
C8O.skillPackage = C8O.skillPackage || {};

(function (api) {
  var NOCODE = "convertigo-nocode";
  var GENERALIST = "convertigo-generalist";
  var NOCODE_FOLDER = "convertigo-nocode";
  var MAIN_FILE = "SKILL.md";
  var FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9-]*\.md$/;
  var VERSION_LINE = /^- Skill guidance version: `[^`]*`\./m;
  var ENDPOINT_LINE = /^- Expected MCP endpoint: `[^`]*`\./m;
  var NOCODE_URI = "convertigo://skills/" + NOCODE;

  api.NOCODE = NOCODE;
  api.GENERALIST = GENERALIST;
  api.NOCODE_URI = NOCODE_URI;

  // Where each harness loads its skills from, and the setup that also installs them.
  var HARNESSES = {
    codex: { id: "codex", setup: "_setupCodex", skillsDir: "~/.codex/skills/", note: "The folder is $CODEX_HOME/skills/ when CODEX_HOME is set." },
    claude: { id: "claude", setup: "_setupClaude", skillsDir: "~/.claude/skills/", note: "A project-level install goes in .claude/skills/ of the project instead." },
    vibe: { id: "vibe", setup: "_setupVibe", skillsDir: "~/.vibe/skills/", note: "When ~/.vibe/config.toml has an enabled_skills list, add the skill's name to it." },
    generic: { id: "generic", setup: "", skillsDir: "", note: "Write the folder where your agent loads its skills (a folder per skill holding its SKILL.md)." }
  };
  api.HARNESSES = HARNESSES;

  function trim(value) {
    return value === null || value === undefined ? "" : String(value).replace(/^\s+|\s+$/g, "");
  }

  function truthy(value) {
    var text = trim(value).toLowerCase();
    return value === true || text === "true" || text === "1" || text === "yes";
  }

  // Java behind the engine; the tests give their own.
  api.host = api.host || {
    readFile: function (folder, name) {
      return String(c8oReadCatalogFile(folder, name));
    },
    version: function () {
      return String(C8O.MCP_GUIDANCE_VERSION);
    },
    // the public URL of this MCP (the engine's application server URL, as _setupCodex derives it)
    mcpUrl: function () {
      try {
        var EnginePropertiesManager = Packages.com.twinsoft.convertigo.engine.EnginePropertiesManager;
        var base = trim(EnginePropertiesManager.getProperty(EnginePropertiesManager.PropertyName.APPLICATION_SERVER_CONVERTIGO_URL)).replace(/\/+$/, "");
        if (/\/api\/mcp$/i.test(base)) { return base; }
        if (/\/convertigo$/i.test(base)) { return base + "/api/mcp"; }
        if (/\/convertigo\/api$/i.test(base)) { return base + "/mcp"; }
        if (base.length) { return base + "/convertigo/api/mcp"; }
      } catch (_noEngineUrl) {}
      return "http://localhost:18080/convertigo/api/mcp";
    },
    generalistMarkdown: function (harnessId, mcpUrl) {
      if (typeof C8O.setupCommon === "undefined" || typeof C8O.setupCommon.buildSkillMarkdown !== "function") {
        include("js/setup_common.js");
      }
      return C8O.setupCommon.buildSkillMarkdown(harnessId, mcpUrl);
    },
    generalistSlug: function (harnessId) {
      if (typeof C8O.setupCommon === "undefined" || typeof C8O.setupCommon.harness !== "function") {
        include("js/setup_common.js");
      }
      return String(C8O.setupCommon.harness(harnessId).skillSlug);
    }
  };

  api.harness = function (value) {
    var key = trim(value).toLowerCase().replace(/[^a-z]/g, "");
    if (key === "claudecode") { key = "claude"; }
    if (key === "mistral" || key === "mistralvibe") { key = "vibe"; }
    if (key === "openai" || key === "codexcli") { key = "codex"; }
    return HARNESSES[key] || HARNESSES.generic;
  };

  // The skill asked: the No Code one by default; the generalist by any of its names.
  api.skillId = function (value) {
    // skills: ["convertigo-nocode"] names one skill per call: the first
    if (value !== null && typeof value === "object" || /^\s*\[/.test(String(value == null ? "" : value))) {
      value = listArg(value)[0];
    }
    var key = trim(value).toLowerCase();
    if (!key.length || key === NOCODE || key === "nocode" || key === "no-code") {
      return NOCODE;
    }
    if (key === GENERALIST || key === "generalist" || key === "convertigo-vibe-generalist") {
      return GENERALIST;
    }
    return "";
  };

  // The No Code skill's drawers, in the order of its "> Drawer" lines (js/guidance_version.js reads them the same way).
  api.drawerNames = function (skillText) {
    var names = [];
    var pattern = /^> Drawer `([a-z0-9][a-z0-9-]*\.md)`/gm;
    var match;
    while ((match = pattern.exec(String(skillText == null ? "" : skillText))) !== null) {
      if (names.indexOf(match[1]) < 0) {
        names.push(match[1]);
      }
    }
    return names;
  };

  // SKILL.md of the No Code skill for a harness: the guidance version it is made from, the MCP endpoint, and the setup
  // of that harness (the generic rendering names skill-install only).
  api.renderNoCodeSkill = function (harnessId, mcpUrl) {
    var harness = api.harness(harnessId);
    var text = String(api.host.readFile("resources", NOCODE_FOLDER + "/" + MAIN_FILE));
    var versionLine = "- Skill guidance version: `" + api.host.version() + "`.";
    var endpointLine = "- Expected MCP endpoint: `" + trim(mcpUrl) + "`.";
    text = VERSION_LINE.test(text) ? text.replace(VERSION_LINE, versionLine) : text;
    text = ENDPOINT_LINE.test(text) ? text.replace(ENDPOINT_LINE, endpointLine) : text;
    if (harness.setup.length) {
      text = text.replace(/`_setupCodex`/g, "`" + harness.setup + "`");
    } else {
      text = text.replace(/ \(or rerun `_setupCodex`\)/g, "");
    }
    // the end of line as _setupCodex writes it (buildNoCodeSkillMarkdown), so that both installs have the same checksum
    return text.replace(/\n*$/g, "\n");
  };

  // The files of a skill for a harness, SKILL.md first: [{path, content}]. A drawer that cannot be read is in missing.
  api.files = function (skill, harnessId, mcpUrl) {
    var harness = api.harness(harnessId);
    var files = [];
    var missing = [];
    if (skill === GENERALIST) {
      files.push({ path: MAIN_FILE, content: String(api.host.generalistMarkdown(harness.id, mcpUrl)) });
      return { files: files, missing: missing };
    }
    var main = api.renderNoCodeSkill(harness.id, mcpUrl);
    files.push({ path: MAIN_FILE, content: main });
    var drawers = api.drawerNames(main);
    for (var i = 0; i < drawers.length; i++) {
      if (!FILE_NAME.test(drawers[i])) {
        continue;
      }
      try {
        files.push({ path: drawers[i], content: String(api.host.readFile("resources", NOCODE_FOLDER + "/" + drawers[i])) });
      } catch (_missingDrawer) {
        missing.push(drawers[i]);
      }
    }
    return { files: files, missing: missing };
  };

  // ---- SHA-256 of the UTF-8 bytes of a text (no Java: the tests and the engine compute the same) ----
  var K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  function utf8Bytes(text) {
    var bytes = [];
    for (var i = 0; i < text.length; i++) {
      var code = text.charCodeAt(i);
      if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
        var low = text.charCodeAt(i + 1);
        if (low >= 0xdc00 && low <= 0xdfff) {
          code = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00);
          i++;
        }
      }
      if (code < 0x80) {
        bytes.push(code);
      } else if (code < 0x800) {
        bytes.push(0xc0 | (code >> 6), 0x80 | (code & 63));
      } else if (code < 0x10000) {
        bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
      } else {
        bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 63), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
      }
    }
    return bytes;
  }
  api.utf8Length = function (text) {
    return utf8Bytes(String(text == null ? "" : text)).length;
  };

  function rotr(value, bits) {
    return (value >>> bits) | (value << (32 - bits));
  }

  api.sha256 = function (text) {
    var bytes = utf8Bytes(String(text == null ? "" : text));
    var bitLength = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) {
      bytes.push(0);
    }
    var high = Math.floor(bitLength / 4294967296);
    var low = bitLength >>> 0;
    bytes.push((high >>> 24) & 255, (high >>> 16) & 255, (high >>> 8) & 255, high & 255,
      (low >>> 24) & 255, (low >>> 16) & 255, (low >>> 8) & 255, low & 255);
    var h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var w = new Array(64);
    for (var offset = 0; offset < bytes.length; offset += 64) {
      var t;
      for (t = 0; t < 16; t++) {
        var at = offset + t * 4;
        w[t] = (bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3];
      }
      for (t = 16; t < 64; t++) {
        var w15 = w[t - 15];
        var w2 = w[t - 2];
        var s0 = rotr(w15, 7) ^ rotr(w15, 18) ^ (w15 >>> 3);
        var s1 = rotr(w2, 17) ^ rotr(w2, 19) ^ (w2 >>> 10);
        w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
      }
      var a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
      for (t = 0; t < 64; t++) {
        var sum1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        var choice = (e & f) ^ (~e & g);
        var temp1 = (hh + sum1 + choice + K[t] + w[t]) | 0;
        var sum0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        var majority = (a & b) ^ (a & c) ^ (b & c);
        var temp2 = (sum0 + majority) | 0;
        hh = g; g = f; f = e; e = (d + temp1) | 0; d = c; c = b; b = a; a = (temp1 + temp2) | 0;
      }
      h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
      h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
    }
    var hex = "";
    for (var i = 0; i < 8; i++) {
      var part = (h[i] >>> 0).toString(16);
      hex += "00000000".substring(part.length) + part;
    }
    return hex;
  };

  // ---- arguments ----

  // A list argument: a JSON array (or its text), a Java list, or one value.
  function listArg(value) {
    if (value === null || value === undefined || value === "") {
      return [];
    }
    if (!Array.isArray(value) && typeof value === "object" && typeof value.size === "function" && typeof value.get === "function") {
      var listed = [];
      for (var i = 0; i < value.size(); i++) {
        listed.push(value.get(i));
      }
      return listed;
    }
    if (Array.isArray(value)) {
      return value;
    }
    var text = trim(value);
    // a list as JSON text, or that text once more as a JSON string (a client that encodes its arguments twice)
    if (/^\[[\s\S]*\]$/.test(text) || /^"[\s\S]*"$/.test(text)) {
      try {
        return listArg(JSON.parse(text));
      } catch (_notJson) {}
    }
    return text.length ? text.split(/\s*,\s*/) : [];
  }

  function field(item, key) {
    if (item === null || item === undefined || typeof item !== "object") {
      return null;
    }
    if (typeof item.get === "function" && typeof item.containsKey === "function") {
      return item.containsKey(key) ? item.get(key) : null;
    }
    return item[key] === undefined ? null : item[key];
  }

  // A plain file name of the skill folder: no folder, no "..", no absolute path. A path naming the skill folder
  // (convertigo-nocode/checks.md) is its file name.
  function plainName(value, skillFolder) {
    var text = trim(value).replace(/\\/g, "/");
    var prefix = skillFolder + "/";
    if (text.toLowerCase().indexOf(prefix) === 0) {
      text = text.substring(prefix.length);
    }
    if (text.toLowerCase().indexOf("./") === 0) {
      text = text.substring(2);
    }
    return FILE_NAME.test(text) ? text : "";
  }

  // The files the client says its skill folder holds: [{path, sha256}] (sha256 "" when it gave none), plus the
  // entries refused (a path outside the folder).
  function installedFiles(value, skillFolder) {
    var items = listArg(value);
    var files = [];
    var refused = [];
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var path = typeof item === "object" && item !== null ? field(item, "path") || field(item, "name") || field(item, "file") : item;
      var sha = typeof item === "object" && item !== null ? field(item, "sha256") || field(item, "checksum") : null;
      var name = plainName(path, skillFolder);
      if (!name.length) {
        if (trim(path).length) {
          refused.push(trim(path));
        }
        continue;
      }
      files.push({ path: name, sha256: trim(sha).toLowerCase() });
    }
    return { files: files, refused: refused };
  }

  function findFile(files, name) {
    for (var i = 0; i < files.length; i++) {
      if (files[i].path.toLowerCase() === String(name).toLowerCase()) {
        return files[i];
      }
    }
    return null;
  }

  // ---- the tool ----

  // args: {harness, skill, installedVersion, installedFiles, plan, file, all}; env: {authKind} (js/mcp_endpoint_router.js)
  api.install = function (args, env) {
    args = args || {};
    env = env || {};
    var harness = api.harness(args.harness);
    var skill = api.skillId(args.skill);
    var version = api.host.version();
    if (!skill.length) {
      return { status: "invalid", error: { code: "unknown_skill", message: "Unknown skill " + JSON.stringify(trim(args.skill)) + ": ask " + NOCODE + " or " + GENERALIST + "." }, skills: [NOCODE, GENERALIST] };
    }
    if (skill === GENERALIST && trim(env.authKind).toLowerCase() === "nocode") {
      return { status: "not_applicable", skill: GENERALIST, version: version, message: "A No Code token works with the " + NOCODE + " skill only: install that one." };
    }
    var slug = skill === GENERALIST ? api.host.generalistSlug(harness.id) : NOCODE;
    var mcpUrl = api.host.mcpUrl();
    var built = api.files(skill, harness.id, mcpUrl);
    var files = built.files;
    var targetDir = harness.skillsDir.length ? harness.skillsDir + slug + "/" : "<skills folder of your agent>/" + slug + "/";
    var resourceOf = function (path) {
      return skill === NOCODE ? (path === MAIN_FILE ? NOCODE_URI : NOCODE_URI + "/" + path) : "";
    };

    // One file, for a client that reads the drawers one call at a time.
    var asked = trim(args.file);
    if (asked.length) {
      var name = plainName(asked, slug);
      var one = name.length ? findFile(files, name) : null;
      if (!one) {
        return {
          status: "invalid", skill: slug, version: version,
          error: { code: "unknown_file", message: "No file " + JSON.stringify(asked) + " in the " + slug + " skill: ask one of files, by its plain name." },
          files: files.map(function (item) { return item.path; })
        };
      }
      var answer = { status: "ok", skill: slug, version: version, path: one.path, writeTo: targetDir + one.path,
        chars: one.content.length, bytes: api.utf8Length(one.content), sha256: api.sha256(one.content) };
      if (resourceOf(one.path).length) {
        answer.resource = resourceOf(one.path);
      }
      answer.content = one.content;
      return answer;
    }

    var installedVersion = trim(args.installedVersion);
    var installed = installedFiles(args.installedFiles, slug);
    var listed = installed.files.length > 0;
    var manifest = [];
    var changes = 0;
    for (var i = 0; i < files.length; i++) {
      var item = files[i];
      var sha = api.sha256(item.content);
      var entry = { path: item.path, chars: item.content.length, bytes: api.utf8Length(item.content), sha256: sha };
      var mine = listed ? findFile(installed.files, item.path) : null;
      if (!listed) {
        entry.action = "write";
      } else if (!mine) {
        entry.action = "create";
      } else if (!mine.sha256.length) {
        entry.action = "write";
      } else {
        entry.action = mine.sha256 === sha ? "unchanged" : "update";
      }
      if (entry.action !== "unchanged" && entry.action !== "write") {
        changes++;
      }
      if (resourceOf(item.path).length) {
        entry.resource = resourceOf(item.path);
      }
      manifest.push(entry);
    }
    // a Markdown file of the folder that the skill no longer names (an older drawer): deleted; other files are left
    var obsolete = [];
    for (var o = 0; o < installed.files.length; o++) {
      if (/\.md$/i.test(installed.files[o].path) && !findFile(files, installed.files[o].path)) {
        obsolete.push(installed.files[o].path);
      }
    }
    var sameVersion = installedVersion.length > 0 && installedVersion === version;
    var upToDate = sameVersion && changes === 0 && obsolete.length === 0;
    var plan = truthy(args.plan);
    var all = truthy(args.all);

    var result = {
      status: upToDate ? "up_to_date" : (plan ? "plan" : "install"),
      skill: slug,
      version: version,
      installedVersion: installedVersion,
      upToDate: upToDate,
      harness: harness.id,
      targetDir: targetDir
    };
    if (upToDate) {
      result.message = "The installed " + slug + " skill is this version: nothing to install. Keep using it.";
      return result;
    }
    if (installed.refused.length) {
      result.refusedPaths = installed.refused;
    }
    result.howTo = howTo(skill, slug, harness, plan, all, manifest.length);
    result.files = manifest;
    result.obsolete = obsolete;
    if (built.missing.length) {
      result.missingFiles = built.missing;
    }
    if (plan) {
      return result;
    }
    if (all) {
      result.contents = files.map(function (item) { return { path: item.path, content: item.content }; });
    } else {
      result.content = files[0].content;
      result.remaining = files.slice(1).map(function (item) { return item.path; });
    }
    return result;
  };

  function howTo(skill, slug, harness, plan, all, count) {
    var steps = [];
    if (plan) {
      steps.push("Plan only: nothing is written by this tool, and no content is answered. Call skill-install again without plan to get it.");
    }
    steps.push("Apply SKILL.md now: its rules hold for the rest of this session" + (plan ? " once you have it." : (all ? " (contents)." : " (content).")));
    if (skill === NOCODE && count > 1) {
      steps.push(all
        ? "The drawers are in contents: read each one before the step it covers, as SKILL.md says."
        : "Read each drawer before the step it covers, as SKILL.md says: skill-install {file: \"<name>\"} answers one (or resources/read " + NOCODE_URI + "/<name>). remaining lists them.");
    }
    steps.push("If you can write files: write each file of files in " + (harness.skillsDir.length ? "" : "the skill folder ") +
      "targetDir with its exact content (UTF-8), check its bytes and sha256, delete the obsolete files and leave the other files of the folder. " +
      "Never write a token, a key or a client configuration there. The next session loads the skill.");
    steps.push("If you cannot write files, keep this content for this session and call skill-install again in the next one.");
    steps.push("At each session start, compare the `Skill guidance version` line of the installed SKILL.md with the version the MCP gives (server instructions, convertigo://capabilities); on a difference call skill-install with installedVersion" +
      " and installedFiles (path and sha256 of each file of the folder).");
    if (harness.note.length) {
      steps.push(harness.note);
    }
    if (harness.setup.length) {
      steps.push("The setup " + harness.setup + " of this MCP also installs the skill (with the MCP configuration): either way gives the same files.");
    }
    return steps;
  }

  // The text of one file of a skill, rendered for any client (resources/read of convertigo://skills/...).
  api.fileText = function (skill, path) {
    var built = api.files(api.skillId(skill) || NOCODE, "generic", api.host.mcpUrl());
    var found = findFile(built.files, path);
    if (!found) {
      throw new Error("No file " + path + " in the " + skill + " skill");
    }
    return found.content;
  };

  // The MCP resources of the No Code skill: convertigo://skills/convertigo-nocode (its SKILL.md, rendered for any
  // client) and one URI per drawer, for clients that read resources (js/resources.js).
  api.resourceEntries = function () {
    var version = api.host.version();
    var main = api.renderNoCodeSkill("generic", api.host.mcpUrl());
    var entries = [{
      uri: NOCODE_URI,
      name: "Convertigo No Code skill",
      title: "Convertigo No Code skill (SKILL.md)",
      description: "The convertigo-nocode skill, guidance version " + version + ": the rules of every No Code turn. Install it with skill-install; its drawers are " + NOCODE_URI + "/<file>.",
      mimeType: "text/markdown",
      aliases: [NOCODE_URI + "/" + MAIN_FILE],
      skillFile: { skill: NOCODE, path: MAIN_FILE }
    }];
    var drawers = api.drawerNames(main);
    for (var i = 0; i < drawers.length; i++) {
      if (!FILE_NAME.test(drawers[i])) {
        continue;
      }
      entries.push({
        uri: NOCODE_URI + "/" + drawers[i],
        name: "Convertigo No Code skill: " + drawers[i],
        title: "Convertigo No Code skill drawer " + drawers[i],
        description: "A drawer of the convertigo-nocode skill (version " + version + "): read it before the step its SKILL.md line names.",
        mimeType: "text/markdown",
        skillFile: { skill: NOCODE, path: drawers[i] }
      });
    }
    return entries;
  };
})(C8O.skillPackage);
