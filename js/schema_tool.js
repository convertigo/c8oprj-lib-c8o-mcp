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
  // Document -> documentElement
  try {
    if (node.getNodeType && node.getNodeType() === 9 && node.getDocumentElement) {
      node = node.getDocumentElement();
    }
  } catch (_ignoreDoc) {}

  // If element name matches schemaObject name, use it
  try {
    var desiredName = null;
    if (schemaObject && schemaObject.getName) {
      desiredName = schemaObject.getName();
    }
    if (!desiredName && node.getLocalName) {
      desiredName = String(node.getLocalName());
    }
    if (desiredName && node.getOwnerDocument && node.getOwnerDocument().getElementsByTagName) {
      var hits = node.getOwnerDocument().getElementsByTagName(desiredName);
      if (hits && hits.getLength && hits.getLength() > 0) {
        node = hits.item(0);
      }
    }
  } catch (_ignoreMatch) {}

  // If current node is <document>, pick first element child
  try {
    var name = "";
    if (node.getLocalName) { name = String(node.getLocalName()); }
    else if (node.getNodeName) { name = String(node.getNodeName()); }
    if (name && name.toLowerCase().indexOf("document") >= 0 && node.getChildNodes) {
      var nodes = node.getChildNodes();
      for (var i = 0; i < nodes.getLength(); i++) {
        var child = nodes.item(i);
        if (child && child.getNodeType && child.getNodeType() === 1) { // ELEMENT_NODE
          node = child;
          break;
        }
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
      var attrs = ["connector", "context", "contextId", "fromStub", "fromcache", "generated", "project", "screenclass", "sequence", "signature", "transaction", "userReference", "version"];
      for (var i = 0; i < attrs.length; i++) {
        doc.setAttribute(attrs[i], "");
      }
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
    if (["xml", "json", "jsonschema"].indexOf(t) === -1) {
      throw new Error("type must be one of: xml, json, jsonschema");
    }
    var qname = opts && opts.qname ? String(opts.qname) : "";
    if (!qname) throw new Error("qname is required");

    var dbo = C8O.dbo.resolve(qname);
    var project = dbo.getProject();

    var Engine = com.twinsoft.convertigo.engine.Engine;
    var SchemaMeta = com.twinsoft.convertigo.engine.enums.SchemaMeta;
    var XmlSchemaUtils = com.twinsoft.convertigo.engine.util.XmlSchemaUtils;
    var RequestableObjectClass = java.lang.Class.forName("com.twinsoft.convertigo.beans.core.RequestableObject");
    var QName = javax.xml.namespace.QName;
    var XmlSchemaElement = Packages.org.apache.ws.commons.schema.XmlSchemaElement;
    var XmlSchemaParticle = Packages.org.apache.ws.commons.schema.XmlSchemaParticle;

    var xmlSchema = Engine.theApp.schemaManager.getSchemaForProject(project.getName());
    if (xmlSchema == null) {
      return {
        dbo: { qname: dbo.getQName(), className: fromFqcn(dbo.getClass().getName()) },
        type: t,
        message: "No schema available for project"
      };
    }

    var schemaObject = SchemaMeta.getXmlSchemaObject(xmlSchema, dbo);
    if (schemaObject == null) {
      return {
        dbo: { qname: dbo.getQName(), className: fromFqcn(dbo.getClass().getName()) },
        type: t,
        message: "No schema for this object (likely not requestable)"
      };
    }

    var collection = SchemaMeta.getCollection(xmlSchema);

    var element = null;
    if (RequestableObjectClass.isInstance(dbo)) {
      var ns = xmlSchema.getTargetNamespace();
      var requestName = dbo.getName();
      var responseName = dbo.getXsdTypePrefix() + dbo.getName() + "Response";
      var targetName = internal ? requestName : responseName;
      element = collection != null ? collection.getElementByQName(new QName(ns, targetName)) : null;
      if (element == null && !internal && collection != null) {
        element = collection.getElementByQName(new QName(ns, requestName));
      }
    }
    if (element == null && schemaObject instanceof XmlSchemaElement) {
      element = schemaObject;
    }
    if (element == null && schemaObject instanceof XmlSchemaParticle) {
      try { element = SchemaMeta.getContainerXmlSchemaElement(schemaObject); } catch (_ignore) {}
    }
    if (element == null) {
      try {
        var qn = SchemaMeta.getQName(schemaObject);
        if (qn && collection) {
          element = collection.getElementByQName(qn);
        }
      } catch (_ignoreQ) {}
    }
    if (element == null) {
      return {
        dbo: { qname: dbo.getQName(), className: fromFqcn(dbo.getClass().getName()) },
        type: t,
        message: "No schema element for this object"
      };
    }

    var prio = 0;
    try { prio = dbo.getPriority ? dbo.getPriority() : 0; } catch (_ignorePrio) {}
    var dboInfo = { qname: dbo.getQName(), className: fromFqcn(dbo.getClass().getName()) };
    if (prio && prio != 0) { dboInfo.priority = String(prio); }

    var response = {
      dbo: dboInfo,
      type: t
    };
    var domSample = XmlSchemaUtils.getDomInstance(element);
    var targetNode = pickRootElement(C8O.schemaCommon.trimPayloadNode(domSample), element);

    if (t === "xml") {
      if (!targetNode) {
        response.sample = null;
        return response;
      }
      try {
        var XMLUtils = com.twinsoft.convertigo.engine.util.XMLUtils;
        var dom = XMLUtils.getDefaultDocumentBuilder().newDocument();
        var root = dom.importNode ? dom.importNode(targetNode, true) : targetNode.cloneNode(true);
        dom.appendChild(root);
        response.sample = XMLUtils.prettyPrintDOM(dom);
      } catch (_ignoreXml) {
        response.sample = com.twinsoft.convertigo.engine.util.XMLUtils.prettyPrintDOM(targetNode);
      }
      return response;
    }

    var enveloped = C8O.schemaTool.createEnvelope(targetNode);
    var jsonSample = C8O.schemaCommon.domToJsonSample(enveloped);
    var payload = (jsonSample && jsonSample.document) ? jsonSample.document : jsonSample;
    if (jsonSample && jsonSample.attr) { try { delete jsonSample.attr; } catch (_ignoreAttr1) {} }
    if (payload && payload.document) { payload = payload.document; }
    if (payload && payload.attr) { try { delete payload.attr; } catch (_ignoreAttr2) {} }
    if (t === "json") {
      response.sample = payload;
      return response;
    }

    response.schema = C8O.schemaCommon.jsonSampleToSchema(payload);
    return response;
  }
};
