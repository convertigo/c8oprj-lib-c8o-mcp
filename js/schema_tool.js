// Helper to extract schemas/samples for a database object.
// Relies on Convertigo schemaManager; keeps output small for MCP.

if (typeof C8O === "undefined") {
  throw new Error("C8O namespace is required");
}

function fromFqcn(name) {
  if (!name) return "";
  return String(name).replace(/^com\.twinsoft\.convertigo\.beans\./, "");
}

function serializeXmlSchema(xmlSchema) {
  try {
    var baos = new java.io.ByteArrayOutputStream();
    xmlSchema.write(baos);
    return String(baos.toString("UTF-8"));
  } catch (_err) {
    return null;
  }
}

function domToJsonSample(dom) {
  try {
    if (!dom) return null;
    var node = dom.getDocumentElement ? dom.getDocumentElement() : dom;
    var xmlUtils = com.twinsoft.convertigo.engine.util.XMLUtils;
    var jsonString = xmlUtils.XmlToJson(node, true, true);
    return JSON.parse(String(jsonString));
  } catch (_err) {
    return null;
  }
}
function jsonSampleToSchema(sample) {
  if (sample === null || typeof sample === "undefined") {
    return null;
  }
  try {
    function build(node) {
      if (node === null) return { type: "null" };
      var t = Object.prototype.toString.call(node);
      if (t === "[object String]") return { type: "string" };
      if (t === "[object Number]") return { type: "number" };
      if (t === "[object Boolean]") return { type: "boolean" };
      if (Array.isArray(node)) {
        var first = node.length ? build(node[0]) : {};
        return { type: "array", items: first };
      }
      var props = {};
      Object.keys(node).forEach(function (k) {
        props[k] = build(node[k]);
      });
      return { type: "object", properties: props };
    }
    return build(sample);
  } catch (_err) {
    return null;
  }
}

C8O.schemaTool = {
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
    if (t === "xml") {
      response.sample = domSample ? com.twinsoft.convertigo.engine.util.XMLUtils.prettyPrintDOM(domSample) : null;
      return response;
    }

    var jsonSample = domToJsonSample(domSample);
    if (t === "json") {
      response.sample = jsonSample;
      return response;
    }

    response.schema = jsonSampleToSchema(jsonSample);
    return response;
  }
};





