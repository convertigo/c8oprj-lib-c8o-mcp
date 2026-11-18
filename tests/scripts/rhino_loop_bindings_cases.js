/* Runs in Rhino, including the parser and the evaluator used by the compatibility check. */
(function () {
  var checks = 0;
  function eq(actual, expected) {
    checks++;
    if (String(actual) !== String(expected)) { throw new Error("Check " + checks + ": expected " + expected + ", got " + actual); }
  }
  var rewrite = C8O.rhinoLoopBindings.rewrite;
  function run(source, expected, count) {
    var fixed = rewrite(source);
    eq(eval(fixed.text), expected);
    eq(fixed.changes.length, count);
    eq(rewrite(fixed.text).changes.length, 0);
  }
  // The for/while/for-of vectors follow the engine's independent compatibility probes.
  run("var a=[];for(var i=0;i<3;i++){const x=i*2;a.push(x);}a.join(',')", "0,2,4", 1);
  run("var a=[],i=0;while(i<3){const x=100+i++;a.push(x);}a.join(',')", "100,101,102", 1);
  run("var a=[];for(var i of [1,2,3]){const x=i*10;a.push(x);}a.join(',')", "10,20,30", 1);
  run("var a=[];for(var k in {a:1,b:2}){const x=k;a.push(x);}a.join(',')", "a,b", 1);
  run("var a=[],i=0;do {const x=i++;a.push(x);}while(i<3);a.join(',')", "0,1,2", 1);
  run("var a=[];for(var i=0;i<2;i++){if(true){const x=i;for(var j=0;j<2;j++){const y=j;a.push(x+':'+y);}}}a.join(',')", "0:0,0:1,1:0,1:1", 2);
  run("(function(){var a=[];for(var i=0;i<3;i++){const x=i*2;a.push(x);}return a.join(',');})()", "0,2,4", 1);
  var callback = "[1,2,3].map(function(i){const x=i*2;return x;}).join(',')";
  eq(rewrite(callback).text, callback);
  eq(rewrite("[1,2].forEach(function(i){const x=i;});").changes.length, 0);
  var nested = "for(var i=0;i<3;i++){function f(){const x=1;return x;}var g=()=>{const y=2;return y;};}";
  eq(rewrite(nested).text, nested);
  eq(rewrite("const outside=9; {const other=2;}").changes.length, 0);
  eq(rewrite("const once=1;for(;false;){}").changes.length, 0);
  // A nested function's own loop must still be checked.
  eq(rewrite("for(var i=0;i<2;i++){function f(){for(var j=0;j<2;j++){const x=j;}}}").changes.length, 1);
  var text = "/* const comment */ const outer=1;\nfor(var i=0;i<2;i++){const x='const';var r=/const/;}";
  eq(rewrite(text).text, text.replace("const x=", "let x="));
  eq(rewrite(text).changes[0].line, 2);
  eq(rewrite("const label='é😀';while(false){const x=1,y=2;}").text, "const label='é😀';while(false){let x=1,y=2;}");
  run("var a=[];for(var i=0;i<3;i++){const x=i*2;a.push(function(){return x;});}a.map(function(f){return f();}).join(',')", "0,2,4", 1);
  eq(rewrite("return (function(){while(false){const x=1;}})();").changes.length, 1);
  var invalid = false;
  try { rewrite("while(true){const = ;}"); } catch (_) { invalid = true; }
  eq(invalid, true);
  function dbo(type) { return {getClass: function () { return {getName: function () { return type; }}; }}; }
  var backend = dbo("com.twinsoft.convertigo.beans.steps.SimpleStep");
  var js = "for(var i=0;i<2;i++){const x=i;}";
  eq(C8O.rhinoLoopBindings.prepareProperty(backend, "expression", js).text, js.replace("const", "let"));
  eq(C8O.rhinoLoopBindings.prepareProperty(backend, "expression", new java.lang.String(js)).text, js.replace("const", "let"));
  eq(C8O.rhinoLoopBindings.prepareProperty(backend, "condition", js).changes.length, 1);
  eq(C8O.rhinoLoopBindings.prepareProperty(backend, "comment", js), null);
  eq(C8O.rhinoLoopBindings.prepareProperty(dbo("com.twinsoft.convertigo.beans.ngx.components.PageComponent"), "expression", js), null);
  var smart = { getMode: function () {return "JS";}, getExpression: function () {return js;}, setExpression: function (s) {this.saved=s;} };
  eq(C8O.rhinoLoopBindings.prepareProperty(backend, "value", smart).changes.length, 1);
  eq(smart.saved, js.replace("const", "let"));
  smart.getMode = function () {return "PLAIN";}; smart.saved = "unchanged";
  eq(C8O.rhinoLoopBindings.prepareProperty(backend, "value", smart), null);
  eq(smart.saved, "unchanged");
}());
