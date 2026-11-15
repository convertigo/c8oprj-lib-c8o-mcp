# Anti-patterns

Read when: Anti-patterns. Summary: `convertigo://guides/crud`.
Previous: `convertigo://guides/crud/canonical-examples`.

---

## Anti-patterns
- Do not route a standard CRUD task through planner/specialist handoffs first.
- Do not let the agent rediscover CRUD scaffolding manually when `upsert-crud` already fits.
- Do not let the agent rediscover `relations[]`, `ui.relationFields`, or `seed.data` manually once the public CRUD guides already document them.
- Do not accept a run where the app still opens on the starter page.
- Do not use RAG before the built-in CRUD tools and guides are exhausted.
- Do not continue changing the pages after the first green proof unless the user explicitly asked for more than the generic scaffold.
- Do not compose by hand a list, detail, form, dashboard or logout page that `ngx-page-create` can build.
- Do not patch `init_schema` manually just to inject better demo rows when `seed.data` can express them in the spec.
- Do not expose generated CRUD business sequences as public requestables; keep the hidden/authenticated contract and customize the generated auth skeleton instead.
