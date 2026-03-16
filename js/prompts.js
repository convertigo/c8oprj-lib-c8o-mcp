if (typeof C8O === "undefined" || typeof C8O.project === "undefined") {
  include("js/util.js");
}
include("js/catalog_loader.js");

function c8oLoadPromptsIndex() {
  return c8oLoadCatalogIndex("prompts", "prompts_index.json", {
    required: true
  });
}

function c8oFindPromptByName(promptName) {
  return c8oFindCatalogEntry(c8oLoadPromptsIndex(), "name", promptName);
}

function c8oReadPromptFile(entry) {
  if (!entry || !entry.file) {
    throw new Error("Prompt entry has no file property");
  }
  return c8oReadCatalogFile("prompts", entry.file);
}
