# Choose the NGX recipe and handbook

Read when: Choose the NGX recipe and handbook. Summary: `convertigo://guides/ngx`.
Next: `convertigo://guides/ngx/palette`.

---

# Convertigo Frontend NGX

## When to read this
Read this when implementing or changing NGX pages, bindings, actions, route logic, or data-backed UI structure.

## What this guide covers
- Which NGX objects are indispensable and where they belong.
- How to place events and actions instead of scattering logic randomly.
- How to map backend data with SmartTypes, picker sources, and action variables.
- How to keep visible progress in Studio by starting the mobile builder early.

## Read this after the recipe
If the task is a classic data-backed page, read `convertigo/recipe-ngx-data-page@19` first. Use this handbook when the page needs deeper NGX structure, action chaining, runtime proof, or event semantics beyond the recipe.

For starter-based apps that display backend, HTTP web-service, SQL, or FullSync results, this handbook is not the entry point. Stop before any page mutation unless `convertigo://guides/data-page` has already been read in the current session.

For data-backed pages, run the recipe's final tree-readback self-audit before any final response. If the readback shows a primary `UICustom`/`htmlTemplate` renderer, TypeScript page state, or direct `this.c8o.callJson*` transport, the page is still non-compliant even when the mobile builder is ready.
