/*
 * Tools removed from the MCP. tools/list leaves them out, and a call by their name (MCP router, batch-call) answers what
 * replaces them instead of "Unknown tool". The value is the tool that replaces it. upsert-ngx-crud-kit generated a whole
 * CRUD front of shared components; pages are built one by one with ngx-page-create, and upsert-crud builds the backend.
 */
if (typeof C8O === "undefined") {
  var C8O = {};
}
C8O.retiredTools = {
  tools_upsert_ngx_crud_kit: "ngx-page-create"
};
C8O.retiredToolMessages = {
  tools_upsert_ngx_crud_kit: "upsert-ngx-crud-kit was removed: build the pages with ngx-page-create (one call per page); " +
    "upsert-crud builds the backend."
};
// The answer to a call of a removed tool by its sequence name (tools_<name>), or "" for any other tool.
C8O.retiredToolRefusal = function (sequenceName) {
  var name = String(sequenceName || "");
  if (!Object.prototype.hasOwnProperty.call(C8O.retiredTools, name)) {
    return "";
  }
  return C8O.retiredToolMessages[name] || (name.replace(/^tools_/, "").replace(/_/g, "-") + " was removed: use " +
    C8O.retiredTools[name] + ".");
};
