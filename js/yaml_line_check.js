// The line grammar of a legacy-format Convertigo project (c8oProject.yaml starting with ↑ or ↓), checked before
// project-reload in the yaml edit profile (js/edit_profile.js), where the agent writes the files itself. The engine's
// YamlConverter reads every line outside a `|` block with ( *)(- )?(↑)?(→)?(↓)?(.*?): (🗏 )?(.*): a line without the
// space after its colon (an editor that strips trailing spaces), a blank line, a tab or a 🗏 file that does not exist
// fails the whole project. In the Eclipse Studio such a reload ran its 120 s wait and answered "Timed out waiting for
// project reload completion", the cause only in the engine log, and left the project unloaded (16/11, SalesPipeline).
// Checked first, the project stays loaded and the answer names the file and the line. scripts/c8o_yaml_lint.py is the
// full lint (both formats, beans, priorities, references); this is its line grammar only.
if (typeof C8O === "undefined") { var C8O = {}; }
C8O.yamlLineCheck = (function () {
  var api = {};
  var LINE = /^( *)(- )?(↑)?(→)?(↓)?(.*?): (🗏 )?(.*)$/;
  var MAX_ERRORS = 20;

  // Lines as the engine reads them: split on \n, \r\n or \r only.
  api.lines = function (text) {
    var lines = String(text == null ? "" : text).split(/\r\n|\r|\n/);
    if (lines.length && lines[lines.length - 1] === "") {
      lines.pop();
    }
    return lines;
  };

  // The format of a project from the first line of its c8oProject.yaml: "legacy" (↑ or ↓) or "standard".
  api.format = function (firstLine) {
    var line = String(firstLine == null ? "" : firstLine);
    return line.charAt(0) === "↑" || line.charAt(0) === "↓" ? "legacy" : "standard";
  };

  // The errors of one file's text: [{line, message, text}]. exists(relativePath) says whether a 🗏 file exists.
  api.checkText = function (text, exists) {
    var lines = api.lines(text);
    var errors = [];
    for (var i = 0; i < lines.length && errors.length < MAX_ERRORS; i++) {
      var line = lines[i];
      var error = function (message) {
        errors.push({ line: i + 1, message: message, text: line.length > 160 ? line.substring(0, 160) + "..." : line });
      };
      if (!line.trim().length) {
        error("blank line: the engine reads no blank line outside a | block");
        continue;
      }
      if (/^\s*\t|^ *- *\t/.test(line)) {
        error("tab in the indentation: indent with two spaces");
        continue;
      }
      var match = LINE.exec(line);
      if (match === null) {
        error(/:\s*$/.test(line)
          ? "no space after the colon: a line ending with ':' needs its trailing space (': '), which an editor that strips trailing spaces removes"
          : "not a 'key: value' line: every line outside a | block is 'key: value' (with ': ')");
        continue;
      }
      var value = match[8];
      if (match[7] && exists && !exists(String(value).trim())) {
        error("the referenced file does not exist: _c8oProject/" + String(value).trim());
      }
      if (value.charAt(0) === "'" && (value.length < 2 || value.charAt(value.length - 1) !== "'")) {
        error("single-quoted value not closed on its line (a multi-line value is a | block)");
      }
      if (value === "|") {
        // the block: the following lines indented two more spaces than the key
        var blockIndent = match[1].length + 2;
        var prefix = new Array(blockIndent + 1).join(" ");
        var j = i + 1;
        while (j < lines.length && lines[j].indexOf(prefix) === 0) {
          j++;
        }
        if (j === i + 1) {
          error("| block without content: its lines are indented two more spaces than the key");
        }
        i = j - 1;
      }
    }
    return errors;
  };

  // The errors of a project folder: [{file, line, message, text}] (file relative to the project folder), [] for a
  // standard-format project (its YAML is checked by the engine) or a folder without c8oProject.yaml.
  api.checkProject = function (projectDir) {
    var File = Packages.java.io.File;
    var Files = Packages.java.nio.file.Files;
    var dir = new File(String(projectDir));
    var root = new File(dir, "c8oProject.yaml");
    if (!root.isFile()) {
      return [];
    }
    var read = function (file) {
      return String(new java.lang.String(Files.readAllBytes(file.toPath()), "UTF-8"));
    };
    var rootText = read(root);
    if (api.format(api.lines(rootText)[0]) !== "legacy") {
      return [];
    }
    var sources = new File(dir, "_c8oProject");
    var exists = function (relative) {
      return relative.length > 0 && new File(sources, relative).isFile();
    };
    var errors = [];
    var add = function (relative, text) {
      var found = api.checkText(text, exists);
      for (var k = 0; k < found.length && errors.length < MAX_ERRORS; k++) {
        found[k].file = relative;
        errors.push(found[k]);
      }
    };
    add("c8oProject.yaml", rootText);
    var walk = function (folder, relative) {
      var children = folder.listFiles();
      var names = [];
      for (var c = 0; children != null && c < children.length; c++) {
        names.push(children[c]);
      }
      names.sort(function (a, b) {
        var left = String(a.getName());
        var right = String(b.getName());
        return left < right ? -1 : (left > right ? 1 : 0);
      });
      for (var n = 0; n < names.length && errors.length < MAX_ERRORS; n++) {
        var name = String(names[n].getName());
        if (names[n].isDirectory()) {
          walk(names[n], relative + name + "/");
        } else if (/\.yaml$/.test(name)) {
          add("_c8oProject/" + relative + name, read(names[n]));
        }
      }
    };
    if (sources.isDirectory()) {
      walk(sources, "");
    }
    return errors;
  };

  return api;
})();
