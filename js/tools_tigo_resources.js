// The normal MCP bearer authentication is rechecked here because Private alone
// is not an HTTP authentication boundary in Eclipse Studio.
include("js/mcp_auth.js");
include("js/util.js");
var resourceAuth = C8O.mcpAuth.authenticateRequest(context);
if (
  !resourceAuth.authenticated ||
  resourceAuth.kind === "nocode" ||
  resourceAuth.scope !== "mcp:full"
) {
  throw new Error("A full Convertigo MCP bearer token is required");
}
var resourceEngine = Packages.com.twinsoft.convertigo.engine.Engine;
var assistantProject =
  resourceEngine.theApp.databaseObjectsManager.getOriginalProjectByName(
    "lib_ConvertigoAssistant"
  );
if (!assistantProject) {
  throw new Error(
    "Install lib_ConvertigoAssistant 1.5.0 or newer to manage Tigo resources"
  );
}
var resourceSource = new java.io.File(
  assistantProject.getDirFile(),
  "js/tigo_resources.js"
)
  .getCanonicalFile()
  .toPath();
include(
  String(
    context.project
      .getDirFile()
      .getCanonicalFile()
      .toPath()
      .relativize(resourceSource)
  )
);
var resourceAction = String(action || "list"), resourceProject = String(project || "");
var resourceInput = C8O.util.parseObjectInput(input, { label: "input" });
var resourceKey = String(key || "");
var resourceScope = resourceInput.scope === "workspace" || resourceKey.indexOf("workspace::") === 0 ? "workspace" : "project";
delete resourceInput.scope;
var resourceStudio = resourceEngine.isStudioMode() === true;
if (resourceScope === "workspace" && !resourceStudio) {
  throw new Error("Personal agent configuration requires the local Studio owner");
}
if (resourceScope === "project") {
  if (!resourceProject || resourceProject === "lib_ConvertigoAssistant") { throw new Error("Choose an editable target project"); }
  if (!resourceEngine.theApp.databaseObjectsManager.existsProject(resourceProject)) {
    throw new Error("Unknown project: " + resourceProject + ". project-list gives the loaded projects.");
  }
}
if (["list","get","save","duplicate","delete","readFile","writeFile"].indexOf(resourceAction) < 0) {
  throw new Error("Unsupported project resource operation");
}
var resourcePrefix = resourceScope === "workspace" ? "workspace::" : "project:" + resourceProject + ":";
if (resourceKey && resourceKey.indexOf(resourcePrefix) !== 0) { throw new Error("Resource key must belong to the requested project or personal scope"); }
var resourceHost = C8O.tigoResources.javaHost(context, true);
resourceHost.agentInitiated = true;
if (resourceStudio) {
  // A full authenticated author of this local Studio is its owner, as for the constructor.
  // Never derive a personal owner from tool arguments, a bearer label or a server user's email.
  resourceHost.identity = function () {return {admin:true,studio:true,surface:"studio",user:"studio",owner:"studio",key:"studio"};};
}
var resourceApi = C8O.tigoResources.create(resourceHost);
var resourceKind = String(kind || "prompt");
if (resourceAction === "duplicate" && (resourceKind === "mcp" || resourceKey.split(":")[2] === "mcp")) {throw new Error("Read the declaration and save the new MCP proposal for human review");}
response = resourceApi.execute({action:resourceAction,scope:resourceScope,project:resourceProject,kind:resourceKind,
  key:resourceKey,revision:String(revision || ""),input:resourceInput,language:String(language || "en")});
if (resourceAction === "list") {
  response.items = response.items.filter(function (x) { return x.scope === resourceScope && (resourceScope !== "project" || x.project === resourceProject); });
  response.errors = response.errors.filter(function (x) { return x.scope === resourceScope && (resourceScope !== "project" || x.project === resourceProject); });
  ["favorites","selection","missingSelections","secrets","projects","canManageMcp","proposals"].forEach(function (name) {delete response[name];});
}
