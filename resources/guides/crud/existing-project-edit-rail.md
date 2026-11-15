# Existing project edit rail

Read when: Existing project edit rail. Summary: `convertigo://guides/crud`.
Previous: `convertigo://guides/crud/deterministic-rail`. Next: `convertigo://guides/crud/canonical-examples`.

---

## Existing project edit rail
If the target is already a deterministic CRUD project and its pages are already green, do not replay the new-project rail. Use `convertigo://guides/crud-edit` instead:
1. Run `crud-status`.
2. Build the full updated `spec`.
3. Run `upsert-crud` with `sequence=true`.
4. Run backend `crud-proof`.
5. Run `ngx-page-create` for each new page. A page to change: delete it and create it again, or patch it with `databaseobject-tree-apply`.
6. Run `mobile-builder-open(stateOnly=true, wait=true)`.
7. Run `project-lint`, then `browser-verify` on the changed paths.
8. Save with `project-save` if needed, then stop.

Do not:
- import the starter again or create again a page that did not change
- patch `init_schema` manually
- grep the local workspace just to rediscover `relations[]`, `ui.relationFields`, or `seed.data`
- normalize `project-reload` into the edit rail

## Proof contract
`crud-proof` proves the backend when all of these hold:
- `status` is `success`
- `missing` is empty
- `transactions.missing` is empty
- `sequences.missing` is empty when business sequences are expected
- proof requestables report `ok=true`

`crud-proof` checks the backend only. The pages are proven by `project-lint` without error and a `browser-verify` verdict `passed`.

## Example proof requestables
For the default `Contact` / `Company` fast path:
- `init_schema`
- `list_contacts`
- `count_contacts`
- `list_companies`
- `count_companies`
- `list_company_contacts`

For a generic many-to-one relation such as `employees.company_id -> companies.id`:
- declare the relation in `spec.relations[]`
- optionally choose the label field through `entities[].ui.relationFields.company_id.optionLabelField`
- expect the backend to expose `company_id__label` in `list_employees` / `read_employee`
- expect a derived CRUD business sequence such as `list_employees_by_company`
