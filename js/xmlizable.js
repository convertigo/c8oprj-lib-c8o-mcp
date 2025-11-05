/*
 * Helpers around Convertigo XMLizable objects. This module handles the
 * conversion to/from JSON payloads so tools can exchange structured data with
 * the engine without knowing the underlying Java classes.
 */

if (typeof C8O === "undefined") {
  var C8O = {};
}

C8O.xml = C8O.xml || {};

/**
 * Returns a fresh DOM document suitable for XMLizable read/write helpers.
 */
C8O.xml.createDomDocument = function () {
  var XMLUtils = Packages.com.twinsoft.convertigo.engine.util.XMLUtils;
  return XMLUtils.getDefaultDocumentBuilder().newDocument();
};

/**
 * Serializes any XMLizable (or primitive) Java value into a JSON-friendly
 * structure that can be sent over the MCP bridge.
 */
C8O.xml.serialize = function (value) {
  if (value === null || value === undefined) {
    return null;
  }

  var XMLUtils = Packages.com.twinsoft.convertigo.engine.util.XMLUtils;
  var doc = C8O.xml.createDomDocument();
  var node = XMLUtils.writeObjectToXml(doc, value);
  doc.appendChild(node);

  var rootName = node.getNodeName();
  var jsonString = XMLUtils.XmlToJson(node, true, true);
  var parsed = JSON.parse(jsonString);
  var payload = parsed && parsed[rootName] !== undefined ? parsed[rootName] : parsed;

  return {
    root: rootName,
    data: payload
  };
};

/**
 * Deserializes a JSON structure previously produced by {@link serialize} back
 * into the corresponding Java object (SmartType, XMLVector, primitive, ...).
 */
C8O.xml.deserialize = function (spec) {
  if (!spec) {
    return null;
  }

  var root = spec.root;
  var data = spec.data;

  if (!root) {
    if (data && typeof data === "object") {
      for (var key in data) {
        if (Object.prototype.hasOwnProperty.call(data, key)) {
          root = key;
          data = data[key];
          break;
        }
      }
    }
    if (!root) {
      throw new Error("Missing root information for XMLizable payload");
    }
  }

  var XMLUtils = Packages.com.twinsoft.convertigo.engine.util.XMLUtils;
  var JSONObject = Packages.org.codehaus.jettison.json.JSONObject;

  var wrapper = {};
  wrapper[root] = data !== undefined ? data : {};
  var jsonString = JSON.stringify(wrapper);
  var jsonObject = new JSONObject(jsonString);

  var doc = C8O.xml.createDomDocument();
  var rootElement = doc.createElement(root);
  doc.appendChild(rootElement);

  XMLUtils.jsonToXml(jsonObject.get(root), null, rootElement, true, true, "item");

  return XMLUtils.readObjectFromXml(rootElement);
};

