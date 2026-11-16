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
      "tools_nocode_form_get", "tools_nocode_form_list", "tools_nocode_form_contract_get", "tools_nocode_attachment_read",
      "tools_nocode_form_compile", "tools_nocode_form_validate",
      "tools_nocode_form_create", "tools_nocode_form_edit", "tools_nocode_form_update",
      "tools_nocode_form_publish", "tools_nocode_app_create", "tools_nocode_form_preview_capture",
      "tools_nocode_baserow_catalog_list", "tools_nocode_baserow_rows_list", "tools_nocode_baserow_schema_apply",
      // Listed only when the user agreed to send Tigo's feedback (mcp_tools_list).
      "tools_nocode_report_create"
    ].indexOf(String(sequence)) !== -1;
  }
};
// Tools every agent needs, No Code ones included: answer-page reads the pages of a long answer of the caller's own call
// (js/mcp_answer_pages.js). A No Code token may call them (the router), they are listed to it (mcp_tools_list), and the
// No Code profile allows them.
C8O.nocodeToolPolicy.SHARED_TOOLS = ["tools_answer_page"];
C8O.nocodeToolPolicy.shared = function (sequence) {
  return C8O.nocodeToolPolicy.SHARED_TOOLS.indexOf(String(sequence)) !== -1;
};
// The same for a tool name as called: answer-page, answer_page or answer.page.
C8O.nocodeToolPolicy.sharedToolName = function (name) {
  return C8O.nocodeToolPolicy.shared("tools_" + String(name || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_"));
};
(function (policy) {
  var allowsNoCode = policy.allows;
  policy.allows = function (sequence) {
    return allowsNoCode.call(policy, sequence) || policy.shared(sequence);
  };
})(C8O.nocodeToolPolicy);
