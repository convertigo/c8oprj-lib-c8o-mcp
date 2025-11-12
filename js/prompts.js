if (typeof C8O === "undefined" || typeof C8O.project === "undefined") {
  include("js/util.js");
}

function c8oResolvePromptsDirectory() {
  return C8O.project.resolveProjectDirectory({ projectName: "ConvertigoMCP" });
}

function c8oLoadPromptsIndex() {
  var File = Packages.java.io.File;
  var Files = Packages.java.nio.file.Files;
  var StandardCharsets = Packages.java.nio.charset.StandardCharsets;
  var projectDir = c8oResolvePromptsDirectory();
  var promptsDir = new File(projectDir, "prompts");
  var indexFile = new File(promptsDir, "prompts_index.json");
  if (!indexFile.isFile()) {
    throw new Error("Prompts index file not found: " + indexFile.getAbsolutePath());
  }
  var jsonText = new java.lang.String(Files.readAllBytes(indexFile.toPath()), StandardCharsets.UTF_8);
  var parsed = JSON.parse(String(jsonText));
  if (!parsed || !parsed.length) {
    return [];
  }
  return parsed;
}

function c8oFindPromptByName(promptName) {
  var index = c8oLoadPromptsIndex();
  if (!promptName) {
    return null;
  }
  var needle = String(promptName).toLowerCase();
  for (var i = 0; i < index.length; i++) {
    var entry = index[i];
    if (entry && String(entry.name).toLowerCase() === needle) {
      return entry;
    }
  }
  return null;
}

function c8oReadPromptFile(entry) {
  var File = Packages.java.io.File;
  var Files = Packages.java.nio.file.Files;
  var StandardCharsets = Packages.java.nio.charset.StandardCharsets;
  if (!entry || !entry.file) {
    throw new Error("Prompt entry has no file property");
  }
  var projectDir = c8oResolvePromptsDirectory();
  var promptsDir = new File(projectDir, "prompts");
  var promptFile = new File(promptsDir, entry.file);
  if (!promptFile.isFile()) {
    throw new Error("Prompt file not found: " + promptFile.getAbsolutePath());
  }
  return new java.lang.String(Files.readAllBytes(promptFile.toPath()), StandardCharsets.UTF_8);
}
