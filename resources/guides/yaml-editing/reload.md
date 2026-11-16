# Reload, read the errors and check

Read when: Reload, read the errors and check. Summary: `convertigo://guides/yaml-editing`.
Previous: `convertigo://guides/yaml-editing/ngx-page`.

---

## Reload and read the errors
- After the files are written: `project-reload(project)`. It reads the project from its files again; edits to `js/*.js` files alone need no reload (a sequence includes them at each run).
- In this profile `project-reload` first checks the line grammar of every file of a legacy-format project. `status: "invalid_yaml"`: nothing was reloaded (the project stays as it was), and each `errors[]` entry is `<file>:<line>` with the cause and the line (a lost trailing space, a blank line, a tab, an unclosed quote, a `🗏` file that does not exist). Fix them and call it again.
- Then it reloads. `reloaded: true` and `errors: []` mean the project loaded. Otherwise the reload failed on something else (an unknown class or property, a bad nested structure): `errors[].message` says what the engine said, and in a Studio it may only say `Timed out waiting for project reload completion` after two minutes. The cause is in the engine log: `log-view` around the time of the reload (`no match: <line>`, the exception).
- A reload that failed leaves the project unloaded: fix the file, then call `project-reload` again; the other tools answer "not found" until it succeeds.
- Then check: `project-lint(project)` for the project's quality rules, `requestable-execute` for the sequences, `mobile-builder-build` or `mobile-builder-open` for the NGX application (its `compileErrors` point to generated files: fix the YAML that generates them, never the generated file).
- Your shell may also run `python3 <projects folder>/lib_ConvertigoMCP/scripts/c8o_yaml_lint.py <project folder>` before the reload: the same reader as the engine, with the line it fails on.
