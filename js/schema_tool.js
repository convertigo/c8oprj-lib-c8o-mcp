// Helper to extract schemas/samples for a database object.
// Relies on Convertigo schemaManager; keeps output small for MCP.

if (typeof C8O === "undefined") {
  throw new Error("C8O namespace is required");
}

function fromFqcn(name) {
  if (!name) return "";
  return String(name).replace(/^com\.twinsoft\.convertigo\.beans\./, "");
}

function pickRootElement(node, schemaObject) {
  if (!node) return null;
  try {
    if (node.getNodeType && node.getNodeType() === 9 && node.getDocumentElement) {
      node = node.getDocumentElement();
    }
  } catch (_ignoreDoc) {}
  try {
    var desiredName = null;
    if (schemaObject && schemaObject.getName) { desiredName = schemaObject.getName(); }
    if (!desiredName && node.getLocalName) { desiredName = String(node.getLocalName()); }
    if (desiredName && node.getOwnerDocument && node.getOwnerDocument().getElementsByTagName) {
      var hits = node.getOwnerDocument().getElementsByTagName(desiredName);
      if (hits && hits.getLength && hits.getLength() > 0) { node = hits.item(0); }
    }
  } catch (_ignoreMatch) {}
  try {
    var name = "";
    if (node.getLocalName) { name = String(node.getLocalName()); }
    else if (node.getNodeName) { name = String(node.getNodeName()); }
    if (name && name.toLowerCase().indexOf("document") >= 0 && node.getChildNodes) {
      var nodes = node.getChildNodes();
      for (var i = 0; i < nodes.getLength(); i++) {
        var child = nodes.item(i);
        if (child && child.getNodeType && child.getNodeType() === 1) { node = child; break; }
      }
    }
  } catch (_ignoreDocChild) {}
  return node;
}

