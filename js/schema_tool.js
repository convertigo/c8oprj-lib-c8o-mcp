// Helper to extract schemas/samples for a database object.
// Relies on Convertigo schemaManager; keeps output small for MCP.

if (typeof C8O === "undefined") {
  throw new Error("C8O namespace is required");
}

function fromFqcn(name) {
  if (!name) return "";
  return String(name).replace(/^com\.twinsoft\.convertigo\.beans\./, "");
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

    var collection = SchemaMeta.getCollection(schemaObject);
    if (collection == null) {
      return {
        dbo: { qname: dbo.getQName(), className: fromFqcn(dbo.getClass().getName()) },
        type: t,
        message: "Schema collection missing"
      };
    }

    var element = null;
    if (RequestableObjectClass.isInstance(dbo)) {
      var ns = xmlSchema.getTargetNamespace();
      var requestName = dbo.getName();
      var responseName = dbo.getXsdTypePrefix() + dbo.getName() + "Response";
      var targetName = internal ? requestName : responseName;
      element = collection.getElementByQName(new QName(ns, targetName));
      if (element == null && !internal) {
        element = collection.getElementByQName(new QName(ns, requestName));
      }
    }
    if (element == null) {
      try {
        element = internal && typeof schemaObject.getInternalElement === "function" ? schemaObject.getInternalElement() : null;
      } catch (_ignore) {}
    }
    if (element == null && schemaObject.getElement) {
      element = schemaObject.getElement();
    }
    if (element == null) {
      return {
        dbo: { qname: dbo.getQName(), className: fromFqcn(dbo.getClass().getName()) },
        type: t,
        message: "No schema element for this object"
      };
    }

    var response = {
      dbo: { qname: dbo.getQName(), className: fromFqcn(dbo.getClass().getName()) },
      type: t
    };
    var domSample = XmlSchemaUtils.getDomInstance(element);
    var targetNode = C8O.schemaCommon.trimPayloadNode(domSample);
    var enveloped = C8O.schemaTool.createEnvelope(targetNode);
    if (t === "xml") {
      response.sample = enveloped ? com.twinsoft.convertigo.engine.util.XMLUtils.prettyPrintDOM(enveloped) : null;
      return response;
    }

    var jsonSample = C8O.schemaCommon.domToJsonSample(enveloped);
    if (t === "json") {\n      response.sample = (jsonSample && jsonSample.document) ? jsonSample.document : jsonSample;\n      return response;\n    }\n\n    var schemaInput = (jsonSample && jsonSample.document) ? jsonSample.document : jsonSample;\n    response.schema = C8O.schemaCommon.jsonSampleToSchema(schemaInput);
    return response;
  }
};

