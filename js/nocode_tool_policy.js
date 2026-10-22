// Capability restriction for embedded Forms. This only narrows the catalog;
// every protected tool must still validate its bearer token and C8Oforms ACLs.
if (typeof C8O === "undefined") { var C8O = {}; }
C8O.nocodeToolPolicy = {
  active: function () {
    var request = typeof context !== "undefined" && context ? context.httpServletRequest : null;
    return request && String(request.getHeader("X-Convertigo-Agent-Profile") || "").toLowerCase() === "nocode";
  },
  allows: function (sequence) {
    return [
      "tools_nocode_form_get", "tools_nocode_form_contract_get",
      "tools_nocode_form_compile", "tools_nocode_form_validate",
      "tools_nocode_form_create", "tools_nocode_form_edit", "tools_nocode_form_update",
      "tools_nocode_form_publish",
      "tools_nocode_baserow_catalog_list", "tools_nocode_baserow_schema_apply",
      // Listed only when the user agreed to send Tigo's feedback (mcp_tools_list).
      "tools_nocode_report_create"
    ].indexOf(String(sequence)) !== -1;
  }
};
