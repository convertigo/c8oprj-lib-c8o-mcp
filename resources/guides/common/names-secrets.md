# Exact names, symbols and secret visibility

Read when: Exact names, symbols and secret visibility. Summary: `convertigo://guides/common`.
Previous: `convertigo://guides/common/subagents`. Next: `convertigo://guides/common/ngx`.

---

## Naming rules

- Use exactly the project name requested by the user when it is technically valid.
- If no project is selected and the user explicitly asks to create a new project or application without giving a technical name, derive one concise valid name from the requested product or function, check `project-list` for collisions, then proceed without asking the user to select a project.
- Do not invent prefixes, suffixes, or dates. If the requested name collides with an existing project, surface the collision explicitly instead of renaming.
- Inspect and mutate only the requested target project. Every QName you touch must start with that project name, except the single `marketplace-import` template id, `lib_ConvertigoMCP.*` resource reads, and the marketplace libraries the project uses. Importing a library and referencing it from the target project does not modify another project: a library is a read-only dependency, so a rule such as "modify no project but the target" still allows it. Read and call a library; never edit it. Do not target generic roots such as `Convertigo`, `WorkSpace`, `Projects`, or another project unless the user explicitly named a reference project.
- Do not create a project manually with `databaseobject-tree-apply`; project creation comes from `marketplace-import`.
- Every non-empty NGX `identifier` becomes an Angular/TypeScript reference and must match `[A-Za-z_$][A-Za-z0-9_$]*`, for example `clockDisplay`, never `clock-display`.

## Symbols and secrets

- Reference a Convertigo symbol with an explicit default value: `${my.symbol=defaultValue}`.
- Never write a bare symbol reference without a default. A bare reference fails project loading and there is no escape syntax.
- Never put a secret, token, password, API key, or customer credential in the default value. Keep the default a harmless placeholder and let the deployment provide the real value.
- Use `project-list-symbols` to discover the symbols a project already declares before inventing a new one.
- A variable `visibility` is a bitmask: Logs=1, Studio=2, Platform=4, XmlFile=8 (XmlFile also ciphers the value in the project file). Use `15` to mask a password, token, secret, or authorization header everywhere. An even value such as `30` or `62` leaves the value in the logs.
