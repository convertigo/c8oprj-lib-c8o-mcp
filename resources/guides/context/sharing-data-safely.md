# Sharing data safely

Read when: Sharing data safely. Summary: `convertigo://guides/context`.
Previous: `convertigo://guides/context/overview`.

---

## Sharing data safely

- **Inside the same sequence run:** declare normal JavaScript variables (`var wordsData = …;`). All Simple Steps and Json Steps share the same Rhino scope, so the iterator can reuse those locals without touching `context`.
- **Between sequences or requests:**
  - `project.set(key, value)` / `project.get(key)` for data shared across sessions of the same project.
  - `server.set(key, value)` / `server.get(key)` for engine-wide caches.
  - `context.httpSession.setAttribute(key, value)` / `.getAttribute(key)` to stick to the current user session.

## Forbidden / discouraged patterns

- `context.someCustomProperty = …` — fails because the Java bean exposes only whitelisted getters/setters.
- Assigning non-serializable objects to `context.outputDocument` or its nodes.
- Mixing context storage with JS locals (e.g. `context.wordsData` + `var wordsData`). Pick one of the safe storage mechanisms above.

When in doubt, consult the reference manual paragraph “Context object” (`reference-manual/convertigo-mbaas-server/javascript-objects-apis/index.md`).
