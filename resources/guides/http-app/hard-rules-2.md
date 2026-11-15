# ForEach aliases and row scope

Read when: ForEach aliases and row scope. Summary: `convertigo://guides/http-app`.
Previous: `convertigo://guides/http-app/hard-rules`. Next: `convertigo://guides/http-app/http-backend`.

---

- For result loops, `directiveName:"ForEach"` is not enough. Before adding any row text, read back the `UIControlDirective`; it must show `directiveSource`, `directiveItemName`, and `directiveIndexName`. The exact root used by row text must match `directiveItemName`: `{{ item.x }}` requires `directiveItemName:"item"`, and `{{ record.x }}` requires `directiveItemName:"record"`. The visible row components that use that root must be children of the `UIControlDirective`, not siblings before or after it; otherwise Angular compiles the alias as a missing page property.

