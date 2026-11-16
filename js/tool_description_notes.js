if (typeof C8O === "undefined") {
  var C8O = {};
}

// Extra guidance appended to a tool description in tools/list.
//
// It lives here and not in the sequence comment because a bean property is symbol-processed by
// the engine: a literal ${name} written there is resolved (or fails as undefined) before any
// agent reads it. A JavaScript file is left untouched.
C8O.toolDescriptionNotes = {
  tools_databaseobject_tree_apply: "For NGX source/binding errors read convertigo://guides/ngx/smartsource; event ordering and business errors: convertigo://guides/ngx/events.",
  tools_mobile_builder_open: "For builder launch or browser readiness read convertigo://guides/ngx/viewer. Fix source objects, never generated files.",
  tools_requestable_execute: "Guide reads: lib_ConvertigoMCP.mcp_resources_read with variables.uri. Read one exact summary or drawer per call, with includeLogs=false. An answer over 14000 characters comes as its first page (partialAnswer): answer-page gives the next. Adapter: convertigo://guides/vibe/calls.",
  tools_sql_transaction_create: "SQL variable and dialect failures: convertigo://guides/sql/sql-variable-semantics-you-must-not-guess.",
  tools_project_list_symbols: [
    "There is no tool to create a symbol and none is needed: reference it with a default value in any text property, ${my.symbol=defaultValue} (an empty default is allowed: ${my.symbol=}).",
    "The default avoids any undefined-symbol error, and the symbol then shows up in the administration console where its value can be overridden per environment.",
    "Never use a bare ${my.symbol}, and never put a secret in the default."
  ].join(" ")
};
