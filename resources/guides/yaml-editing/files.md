# What you may write, the two formats and the line grammar

Read when: What you may write, the two formats and the line grammar. Summary: `convertigo://guides/yaml-editing`.
Next: `convertigo://guides/yaml-editing/references`.

---

# Convertigo YAML Editing

## When to read this
Read this in a conversation of the `yaml` edit profile, before changing a project. In this profile the MCP offers no tool that changes a project (`databaseobject-tree-apply`, the generators, `project-js-set`, `project-save`...): you change the project by editing its files with your file tools, then `project-reload` loads them. The MCP still reads (`databaseobject-tree-get`, `databaseobject-search`, `palette-list`, `palette-describe`, the guides) and checks (`requestable-execute`, `project-lint`, `mobile-builder-build`, `mobile-builder-open`, `browser-verify`).

## What you may write
- In the project folder only: `c8oProject.yaml`, everything under `_c8oProject/`, and the included JavaScript under `js/`. Your file tools refuse any other path.
- Never write `_private/`, `DisplayObjects/`, `node_modules/` or any generated file, with any tool: the Studio generates them again from the YAML.
- Read before you write: the file you change, and the closest existing object of the same kind in the project (a sequence, a page, a transaction). Copying a working sibling is the safest start.

## The two formats
The first line of `c8oProject.yaml` gives the format of every file of the project. Keep it.
- `↑convertigo: 8.4.0.m006` (or `↓...` first): the legacy format, described below. Most projects.
- `convertigo: 8.5.0.m006` (no `↑`): the standard YAML format of Convertigo 8.5. Same tree and the same keys, in standard YAML syntax: no trailing-space rule, and a bean held by its own file has the bare path as value (`↓Hello [sequences.GenericSequence]: sequences/Hello.yaml`, no `🗏`).

## Legacy line grammar
The engine reads each line with one pattern: `( *)(- )?(↑)?(→)?(↓)?(.*?): (🗏 )?(.*)`. So every line has a colon followed by a space, even when nothing follows it.
- A bean (a Convertigo object) is `↓Name [package.Class-priority]: ` with a trailing space after the colon. Its properties and children are indented two spaces under it.
- A property is `name: value`. A property whose value is a nested structure (SmartType, MobileSmartSourceType, XMLVector, FormatedContent) is `name: ` (again with its trailing space), then a list of `- xmlizable: ` items: copy that structure from an existing object, never invent it.
- `↑name: value` is an XML attribute of the nested structure (`↑classname`, `↑mode`, `↑value`); `→→: text` and `→: text` are its text.
- Indentation is two spaces, never a tab.
- **Keep the trailing space** of every line ending with `: `. An editor or a tool that strips trailing spaces breaks the file: the reload fails with `no match` on that line and the project is not loaded. After an edit, `grep -n ':$' <file>` must print nothing.
- Values: a plain value is written as is (`comment: Read one company.`). Quote it with single quotes when it contains `: `, starts with a YAML character (`'`, `"`, `{`, `[`, `!`, `*`, `&`, `#`, `-`, `?`, `|`, `>`, `@`, `` ` ``, `%`) or is empty (`''`); double every single quote inside (`'It''s ready'`).
- A multi-line value is a `|` block whose lines are one single-quoted string, single quotes doubled inside:
  ```
    expression: |
      'var total = 0;
      log.info(''start'');'
  ```
