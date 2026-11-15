# Canonical CRUD additions to express directly in the spec

Read when: Canonical CRUD additions to express directly in the spec. Summary: `convertigo://guides/crud-edit`.
Previous: `convertigo://guides/crud-edit/server-side-checks-validation`. Next: `convertigo://guides/crud-edit/two-canonical-examples`.

---

## Canonical CRUD additions to express directly in the spec

### Explicit relations
Prefer `spec.relations[]` over inference when a relation is obvious.

Example:

```json
{
  "name": "employee_company",
  "type": "many-to-one",
  "fromEntity": "employees",
  "fromField": "company_id",
  "toEntity": "companies",
  "toField": "id",
  "label": "Company",
  "required": true
}
```

### Relation label
`entities[].ui.relationFields.<field>.optionLabelField` names the field of the related entity that the list and read
business sequences return as `<field>__label`.

Example:

```json
{
  "ui": {
    "relationFields": {
      "company_id": {
        "optionLabelField": "name",
        "optionValueField": "id"
      }
    }
  }
}
```

Rules:
- a list or detail page shows `<field>__label`
- a form sends the foreign key, from a select whose options come from the page's business sequence (`optionsFrom`)

### Declarative demo rows
Prefer `seed.data` when the user wants credible domain rows.

Example:

```json
{
  "seed": {
    "enabled": true,
    "data": {
      "types": [
        { "name": "Fire" },
        { "name": "Electric" }
      ],
      "regions": [
        { "name": "Kanto" }
      ],
      "pokemon": [
        { "name": "Pikachu", "region_id": 1, "primary_type_id": 2 }
      ]
    }
  }
}
```

Notes:
- `seed.data` is keyed by entity name
- when an explicit row omits the integer identity primary key, the generator assigns sequential IDs starting at `1`
- child rows can therefore reference parent rows deterministically through FK columns such as `region_id` or `primary_type_id`
- entities not present in `seed.data` still fall back to synthetic rows from `seed.profile` / `seed.rowsPerEntity`
