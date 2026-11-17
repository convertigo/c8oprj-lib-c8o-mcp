/*
 * databaseobject-copy: a copy of an existing object and everything under it, placed inside or next to a target, in the
 * same project or another one, in one call. To start a page from a model page, an agent read the model with ~35
 * tree-get calls, rebuilt it in files and wrote it back branch by branch with tree-apply (measured run, 17/11: about
 * 4 minutes for a 384-line page, and a page whose sources still named the model's steps).
 *
 * The copy goes through the engine's own serialization, the one the Studio's copy and paste uses (DatabaseObject.toXml and
 * read), so every property comes with it, scripts and styles included. Before it is read back, every priority of the
 * copied objects is renewed in the XML, and so is each reference to one of them inside the copy (step sources, the
 * sources of a page's components): the copy runs on its own objects, never on the original's. References to objects
 * outside the copy are kept and listed; references to the source project can be pointed at the target project
 * (retargetProject). Nothing is merged: a name already taken under the target parent is refused.
 */
if (typeof C8O === "undefined") {
  var C8O = {};
}
C8O.dboCopy = C8O.dboCopy || {};

(function (api) {
  // XML elements under an object's element that are not child objects (DboUtils.xmlPaste skips the same).
  api.NOT_CHILDREN = { property: true, handlers: true, wsdltype: true, docdata: true, dnd: true };
  // Priorities are millisecond times: 10 digits or more. Smaller numbers in a copy are values, never references.
  api.PRIORITY_DIGITS = 10;

  function str(value) {
    return value === null || value === undefined ? "" : String(value).trim();
  }

  // The XML text with each old priority of map replaced by its new one, as whole numbers only: {text, replaced}.
  api.renewPriorities = function (text, map) {
    var replaced = 0;
    var out = String(text).replace(/\d+/g, function (digits) {
      if (digits.length >= api.PRIORITY_DIGITS && Object.prototype.hasOwnProperty.call(map, digits)) {
        replaced++;
        return map[digits];
      }
      return digits;
    });
    return { text: out, replaced: replaced };
  };

  // The references a copy makes to the source project (<Source>.<object>, as QNames and requestable names are written),
  // pointed at the target project when retarget is true: {text, count}.
  api.retargetProject = function (text, sourceProject, targetProject, retarget) {
    var escaped = String(sourceProject).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    var pattern = new RegExp("(^|[^A-Za-z0-9_.$])" + escaped + "\\.(?=[A-Za-z_$])", "g");
    var count = 0;
    var out = String(text).replace(pattern, function (match, before) {
      count++;
      return retarget ? before + targetProject + "." : match;
    });
    return { text: out, count: count };
  };

  // Priorities the copy still names that belong to objects outside it (in the same requestable or page): {priority: name}.
  api.outsideReferences = function (text, outside) {
    var found = {};
    String(text).replace(/\d+/g, function (digits) {
      if (digits.length >= api.PRIORITY_DIGITS && Object.prototype.hasOwnProperty.call(outside, digits)) {
        found[digits] = outside[digits];
      }
      return digits;
    });
    return found;
  };
})(C8O.dboCopy);

