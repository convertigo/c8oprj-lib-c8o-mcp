/*
 * The file a project-js-get or project-js-set call names in the js/ folder of a project. A folder ("js/", ".", a
 * sub-folder) used to reach the read or the write and fail there with the engine's generic "An exception occured while
 * executing step": it is refused before, with the files that can be read. A path outside js/ is refused with what to
 * give instead. File is java.io.File on the engine; the tests give their own.
 */
if (typeof C8O === "undefined") { var C8O = {}; }
C8O.projectJsFiles = C8O.projectJsFiles || {};

(function (api) {
  var LIST_MAX = 25;

  api.LIST_MAX = LIST_MAX;

  function str(value) {
    return value == null ? "" : String(value).trim();
  }

  // "js/app.js", "/app.js", "app.js" and "js\\app.js" all name app.js of the js/ folder.
  api.normalize = function (filename) {
    var normalized = str(filename).replace(/\\/g, "/");
    while (normalized.indexOf("//") >= 0) { normalized = normalized.replace("//", "/"); }
    if (normalized.indexOf("/") === 0) { normalized = normalized.substring(1); }
    if (normalized.indexOf("js/") === 0) { normalized = normalized.substring(3); }
    if (normalized === "js") { normalized = ""; }
    return normalized;
  };

  function insidePath(path, base, separator) {
    return path === base || path.indexOf(base.charAt(base.length - 1) === separator ? base : base + separator) === 0;
  }

  function relativeOf(path, base) {
    return path === base ? "" : path.substring(base.length + 1).replace(/\\/g, "/");
  }

  // The files under dir (sub-folders included, relative to it, sorted), at most max of them: {files, more}.
  api.listFiles = function (dir, max) {
    var limit = max || LIST_MAX;
    var found = [];
    var more = 0;
    (function walk(folder, prefix, depth) {
      var children = folder.listFiles();
      if (children === null || children === undefined) {
        return;
      }
      var entries = [];
      for (var i = 0; i < children.length; i++) {
        entries.push(children[i]);
      }
      entries.sort(function (a, b) { return String(a.getName()) < String(b.getName()) ? -1 : 1; });
      for (var j = 0; j < entries.length; j++) {
        var name = prefix + String(entries[j].getName());
        if (entries[j].isDirectory()) {
          if (depth < 4) {
            walk(entries[j], name + "/", depth + 1);
          }
        } else if (found.length < limit) {
          found.push(name);
        } else {
          more++;
        }
      }
    })(dir, "", 0);
    return { files: found, more: more };
  };

  api.listText = function (dir, folderLabel) {
    var listed = api.listFiles(dir);
    if (!listed.files.length) {
      return folderLabel + " holds no file.";
    }
    return "Files in " + folderLabel + ": " + listed.files.join(", ") + (listed.more ? " (and " + listed.more + " more)" : "") + ".";
  };

  // {file, name (relative to js/), base (the canonical js/ folder)}; throws a clear error for a folder or a path outside js/.
  api.resolve = function (jsDir, filename, projectName, File) {
    var given = str(filename);
    if (!given.length) {
      throw new Error("filename is required: a file of the js/ folder of " + projectName + ", for example app.js.");
    }
    var base = jsDir.getCanonicalFile();
    var basePath = String(base.getPath());
    var separator = String(File.separator);
    var name = api.normalize(given);
    var outside = new Error("filename must name a file inside the js/ folder of " + projectName + ": " + given + " points outside it. " +
      "Give a path relative to js/, for example app.js or lib/helpers.js.");
    // An absolute path inside the js/ folder is taken as its relative path; an existing file or folder elsewhere is
    // outside, unless js/ holds that name (/app.js has always meant js/app.js).
    var absolute = new File(given);
    if (absolute.isAbsolute()) {
      var absoluteFile = absolute.getCanonicalFile();
      var canonical = String(absoluteFile.getPath());
      if (insidePath(canonical, basePath, separator)) {
        name = relativeOf(canonical, basePath);
      } else if ((absoluteFile.isFile() || absoluteFile.isDirectory()) && !new File(base, name).getCanonicalFile().exists()) {
        throw outside;
      }
    }
    var target = new File(base, name).getCanonicalFile();
    var targetPath = String(target.getPath());
    if (!insidePath(targetPath, basePath, separator)) {
      throw outside;
    }
    var relative = relativeOf(targetPath, basePath);
    if (!relative.length || target.isDirectory()) {
      var label = relative.length ? "js/" + relative + "/" : "js/";
      throw new Error("filename names a folder, not a file: " + label + " of " + projectName + ". Give one file of it, its path " +
        "relative to js/. " + (target.isDirectory() ? api.listText(target, label) : "That folder does not exist yet: project-js-set creates it with its first file."));
    }
    return { file: target, name: relative, base: base };
  };
})(C8O.projectJsFiles);
