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

## Files and references
- `c8oProject.yaml` holds the project bean and its direct children. A child held by its own file is one line: `  ↓crm_list_companies [sequences.GenericSequence]: 🗏 sequences/crm_list_companies.yaml`.
- The referenced file, under `_c8oProject/`, holds the body of that bean at column 0: its properties first, then its children (`↓...` lines at column 0). It never repeats the bean line.
- `_c8oProject/connectors/<connector>.yaml` holds a connector's body, its transactions at column 0. `_c8oProject/mobileNgxApp.yaml` holds the NGX application: its pages are lines `↓Name [ngx.components.PageComponent-priority]: 🗏 mobilePages/Name.yaml`.
- A file under `_c8oProject/` that no bean references is ignored by the reload (and deleted at the next save): a new file needs its reference line.

## Priorities and names
- The number after the class (`[steps.TransactionStep-1794587262763]`) is the object's priority: its identity. Steps, variables and NGX components carry one; some beans (sequences and transactions) often have none.
- Every priority is unique in the whole project. A new object gets a new number never used in the project: for example the current time in milliseconds plus a counter (`python3 -c "import time; b=int(time.time()*1000); print(*range(b, b+30))"`), checked with `grep -rn -- '-<number>]' c8oProject.yaml _c8oProject`.
- Priorities are referenced: a step source is `[<priority of the step>, <xpath>]`, and an NGX style may use `.class<priority>` selectors. When you copy an object, give every bean of the copy a new priority and replace each old number by its new one everywhere in the copy (a map old→new applied to the whole copied text).
- Names are unique among siblings; sequences are listed in `c8oProject.yaml` in alphabetical order.

## Add a business sequence
1. Copy the closest existing sequence file of the project (`_c8oProject/sequences/<name>.yaml`) to the new name, and renumber its priorities.
2. Add its reference line in `c8oProject.yaml`, among the other sequences in alphabetical order: `  ↓<name> [sequences.GenericSequence]: 🗏 sequences/<name>.yaml`.
3. Its body, at column 0:
   - `accessibility` (`Public`, `Hidden` for a sequence the app calls, `Private` for a helper) and `authenticatedContextRequired` (`true` when it reads protected data), `comment`;
   - its steps, in order; each step's children are indented under it;
   - its input variables last: `↓id [variables.RequestableVariable-<priority>]: ` with `comment`, `description` and, when it has one, `value` (its default).
4. Common steps, as the project's sequences write them:
   - call a transaction: `↓call_x [steps.TransactionStep-<p>]: ` with `sourceTransaction: <Project>.<connector>.<transaction>`; a child `↓id [variables.StepVariable-<p>]: ` passes the sequence variable of the same name;
   - expose its answer to JavaScript: `↓src_x [steps.JsonSourceStep-<p>]: ` whose `sourceDefinition` is the vector `[<priority of call_x>, ./document]` and `variableName: doc_x`; then `doc_x.document.sql_output` is the array of rows (column names as the SQL aliases);
   - compute: `↓logic [steps.SimpleStep-<p>]: ` with an `expression` (JavaScript ES5 for Rhino: `var`, `function`, no arrow functions, no `let`/`const`); sequence variables are JavaScript variables of the same name;
   - answer: `↓out [steps.JsonToXmlStep-<p>]: ` with `key` (a PLAIN SmartType: the field name) and `jsonObject` (a JS SmartType: the expression of the value, an object or an array), or `JsonObjectStep` / `JsonFieldStep` with SOURCE or JS values as the existing sequences show.
5. A SQL query the sequence needs and the connector lacks is a new transaction in `_c8oProject/connectors/<connector>.yaml`: `↓name [transactions.SqlTransaction]: ` at column 0, `sqlQuery: |` (plain SQL lines, `{var}` for a variable) and its `↓var [variables.RequestableVariable-<p>]: ` children. Copy a transaction of the same connector.
6. Reload, then prove it: `requestable-execute` with `requestable: "<Project>.<sequence>"` and its variables. A sequence with `authenticatedContextRequired: true` needs a signed-in user: pass `authenticatedUser`, or run the project's login sequence first with `before`.

## Add an NGX page and its menu entry
1. Copy the closest existing page (`_c8oProject/mobilePages/<Page>.yaml`, a list page for a list) to the new name, and renumber all its priorities.
2. Reference it in `_c8oProject/mobileNgxApp.yaml`, next to the other page lines (their order is the menu order): `↓<Page> [ngx.components.PageComponent-<p>]: 🗏 mobilePages/<Page>.yaml`.
3. The first lines of the page file are its properties: `segment` (its URL path, unique), `title` (the toolbar and menu label), `icon` (an ionicon name, shown in the menu). A page is in the menu unless it has `inAutoMenu: false`: the menu lists the pages itself (`UIDynamicMenuItems`), so a menu entry is a page without that line.
4. Data comes from a page event and actions, never from code in `scriptContent`: a `↓PageEvent [ngx.components.UIPageEvent-<p>]: ` with `viewEvent: onWillEnter`, holding a `CallSequenceAction` (`beanData: '{"ionBean":"CallSequenceAction","requestable":"plain:<Project>.<sequence>"}'`) whose children `SetLocalAction` store `out` into `local` (`"Property": "plain:data"`, `"Value": "script:out"`); the elements bind `local?.data...` with `script:` MobileSmartSourceType values. Keep the binding forms the copied page uses (`plain:`, `script:`, `source:{...}`).
5. Elements are `ngx.components.UIDynamicElement` beans with `beanData` (`{"ionBean":"Card"}`, `{"ionBean":"List"}`...) and `tagName`; texts are `UIText` with `textValue`; classes are `UIAttribute` children. `palette-list` and `palette-describe` on the page give the ionBeans and their properties.
6. Reload, then `mobile-builder-open(project)`: wait for `status: "ready"` with no `compileErrors`, then prove the page in the viewer (`browser-verify`, or the Playwright tools).

## Reload and read the errors
- After the files are written: `project-reload(project)`. It reads the project from its files again; edits to `js/*.js` files alone need no reload (a sequence includes them at each run).
- In this profile `project-reload` first checks the line grammar of every file of a legacy-format project. `status: "invalid_yaml"`: nothing was reloaded, the project is still the one loaded before, and each `errors[]` entry is `<file>:<line>` with the cause and the line (a lost trailing space, a blank line, a tab, an unclosed quote, a `🗏` file that does not exist). Fix them and call it again.
- Then it reloads. `reloaded: true` and `errors: []` mean the project loaded. Otherwise the reload failed on something else (an unknown class or property, a bad nested structure): `errors[].message` says what the engine said, and in a Studio it may only say `Timed out waiting for project reload completion` after two minutes. The cause is in the engine log: `log-view` around the time of the reload (`no match: <line>`, the exception).
- A reload that failed leaves the project unloaded: fix the file, then call `project-reload` again; the other tools answer "not found" until it succeeds.
- Then check: `project-lint(project)` for the project's quality rules, `requestable-execute` for the sequences, `mobile-builder-build` or `mobile-builder-open` for the NGX application (its `compileErrors` point to generated files: fix the YAML that generates them, never the generated file).
- Your shell may also run `python3 <projects folder>/lib_ConvertigoMCP/scripts/c8o_yaml_lint.py <project folder>` before the reload: the same reader as the engine, with the line it fails on.