// The engine side: run only inside Convertigo (the tests load the helpers above alone).
C8O.dboCopy.run = function (args) {
  var api = C8O.dboCopy;
  var DatabaseObject = Packages.com.twinsoft.convertigo.beans.core.DatabaseObject;
  var IContainerOrdered = Packages.com.twinsoft.convertigo.beans.core.IContainerOrdered;
  var XMLUtils = Packages.com.twinsoft.convertigo.engine.util.XMLUtils;
  var errors = [];
  var warnings = [];

  function str(value) {
    return value === null || value === undefined ? "" : String(value).trim();
  }
  function name(dbo) {
    return String(dbo.getName());
  }
  function qnameOf(dbo) {
    return C8O.dbo.safeFullQName(dbo) || C8O.dbo.safeQName(dbo);
  }
  function folderOf(dbo) {
    try {
      return String(dbo.getFolderType());
    } catch (_noFolder) {
      return "";
    }
  }
  function childrenOf(dbo) {
    var out = [];
    var list = dbo.getDatabaseObjectChildren();
    for (var i = 0; list && i < list.size(); i++) {
      var child = list.get(i);
      if (child && child.getParent() && child.getParent().equals(dbo)) {
        out.push(child);
      }
    }
    return out;
  }
  function walk(dbo, visit) {
    visit(dbo);
    childrenOf(dbo).forEach(function (child) {
      walk(child, visit);
    });
  }

  var sourceQName = str(args.source);
  var targetQName = str(args.target);
  var at = str(args.at).toLowerCase() || "inside";
  if (at !== "inside" && at !== "before" && at !== "after") {
    throw new Error("at is inside (default), before or after; got " + at + ".");
  }
  if (!sourceQName.length || !targetQName.length) {
    throw new Error("source (the object to copy) and target (where to put the copy) are required.");
  }
  var source = C8O.dbo.resolve(sourceQName, { messagePrefix: "source" });
  var anchor = C8O.dbo.resolve(targetQName, { messagePrefix: "target" });
  if (source.getParent() == null) {
    throw new Error(sourceQName + " is a project: copy its objects one by one, or import the project with marketplace-import.");
  }
  var parent = at === "inside" ? anchor : anchor.getParent();
  if (parent == null) {
    throw new Error(targetQName + " has no parent: use at:\"inside\".");
  }
  // the copy may not go inside what it copies
  for (var up = parent; up != null; up = up.getParent()) {
    if (up.equals(source)) {
      throw new Error("The copy of " + sourceQName + " cannot go inside " + sourceQName + " itself.");
    }
  }
  if (typeof _c8oPendingIonicEdits === "function") {
    _c8oPendingIonicEdits(parent, "This copy");
  }
  var newName = str(args.name) || name(source);
  childrenOf(parent).forEach(function (sibling) {
    if (name(sibling) === newName && folderOf(sibling) === folderOf(source)) {
      throw new Error(qnameOf(parent) + " already has " + newName + ": give the copy another name (name), or change the existing " +
        newName + " with databaseobject-tree-apply.");
    }
  });

  var sourceProject = String(source.getProject().getName());
  var targetProject = String(parent.getProject().getName());

  // The objects copied and their new priorities.
  var copied = [];
  walk(source, function (dbo) {
    copied.push(dbo);
  });
  var map = {};
  var inside = {};
  copied.forEach(function (dbo) {
    var old = String(java.lang.Long.toString(dbo.priority));
    inside[old] = true;
    if (old.length >= api.PRIORITY_DIGITS && !map[old]) {
      map[old] = String(java.lang.Long.toString(dbo.getNewOrderValue()));
    }
  });
  // The objects around the copy in its requestable or page, whose priorities the copy's sources may name.
  var scopeFrom = function (start) {
    var scope = null;
    for (var s = start; s != null && s.getParent() != null; s = s.getParent()) {
      scope = s;
      if (/\.(sequences|transactions)\.|PageComponent$|ApplicationComponent$|SharedComponent$/.test(String(s.getClass().getName()))) {
        break;
      }
    }
    return scope;
  };
  var scope = scopeFrom(source.getParent());
  var sameScope = scope != null && scopeFrom(parent) != null && scope.equals(scopeFrom(parent));
  var outside = {};
  if (scope != null) {
    walk(scope, function (dbo) {
      var p = String(java.lang.Long.toString(dbo.priority));
      if (!inside[p] && p.length >= api.PRIORITY_DIGITS) {
        outside[p] = qnameOf(dbo);
      }
    });
  }

  // Serialize, renew, read back.
  var document = XMLUtils.getDefaultDocumentBuilder().newDocument();
  var rootElement = document.createElement("convertigo");
  try {
    rootElement.setAttribute("beans", String(Packages.com.twinsoft.convertigo.beans.Version.version));
  } catch (_noVersion) {}
  document.appendChild(rootElement);
  var serialize = function (dbo, parentElement) {
    var element = dbo.toXml(document);
    parentElement.appendChild(element);
    childrenOf(dbo).forEach(function (child) {
      serialize(child, element);
    });
  };
  serialize(source, rootElement);
  var text = String(XMLUtils.prettyPrintDOM(document));
  var renewed = api.renewPriorities(text, map);
  text = renewed.text;
  var projectRefs = { text: text, count: 0 };
  if (sourceProject !== targetProject) {
    projectRefs = api.retargetProject(text, sourceProject, targetProject, args.retargetProject === true || String(args.retargetProject) === "true");
    text = projectRefs.text;
  }
  var stillOutside = api.outsideReferences(text, outside);

  var parsed = XMLUtils.getDefaultDocumentBuilder().parse(new Packages.org.xml.sax.InputSource(new java.io.StringReader(text)));
  var firstElement = null;
  var nodes = parsed.getDocumentElement().getChildNodes();
  for (var n = 0; n < nodes.getLength() && firstElement == null; n++) {
    if (nodes.item(n).getNodeType() === Packages.org.w3c.dom.Node.ELEMENT_NODE) {
      firstElement = nodes.item(n);
    }
  }
  // One root page (or menu) per application, and the engine gives the root to any page added as root: the copy of the root
  // page would take it from its source. The copy is never the root.
  if (firstElement != null && String(firstElement.getAttribute("isRoot")) === "true") {
    firstElement.setAttribute("isRoot", "false");
    warnings.push("The copy is not the root of the application: " + name(source) + " stays the root.");
  }
  var afterValue = null;
  if (at !== "inside" && folderOf(anchor) !== folderOf(source)) {
    // A step next to a variable, for example: they are ordered apart, so the copy goes last among its own kind.
    warnings.push(name(anchor) + " is not of the kind of the copy: the copy is the last of its kind in " + qnameOf(parent) +
      ", not " + at + " " + name(anchor) + ". Move it with databaseobject-move next to an object of its kind.");
  } else if (at === "after") {
    afterValue = java.lang.Long.valueOf(anchor.priority);
  } else if (at === "before") {
    var previous = anchor.getPreviousSiblingInFolder ? anchor.getPreviousSiblingInFolder() : null;
    afterValue = java.lang.Long.valueOf(previous != null ? previous.priority : 0);
  }
  var created = 0;
  var pastedRoot = null;
  var paste = function (node, into, isRoot) {
    var dbo = DatabaseObject.read(node);
    if (isRoot) {
      dbo.setName(newName);
    }
    dbo.bNew = true;
    dbo.hasChanged = true;
    if (isRoot && afterValue != null && into instanceof IContainerOrdered) {
      into.add(dbo, afterValue);
    } else {
      into.add(dbo);
    }
    if (isRoot) {
      pastedRoot = dbo;
    }
    created++;
    var childNodes = node.getChildNodes();
    for (var c = 0; c < childNodes.getLength(); c++) {
      var childNode = childNodes.item(c);
      if (childNode.getNodeType() === Packages.org.w3c.dom.Node.ELEMENT_NODE && api.NOT_CHILDREN[String(childNode.getNodeName()).toLowerCase()] !== true) {
        paste(childNode, dbo, false);
      }
    }
    dbo.isImporting = false;
    dbo.isSubLoaded = true;
    return dbo;
  };

  var copy = null;
  try {
    copy = C8O.dbo.withStudioLock(function () {
      return paste(firstElement, parent, true);
    }, "a copy of " + sourceQName);
  } catch (pasteError) {
    // all or nothing: what was pasted before the error is removed
    // the object pasted, whatever name the engine gave it
    try {
      if (pastedRoot != null && pastedRoot.getParent() != null) {
        parent.remove(pastedRoot);
      }
    } catch (_ignoreCleanup) {}
    throw new Error("The copy of " + sourceQName + " under " + qnameOf(parent) + " failed, nothing was kept: " +
      String(pasteError && pasteError.message ? pasteError.message : pasteError).replace(/^.*EngineException: /, ""));
  }
  // An NGX element read before it has a parent loads its Ionic definition from the default component manager, not the
  // one of the project's template: its attributes then lose their names (a live copy generated <ion-icon {{...}}> for
  // <ion-icon name="{{...}}"> and failed to compile). Once the copy is in place, each one is loaded again from the
  // project's own manager, as a project load does.
  try {
    var NgxComponentManager = Packages.com.twinsoft.convertigo.beans.ngx.components.dynamic.ComponentManager;
    walk(copy, function (dbo) {
      if (/\.beans\.ngx\./.test(String(dbo.getClass().getName())) && typeof dbo.loadBean === "function" && typeof dbo.getBeanData === "function") {
        dbo.loadBean(NgxComponentManager.of(dbo));
      }
    });
  } catch (beanError) {
    warnings.push("The NGX elements of the copy could not be loaded again (" + String(beanError) + "): reload the project before building it.");
  }
  if (at !== "inside" && !(parent instanceof IContainerOrdered)) {
    warnings.push(qnameOf(parent) + " does not order its children: the copy is listed among them, not exactly " + at + " " + name(anchor) + ".");
  }
  try {
    Packages.com.twinsoft.convertigo.engine.admin.services.studio.ngxbuilder.BuilderUtils.dboAdded(copy);
  } catch (_ignoreBuilderNotify) {}
  parent.hasChanged = true;
  copy.hasChanged = true;
  var project = copy.getProject();
  project.hasChanged = true;

  // What the copy still shares with its source.
  var outsideNames = Object.keys(stillOutside).map(function (p) {
    return stillOutside[p];
  });
  if (outsideNames.length) {
    warnings.push("The copy reads " + outsideNames.length + " object(s) outside it, as its source did: " + outsideNames.slice(0, 8).join(", ") +
      (outsideNames.length > 8 ? " (+" + (outsideNames.length - 8) + ")" : "") + (sameScope
        ? "." : ". They are not where the copy is: point those sources at objects of its new place with databaseobject-tree-apply."));
  }
  if (sourceProject !== targetProject && projectRefs.count > 0) {
    warnings.push(args.retargetProject === true || String(args.retargetProject) === "true"
      ? projectRefs.count + " reference(s) to " + sourceProject + " now name " + targetProject + ": check that " + targetProject + " has those objects."
      : "The copy still names " + projectRefs.count + " object(s) of " + sourceProject + " (calls, sequences, styles). Keep them only if " +
        targetProject + " references " + sourceProject + "; else copy again with retargetProject:true, or change them with databaseobject-tree-apply.");
  }
  // The engine gives a page it adds a default route and title (path-to-<name>, Title for <name>): the copy needs its own.
  try {
    if (typeof copy.getSegment === "function" && typeof copy.getTitle === "function") {
      warnings.push("The copied page has the default route segment \"" + String(copy.getSegment()) + "\" and title \"" + String(copy.getTitle()) +
        "\": set its own (properties segment and title with databaseobject-tree-apply).");
    }
  } catch (_ignoreSegment) {}

  var autoSave = C8O.util.parseAutoSaveFlag(args.autoSave, true);
  var save = C8O.dbo.saveProjectIfNeeded(project, autoSave, errors);
  try {
    C8O.dbo.refreshStudioTreeByQName(qnameOf(parent), errors);
  } catch (_ignoreRefresh) {}

  return {
    status: errors.length ? "partial" : "ok",
    source: qnameOf(source),
    qname: qnameOf(copy),
    parentQName: qnameOf(parent),
    name: name(copy),
    className: C8O.util.fromFqcn ? String(C8O.util.fromFqcn(copy.getClass().getName())) : String(copy.getClass().getName()),
    at: at,
    objects: created,
    prioritiesRenewed: Object.keys(map).length,
    referencesRenewed: renewed.replaced,
    sourceProjectReferences: sourceProject !== targetProject ? projectRefs.count : 0,
    retargeted: sourceProject !== targetProject && (args.retargetProject === true || String(args.retargetProject) === "true"),
    saved: save && save.saved === true,
    saveMessage: save && save.message ? String(save.message) : "",
    warnings: warnings,
    errors: errors.map(function (e) {
      return e && e.message ? String(e.message) : String(e);
    }),
    next: "Adapt the copy where it differs from its source with databaseobject-tree-apply on " + qnameOf(copy) +
      " (texts, bindings, the sequence it calls), then check it; databaseobject-tree-get only for the parts you change."
  };
};
