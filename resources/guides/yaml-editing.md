# Convertigo YAML Editing

Read this before changing a project in a conversation of the `yaml` edit profile. The MCP offers no tool that changes a project there: edit the project files with your file tools, then `project-reload(project)` loads them. The MCP still reads (`databaseobject-tree-get`, `databaseobject-search`, `palette-list`, `palette-describe`, the guides) and checks (`requestable-execute`, `project-lint`, `mobile-builder-build`, `mobile-builder-open`, `browser-verify`).

Write only `c8oProject.yaml`, `_c8oProject/**` and `js/**` of the project; never `_private/`, `DisplayObjects/`, `node_modules/` or a generated file. Read the file you change and the closest existing object of the same kind first, and copy that working sibling. Keep the format the first line of `c8oProject.yaml` gives. In the legacy format keep the trailing space of every line ending with `: ` (`grep -n ':$' <file>` must print nothing), indent with two spaces, never a tab, and copy nested structures (SmartType, XMLVector...) from an existing object. Every priority is unique in the project: renumber every bean of a copy. A new file under `_c8oProject/` needs its reference line. After the reload, `status: "invalid_yaml"` means nothing was reloaded: fix each `errors[]` line and reload again. Then prove with `project-lint`, `requestable-execute` and `mobile-builder-open`; fix the YAML, never a generated file.

## Drawers
- `convertigo://guides/yaml-editing/files` — What you may write, the two formats and the line grammar.
- `convertigo://guides/yaml-editing/references` — Files, references, priorities and names.
- `convertigo://guides/yaml-editing/sequence` — Add a business sequence.
- `convertigo://guides/yaml-editing/ngx-page` — Add an NGX page and its menu entry.
- `convertigo://guides/yaml-editing/reload` — Reload, read the errors and check.
