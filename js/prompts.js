function c8oResolvePromptsDirectory() {
  var File = Packages.java.io.File;
  var Engine = Packages.com.twinsoft.convertigo.engine.Engine;
  var project = null;
  if (context && context.requestedObject && context.requestedObject.getProject) {
    try {
      project = context.requestedObject.getProject();
    } catch (_ignore) {
      project = null;
    }
  }
  if (project == null) {
    var name = null;
    if (context && context.projectName) {
      name = String(context.projectName);
    } else if (context && context.project) {
      name = String(context.project);
    }
    if (!name || !name.length) {
      name = "ConvertigoMCP";
    }
    project = Engine.theApp.databaseObjectsManager.getOriginalProjectByName(name);
  }
  if (project == null) {
    throw new Error("Unable to resolve project for prompts helper");
  }
  if (project.getDirFile) {
    var dirFile = project.getDirFile();
    if (dirFile != null) {
      return dirFile;
    }
  }
  if (project.getDirPath) {
    var dirPath = project.getDirPath();
    if (dirPath != null) {
      return new File(String(dirPath));
    }
  }
  if (project.getProjectDirectory) {
    var dirValue = project.getProjectDirectory();
    if (dirValue != null) {
      return dirValue instanceof File ? dirValue : new File(String(dirValue));
    }
  }
  throw new Error("Project directory not available for prompts helper");
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