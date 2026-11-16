// The NGX HTML round-trip of the `html` edit profile (js/edit_profile.js): an agent edits the generated html, scss and
// ts of the pages and shared components under _private/ionic/src/app, then project-reload(fromIonic) imports them back
// into the Convertigo objects of the loaded project, with the engine's
// com.twinsoft.convertigo.engine.util.NgxIonicRoundTripConverter.importIntoLoadedProject (no Eclipse needed). The
// generator writes a `.c8o-map.json` sidecar next to each generated file: what the import maps the files back with.
// An engine without that class answers `unsupported`. Without the profile none of this is used: the generated files
// stay generated.
if (typeof C8O === "undefined") {
  var C8O = {};
}
C8O.ionicRoundTrip = C8O.ionicRoundTrip || {};
(function () {
  if (C8O.ionicRoundTrip._initialized === true) {
    return;
  }
  C8O.ionicRoundTrip._initialized = true;

  var File = typeof Packages !== "undefined" ? Packages.java.io.File : null;
  var SIDECAR_SUFFIX = ".c8o-map.json";
  var GUIDE = "convertigo://guides/html-roundtrip";
  var MAX_LISTED_PAGES = 60;
  var UNSUPPORTED_MESSAGE = "This engine has no Ionic round-trip import (a Convertigo 8.5 engine whose "
    + "NgxIonicRoundTripConverter has importIntoLoadedProject): make the change with the tree tools.";

  C8O.ionicRoundTrip.GUIDE = GUIDE;
  C8O.ionicRoundTrip.UNSUPPORTED_MESSAGE = UNSUPPORTED_MESSAGE;

  function readText(file) {
    return String(new java.lang.String(java.nio.file.Files.readAllBytes(file.toPath()), "UTF-8"));
  }

  function isSidecar(file) {
    var name = String(file.getName());
    return name.length > SIDECAR_SUFFIX.length && name.slice(-SIDECAR_SUFFIX.length) === SIDECAR_SUFFIX;
  }

  function listFiles(dir) {
    var files = dir != null && dir.isDirectory() ? dir.listFiles() : null;
    var list = [];
    for (var i = 0; files != null && i < files.length; i++) {
      list.push(files[i]);
    }
    list.sort(function (a, b) {
      var left = String(a.getName());
      var right = String(b.getName());
      return left < right ? -1 : (left > right ? 1 : 0);
    });
    return list;
  }

  function appDir(project) {
    var dir = new File(new File(String(project.getDirPath())), "_private/ionic/src/app");
    return dir.isDirectory() ? dir : null;
  }

  // The engine's round-trip converter when it can import into a loaded project, null otherwise (origin/develop and the
  // 8.4 engines have none: unsupported).
  // Only where js/edit_profile.js offers the html profile: an engine of 8.5.0 or more with the method.
  C8O.ionicRoundTrip.converter = function () {
    try {
      if (!C8O.editProfile || !C8O.editProfile.htmlAvailable()) {
        return null;
      }
      var Converter = Packages.com.twinsoft.convertigo.engine.util.NgxIonicRoundTripConverter;
      return typeof Converter.importIntoLoadedProject === "function" ? Converter : null;
    } catch (_noConverter) {
      return null;
    }
  };

  C8O.ionicRoundTrip.supported = function () {
    return C8O.ionicRoundTrip.converter() !== null;
  };

  // The sidecar of a page or shared component lies next to its generated files:
  // pages/<page>/ or components/<project>.<component>/
  function candidateDirs(app, container, isPage) {
    var name = String(container.getName()).toLowerCase();
    if (isPage) {
      return [new File(new File(app, "pages"), name)];
    }
    var dirs = [];
    var components = listFiles(new File(app, "components"));
    for (var i = 0; i < components.length; i++) {
      var dirName = String(components[i].getName()).toLowerCase();
      if (dirName === name || dirName.slice(-(name.length + 1)) === "." + name) {
        dirs.push(components[i]);
      }
    }
    return dirs;
  }

  function containerOf(dbo) {
    var PageComponent = Packages.com.twinsoft.convertigo.beans.ngx.components.PageComponent;
    var UISharedComponent = Packages.com.twinsoft.convertigo.beans.ngx.components.UISharedComponent;
    var container = dbo;
    while (container != null && !(container instanceof PageComponent) && !(container instanceof UISharedComponent)) {
      container = container.getParent();
    }
    return container;
  }

  /**
   * The generated Ionic files of the page or shared component containing a Convertigo object, when the round-trip can
   * import their edits: absolute html, scss, ts and sidecar paths, or null.
   */
  C8O.ionicRoundTrip.files = function (dbo) {
    try {
      var PageComponent = Packages.com.twinsoft.convertigo.beans.ngx.components.PageComponent;
      var container = containerOf(dbo);
      if (container == null) {
        return null;
      }
      var project = container.getProject();
      var app = project == null ? null : appDir(project);
      if (app == null) {
        return null;
      }
      var qname = String(container.getQName());
      var isPage = container instanceof PageComponent;
      var dirs = candidateDirs(app, container, isPage);
      for (var d = 0; d < dirs.length; d++) {
        var sidecars = listFiles(dirs[d]);
        for (var s = 0; s < sidecars.length; s++) {
          if (!isSidecar(sidecars[s])) {
            continue;
          }
          var map = JSON.parse(readText(sidecars[s]));
          if (String(map.qname || "") !== qname) {
            continue;
          }
          var projectDir = new File(String(project.getDirPath()));
          var files = map.files || {};
          var absolute = function (relative) {
            return relative ? String(new File(projectDir, String(relative)).getAbsolutePath()) : "";
          };
          return {
            project: String(project.getName()),
            container: qname,
            kind: isPage ? "page" : "sharedComponent",
            html: absolute(files.html),
            scss: absolute(files.scss),
            ts: absolute(files.ts),
            sidecar: String(sidecars[s].getAbsolutePath()),
            importWith: "project-reload({project: \"" + project.getName() + "\", fromIonic: true, ionicTarget: \"" + String(files.html || "") + "\"})",
            guide: GUIDE
          };
        }
      }
    } catch (_ignoreIonicFiles) {}
    return null;
  };

  /**
   * The generated files of the page or shared component containing a Convertigo object that were edited and not
   * imported yet, or null: a change of its objects writes these files again.
   */
  C8O.ionicRoundTrip.pendingEdits = function (dbo) {
    try {
      var Converter = C8O.ionicRoundTrip.converter();
      if (Converter === null || typeof Converter.pendingIonicChanges !== "function") {
        return null;
      }
      var files = C8O.ionicRoundTrip.files(dbo);
      if (files == null) {
        return null;
      }
      var list = Converter.pendingIonicChanges(containerOf(dbo), files.html, files.scss, files.ts);
      if (list == null || list.isEmpty()) {
        return null;
      }
      var paths = [];
      for (var i = 0; i < list.size(); i++) {
        paths.push(String(list.get(i)));
      }
      return { container: files.container, files: paths, importWith: files.importWith };
    } catch (_ignorePendingEdits) {}
    return null;
  };

  /**
   * Refuses, in the html edit profile only, a change of the objects of a page or shared component whose edited files
   * are not imported yet: the change writes these files again.
   */
  C8O.ionicRoundTrip.assertNoPendingEdits = function (dbo, action) {
    if (dbo == null || !C8O.editProfile || C8O.editProfile.current() !== "html") {
      return;
    }
    var pending = C8O.ionicRoundTrip.pendingEdits(dbo);
    if (pending) {
      throw new Error("The generated files of " + pending.container + " have edits that are not imported yet ("
        + pending.files.join(", ") + "). " + action + " writes these files again and would lose them: import them first with "
        + pending.importWith + ", then retry.");
    }
  };

  /**
   * The pages and shared components of a project whose generated Ionic files the round-trip can import, for
   * mobile-builder-open in the html edit profile.
   */
  C8O.ionicRoundTrip.projectSummary = function (projectName) {
    if (!C8O.ionicRoundTrip.supported()) {
      return { available: false, supported: false, sidecars: 0, pages: [], sharedComponents: [], guide: GUIDE, hint: UNSUPPORTED_MESSAGE };
    }
    try {
      var project = Packages.com.twinsoft.convertigo.engine.Engine.theApp.databaseObjectsManager.getOriginalProjectByName(String(projectName), false);
      var app = project == null ? null : appDir(project);
      if (app == null) {
        return { available: false, supported: true, sidecars: 0, pages: [], sharedComponents: [], guide: GUIDE,
          hint: "The application of this project has no generated files yet: wait for mobile-builder-open to report ready, then call it again." };
      }
      var count = 0;
      // the pages and shared components with their html: an agent reads them without searching the tree
      var pages = [];
      var components = [];
      var projectDir = new File(String(project.getDirPath()));
      var groups = ["pages", "components"];
      for (var g = 0; g < groups.length; g++) {
        var dirs = listFiles(new File(app, groups[g]));
        for (var d = 0; d < dirs.length; d++) {
          var files = listFiles(dirs[d]);
          for (var f = 0; f < files.length; f++) {
            if (isSidecar(files[f])) {
              count++;
              var listed = groups[g] === "pages" ? pages : components;
              if (listed.length < MAX_LISTED_PAGES) {
                try {
                  var map = JSON.parse(readText(files[f]));
                  if (map.qname && map.files && map.files.html && String(map.qname).indexOf(String(project.getName()) + ".") === 0) {
                    listed.push({
                      qname: String(map.qname),
                      html: String(new File(projectDir, String(map.files.html)).getAbsolutePath())
                    });
                  }
                } catch (_ignorePageMap) {}
              }
            }
          }
        }
      }
      if (!count) {
        return { available: false, supported: true, sidecars: 0, pages: [], sharedComponents: [], appDir: String(app.getAbsolutePath()), guide: GUIDE,
          hint: "No .c8o-map.json sidecar yet: the files were generated before this engine wrote them. Change a page with the tree tools, or reload the project, to have them generated again." };
      }
      return {
        available: true,
        supported: true,
        sidecars: count,
        appDir: String(app.getAbsolutePath()),
        pages: pages,
        sharedComponents: components,
        guide: GUIDE,
        hint: "Visual work on the existing pages and shared components goes through their generated files: pages and sharedComponents list their html (the scss and ts lie next to it); read the ones you need together, edit them, then import with project-reload(fromIonic:true, ionicTarget)."
      };
    } catch (_ignoreIonicSummary) {}
    return null;
  };

  // The global styles are not imported (only app.component.scss and the files of the pages and components are).
  C8O.ionicRoundTrip.forbiddenTarget = function (target) {
    var normalized = String(target || "").replace(/\\/g, "/").replace(/\/{2,}/g, "/").replace(/\/+$/, "").toLowerCase();
    if (/(^|\/)src\/global\.(css|scss|sass)$/.test(normalized)) {
      return String(target);
    }
    return "";
  };

  function count(json, field) {
    var value = json && json[field] != null ? Number(json[field]) : 0;
    return isNaN(value) ? 0 : value;
  }

  /**
   * Imports the edited generated files of a loaded project (all of them, or the file or folder ionicTarget names,
   * relative to the project or absolute) into its objects, without reloading it: the engine writes the project and the
   * generated files of what changed again. {status, reloaded, message, ionicImported, ionicSource, ionicTarget,
   * ionicReport{processed, pagesUpdated, sharedComponentsUpdated, templatesUpdated, stylesUpdated, scriptsUpdated,
   * skipped, warnings[], changedObjects[]}}; status `unsupported` on an engine without the import.
   */
  C8O.ionicRoundTrip.importIntoLoadedProject = function (projectName, ionicTarget, errors) {
    var name = String(projectName || "");
    var target = String(ionicTarget || "").trim();
    var result = { reloaded: false, status: "", message: "", fromIonic: true, ionicImported: false, ionicSource: "", ionicTarget: target, ionicReport: null };
    var fail = function (entryName, message, status) {
      if (errors && errors.push) {
        errors.push({ name: entryName, message: message });
      }
      result.message = message;
      if (status) {
        result.status = status;
      }
      return result;
    };
    var Converter = C8O.ionicRoundTrip.converter();
    if (Converter === null) {
      return fail("__ionic__", UNSUPPORTED_MESSAGE, "unsupported");
    }
    var forbidden = C8O.ionicRoundTrip.forbiddenTarget(target);
    if (forbidden.length) {
      return fail("__ionicTarget__", "Forbidden Ionic target: " + forbidden
        + ". Global styles are not imported: edit app.component.scss or the scss of the page or shared component instead.");
    }
    try {
      var Engine = Packages.com.twinsoft.convertigo.engine.Engine;
      var project = Engine.theApp.databaseObjectsManager.getOriginalProjectByName(name, false);
      if (project == null) {
        return fail("__ionic__", "The project " + name + " is not loaded.");
      }
      var ionicDir = new File(new File(String(project.getDirPath())), "_private/ionic");
      result.ionicSource = String(ionicDir.getAbsolutePath());
      if (!ionicDir.exists()) {
        return fail("__ionic__", "Missing Ionic directory: " + result.ionicSource + ". Build or open the mobile application once to generate it.");
      }
      var json = JSON.parse(String(Converter.importIntoLoadedProject(name, target.length ? target : null).toString()));
      var warnings = [];
      for (var w = 0; json.warnings && w < json.warnings.length; w++) {
        warnings.push(String(json.warnings[w]));
      }
      var changed = [];
      for (var c = 0; json.changedObjects && c < json.changedObjects.length; c++) {
        changed.push(String(json.changedObjects[c]));
      }
      result.reloaded = true;
      result.ionicImported = true;
      result.status = "imported_from_ionic";
      result.ionicReport = {
        processed: count(json, "processed"),
        pagesUpdated: count(json, "pagesUpdated"),
        sharedComponentsUpdated: count(json, "sharedComponentsUpdated"),
        templatesUpdated: count(json, "templatesUpdated"),
        stylesUpdated: count(json, "stylesUpdated"),
        scriptsUpdated: count(json, "scriptsUpdated"),
        skipped: count(json, "skipped"),
        warnings: warnings,
        changedObjects: changed
      };
      var updated = result.ionicReport.pagesUpdated + result.ionicReport.sharedComponentsUpdated + result.ionicReport.templatesUpdated
        + result.ionicReport.stylesUpdated + result.ionicReport.scriptsUpdated;
      result.message = updated > 0
        ? "Imported into " + name + ": " + changed.join(", ") + ". Its generated files were written again: read them again before another edit."
        : "Nothing was imported: no edited file differs from what its objects generate" + (warnings.length ? " (see warnings)" : "") + ".";
      return result;
    } catch (ionicError) {
      return fail("__ionic__", String(ionicError && ionicError.message ? ionicError.message : ionicError));
    }
  };
})();