C8O.schemaTool = {
  createEnvelope: function (node) {
    try {
      var XMLUtils = com.twinsoft.convertigo.engine.util.XMLUtils;
      var dom = XMLUtils.getDefaultDocumentBuilder().newDocument();
      var doc = dom.createElement("document");
      dom.appendChild(doc);
      var attrs = ["connector","context","contextId","fromStub","fromcache","generated","project","screenclass","sequence","signature","transaction","userReference","version"];
      for (var i = 0; i < attrs.length; i++) { doc.setAttribute(attrs[i], ""); }
      if (node) {
        var imported = dom.importNode ? dom.importNode(node, true) : node.cloneNode(true);
        doc.appendChild(imported);
      }
      return dom;
    } catch (_err) {
      return node;
    }
  },

  describe: function (opts) {
    var t = (opts && opts.type) ? String(opts.type).toLowerCase() : "xml";
    var internal = !!(opts && opts.internal);
    if (["xml","json","jsonschema"].indexOf(t) === -1) { throw new Error("type must be one of: xml, json, jsonschema"); }
    var qname = opts && opts.qname ? String(opts.qname) : "";
    if (!qname) throw new Error("qname is required");

    var dbo = C8O.dbo.resolve(qname);
    var project = dbo.getProject();

    var Engine = com.twinsoft.convertigo.engine.Engine;
    var SchemaMeta = com.twinsoft.convertigo.engine.enums.SchemaMeta;
    var SchemaManagerOption = com.twinsoft.convertigo.engine.SchemaManager.Option;
    var XmlSchemaUtils = com.twinsoft.convertigo.engine.util.XmlSchemaUtils;
    var RequestableObjectClass = java.lang.Class.forName("com.twinsoft.convertigo.beans.core.RequestableObject");
    var QName = javax.xml.namespace.QName;
    var XmlSchemaElement = Packages.org.apache.ws.commons.schema.XmlSchemaElement;
    var XmlSchemaParticle = Packages.org.apache.ws.commons.schema.XmlSchemaParticle;

    var xmlSchema = Engine.theApp.schemaManager.getSchemaForProject(project.getName(), SchemaManagerOption.fullSchema);
    if (xmlSchema == null) {
      return { dbo: { qname: dbo.getQName(), className: fromFqcn(dbo.getClass().getName()) }, type: t, message: "No schema available for project" };
    }

    var schemaObject = SchemaMeta.getXmlSchemaObject(xmlSchema, dbo);
    var collection = SchemaMeta.getCollection(xmlSchema);

    var element = null;
    if (RequestableObjectClass.isInstance(dbo)) {
      var ns = xmlSchema.getTargetNamespace();
      var requestName = dbo.getName();
      var responseName = dbo.getXsdTypePrefix() + dbo.getName() + "Response";
      var targetName = internal ? requestName : responseName;
      element = collection != null ? collection.getElementByQName(new QName(ns, targetName)) : null;
      if (element == null && !internal && collection != null) { element = collection.getElementByQName(new QName(ns, requestName)); }
    }
    if (element == null && schemaObject instanceof XmlSchemaElement) { element = schemaObject; }
    if (element == null && schemaObject instanceof XmlSchemaParticle) { try { element = SchemaMeta.getContainerXmlSchemaElement(schemaObject); } catch (_ignore) {} }
    if (element == null) { try { var qn = SchemaMeta.getQName(schemaObject); if (qn && collection) { element = collection.getElementByQName(qn); } } catch (_ignoreQ) {} }

    var prio = 0;
    try { prio = dbo.getPriority ? dbo.getPriority() : 0; } catch (_ignorePrio) {}
    try {
      var beanInfo = java.beans.Introspector.getBeanInfo(dbo.getClass());
      var pds = beanInfo.getPropertyDescriptors();
      for (var i = 0; i < pds.length; i++) {
        var pd = pds[i];
        if (!pd || pd.getName() !== "priority") { continue; }
        var getter = pd.getReadMethod();
        if (getter) { try { prio = getter.invoke(dbo, null); } catch (_ignoreGetter) {} }
        break;
      }
    } catch (_ignoreIntrospect) {}
    try { if (typeof dbo.priority !== "undefined") { prio = dbo.priority; } } catch (_ignorePriorityField) {}
    try {
      var dboFromManager = Engine.theApp.databaseObjectsManager.getDatabaseObjectByQName(dbo.getQName());
      if (dboFromManager && dboFromManager.getPriority) {
        var managerPrio = dboFromManager.getPriority();
        if (managerPrio != null) { prio = managerPrio; }
      }
    } catch (_ignoreDboManager) {}
    var dboInfo = { qname: dbo.getQName(), className: fromFqcn(dbo.getClass().getName()) };
    try {
      if (typeof prio === "number" && isFinite(prio) && prio !== 0) {
        dboInfo.priority = String(prio);
      }
    } catch (_ignorePrioStrFinal) {}
    var response = { dbo: dboInfo, type: t };

    if (element == null) { response.response = null; response.message = "No schema element for this object (run requestable-execute with recordSchema=true to learn it)"; return response; }

    var domSample = XmlSchemaUtils.getDomInstance(element);
    var targetNode = pickRootElement(C8O.schemaCommon.trimPayloadNode(domSample), element);
    try {
      if (!internal && RequestableObjectClass.isInstance(dbo)) {
        var objs = targetNode && targetNode.getElementsByTagName ? targetNode.getElementsByTagName("object") : null;
        if (objs && objs.getLength && objs.getLength() > 0) { targetNode = objs.item(0); }
      }
    } catch (_ignoreObject) {}

    if (t === "xml") {
      var XMLUtils = com.twinsoft.convertigo.engine.util.XMLUtils;
      var dom = XMLUtils.getDefaultDocumentBuilder().newDocument();
      var root = dom.importNode ? dom.importNode(targetNode, true) : targetNode.cloneNode(true);
      dom.appendChild(root);
      response.response = XMLUtils.prettyPrintDOM(dom);
      return response;
    }

    var enveloped = C8O.schemaTool.createEnvelope(targetNode);
    var jsonSample = C8O.schemaCommon.domToJsonSample(enveloped);
    var payload = (jsonSample && jsonSample.document) ? jsonSample.document : jsonSample;
    if (jsonSample && jsonSample.attr) { try { delete jsonSample.attr; } catch (_ignoreAttr1) {} }
    if (payload && payload.document) { payload = payload.document; }
    if (payload && payload.attr) { try { delete payload.attr; } catch (_ignoreAttr2) {} }
    if (!payload) { payload = {}; }

    // Detect missing learned schema (no generated XSD on disk) for transactions only.
    var hasLearnedSchema = true;
    try {
      var clsName = dbo.getClass().getName();
      var projDir = dbo.getProject ? dbo.getProject().getDirPath() : null;
      if (projDir && clsName && clsName.indexOf("Transaction") >= 0) {
        var connName = dbo.getConnector ? dbo.getConnector().getName() : null;
        var baseDirFile = connName ? new java.io.File(projDir, "xsd/internal/" + connName) : new java.io.File(projDir, "xsd/internal");
        var fileTx = new java.io.File(baseDirFile, dbo.getName() + ".xsd");
        hasLearnedSchema = fileTx.exists();
      }
    } catch (_ignoreLearned) {}

    if (RequestableObjectClass.isInstance(dbo) && !hasLearnedSchema) {
      response.message = response.message || "Schema not learned yet: run requestable-execute with recordSchema=true to capture the actual response.";
    }

    // Normalize message to avoid Rhino Undefined leaking into JSON field.
    if (typeof response.message === "undefined" || response.message === null) {
      response.message = "";
    }

    if (t === "json") {
      var hintMessage = response.message || null;
      if (hintMessage) {
        try {
          if (typeof payload === "string") {
            var parsedPayload = JSON.parse(payload);
            if (parsedPayload && typeof parsedPayload === "object") {
              parsedPayload.__hint = parsedPayload.__hint || hintMessage;
              payload = JSON.stringify(parsedPayload);
            }
          } else if (payload && typeof payload === "object") {
            payload.__hint = payload.__hint || hintMessage;
          }
        } catch (_ignoreHintAttach) {}
      }
      response.response = payload;
      response.schema = null;
      return response;
    }

    response.response = C8O.schemaCommon.jsonSampleToSchema(payload);
    response.sample = payload;
    return response;
  }
};






