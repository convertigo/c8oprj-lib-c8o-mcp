// Shared helpers for schema extraction (MCP + internal_json_schema).
if (typeof C8O === "undefined") {
  throw new Error("C8O namespace is required");
}
if (!C8O.schemaCommon) {
  C8O.schemaCommon = {};
}

C8O.schemaCommon.trimPayloadNode = function(dom) {
  if (!dom) return null;
  var node = dom.getDocumentElement ? dom.getDocumentElement() : dom;
  var targets = null;
  try {
    targets = node.getElementsByTagName("response");
    if (targets && targets.getLength && targets.getLength() > 0) {
      node = targets.item(0);
    }
    targets = node.getElementsByTagName("result");
    if (targets && targets.getLength && targets.getLength() > 0) {
      node = targets.item(0);
    } else {
      targets = node.getElementsByTagName("Result");
      if (targets && targets.getLength && targets.getLength() > 0) {
        node = targets.item(0);
      }
    }
  } catch (_ignore) {}
  return node;
};

C8O.schemaCommon.domToJsonSample = function(dom) {
  try {
    if (!dom) return null;
    var node = dom.getDocumentElement ? dom.getDocumentElement() : dom;
    var xmlUtils = com.twinsoft.convertigo.engine.util.XMLUtils;
    var jsonString = xmlUtils.XmlToJson(node, true, true);
    return JSON.parse(String(jsonString));
  } catch (_err) {
    return null;
  }
};

C8O.schemaCommon.jsonSampleToSchema = function(sample) {
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
};
