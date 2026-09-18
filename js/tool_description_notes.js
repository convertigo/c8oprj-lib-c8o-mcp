if (typeof C8O === "undefined") {
  var C8O = {};
}

// Extra guidance appended to a tool description in tools/list.
//
// It lives here and not in the sequence comment because a bean property is symbol-processed by
// the engine: a literal ${name} written there is resolved (or fails as undefined) before any
// agent reads it. A JavaScript file is left untouched.
C8O.toolDescriptionNotes = {
  tools_project_list_symbols: [
    "There is no tool to create a symbol and none is needed: reference it with a default value in any text property, ${my.symbol=defaultValue} (an empty default is allowed: ${my.symbol=}).",
    "The default avoids any undefined-symbol error, and the symbol then shows up in the administration console where its value can be overridden per environment.",
    "Never use a bare ${my.symbol}, and never put a secret in the default."
  ].join(" ")
};
