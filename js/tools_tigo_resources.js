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
var resourceAction = String(action || "list"),
  resourceProject = String(project || "");
if (!resourceProject || resourceProject === "lib_ConvertigoAssistant") {
  throw new Error("Choose an editable target project");
}
if (
  [
    "list",
    "get",
    "save",
    "duplicate",
    "delete",
    "readFile",
    "writeFile"
  ].indexOf(resourceAction) < 0
) {
  throw new Error("Unsupported project resource operation");
}
var resourceInput = C8O.util.parseObjectInput(input, { label: "input" });
var resourceKey = String(key || "");
if (
  resourceKey &&
  resourceKey.indexOf("project:" + resourceProject + ":") !== 0
) {
  throw new Error("Resource key must belong to the requested project");
}
var resourceApi = C8O.tigoResources.create(
  C8O.tigoResources.javaHost(context, true)
);
response = resourceApi.execute({
  action: resourceAction,
  scope: "project",
  project: resourceProject,
  kind: String(kind || "prompt"),
  key: resourceKey,
  revision: String(revision || ""),
  input: resourceInput,
  language: String(language || "en")
});
if (resourceAction === "list") {
  response.items = response.items.filter(function (x) {
    return x.scope === "project" && x.project === resourceProject;
  });
  response.errors = response.errors.filter(function (x) {
    return x.scope === "project" && x.project === resourceProject;
  });
  delete response.favorites;
  delete response.selection;
  delete response.missingSelections;
  delete response.secrets;
  delete response.projects;
  delete response.canManageMcp;
}
