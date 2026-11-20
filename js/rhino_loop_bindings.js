/* Targeted compatibility check for JavaScript evaluated by the sequence engine. */
if (typeof C8O === "undefined") { var C8O = {}; }
C8O.rhinoLoopBindings = (function () {
  var message = "Use let inside loop bodies: the JavaScript engine can retain a const binding from the first iteration. Changed const to let.";

  function rewrite(source) {
    var text = String(source);
    if (!/\bconst\b/.test(text)) { return { text: text, changes: [] }; }
    var rhino = Packages.org.mozilla.javascript;
    var env = new rhino.CompilerEnvirons();
    env.setLanguageVersion(rhino.Context.VERSION_ES6);
    env.setRecoverFromErrors(false);
    // Step expressions may contain a return; wrapping only for parsing preserves their source and offsets.
    var prefix = "(function(){\n";
    var tree = new rhino.Parser(env).parse(prefix + text + "\n});", "step-script", 1);
    var changes = [];
    tree.visit(new JavaAdapter(rhino.ast.NodeVisitor, {
      visit: function (node) {
        if (!(node instanceof rhino.ast.VariableDeclaration) || node.getType() !== rhino.Token.CONST) { return true; }
        var child = node;
        var parent = child.getParent();
        while (parent !== null) {
          if (parent instanceof rhino.ast.FunctionNode) { break; }
          // A loop initializer/iterator is not its body. A nested function gets its own invocation.
          if (parent instanceof rhino.ast.Loop && parent.getBody() === child) {
            var start = Number(node.getAbsolutePosition()) - prefix.length;
            if (start >= 0 && text.substring(start, start + 5) === "const") {
              changes.push({ offset: start, line: Number(node.getLineno()) - 1 });
            }
            break;
          }
          child = parent;
          parent = parent.getParent();
        }
        return true;
      }
    }));
    changes.sort(function (a, b) { return a.offset - b.offset; });
    for (var i = changes.length - 1; i >= 0; i--) {
      var at = changes[i].offset;
      text = text.substring(0, at) + "let" + text.substring(at + 5);
    }
    return { text: text, changes: changes };
  }

  function prepareProperty(dbo, name, value) {
    // Browser scripts, plain strings, SQL, and source definitions are not Rhino code.
    var smartType = value !== null && value !== undefined && typeof value.getMode === "function" && typeof value.getExpression === "function";
    if (!smartType && String(name) !== "expression" && String(name) !== "condition") { return null; }
    var type = String(dbo.getClass().getName());
    if (type.indexOf("com.twinsoft.convertigo.beans.steps.") !== 0) { return null; }
    if (smartType) {
      if (String(value.getMode()) !== "JS") { return null; }
      var smart = rewrite(value.getExpression());
      if (smart.changes.length) { value.setExpression(smart.text); }
      return smart;
    }
    if (String(name) !== "expression" && String(name) !== "condition") { return null; }
    if (typeof value !== "string" && !(value instanceof java.lang.String)) { return null; }
    return rewrite(value);
  }

  return { rewrite: rewrite, prepareProperty: prepareProperty, message: message };
}());
