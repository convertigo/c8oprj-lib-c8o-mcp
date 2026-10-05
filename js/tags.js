/* Copyright (c) 2001-2026 Convertigo SA. Licensed under the GNU AGPL v3. */
if (typeof C8O === "undefined") { var C8O = {}; }

// Transport conversion only: policy, contributions, revisions and drafts stay
// in TagManager, exactly as in Eclipse and the web Studio.
C8O.tags = {
  available: function () {
    return typeof Packages.com.twinsoft.convertigo.engine.tags.TagManager.get === "function";
  },
  get: function (args) {
    if (!C8O.tags.available()) { throw new Error("Tag tools require a Convertigo engine with the shared tag domain (8.5 or newer)."); }
    var Tags = Packages.com.twinsoft.convertigo.engine.tags;
    var scope = Tags.TagManager.Scope.valueOf(String(args.scope || ""));
    var manager = Tags.TagManager.get();
    var project = args.project ? String(args.project) : null;
    var value = manager.read(scope, project, args.referenceProject ? String(args.referenceProject) : null);
    if (String(scope) === "projectObjects") {
      value.set("suggestions", manager.suggestions(project).path("suggestions"));
    }
    return JSON.parse(String(value));
  },
  apply: function (args) {
    if (!C8O.tags.available()) { throw new Error("Tag tools require a Convertigo engine with the shared tag domain (8.5 or newer)."); }
    var Tags = Packages.com.twinsoft.convertigo.engine.tags;
    var input = args.input;
    if (Object.prototype.toString.call(input) === "[object String]" || input instanceof Packages.java.lang.CharSequence) {
      input = String(input);
    }
    if (typeof input !== "string") {
      if (!input || typeof input !== "object" || Array.isArray(input)) {
        throw new Error("input must be a tag command object.");
      }
      input = JSON.stringify(input);
    }
    var value = Tags.TagManager.get().mutate(
      Tags.TagManager.Scope.valueOf(String(args.scope || "")),
      args.project ? String(args.project) : null,
      String(args.revision || ""), String(args.action || ""), Tags.TagDocument.parseObject(input));
    return JSON.parse(String(value));
  }
};
