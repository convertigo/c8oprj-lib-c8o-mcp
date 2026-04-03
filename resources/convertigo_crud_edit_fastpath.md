# Convertigo CRUD Edit Fast Path

## When to read this
Read this when the target project is already a deterministic CRUD project, the CRUD rail is already established, and the task is to extend or update that existing scaffold quickly.

This is the fast path for requests such as:
- add new entities to an existing CRUD project
- add new many-to-one relations to an existing CRUD project
- improve visible fields or relation controls through the official CRUD spec
- replace synthetic demo rows with a declared business dataset

Do not use this guide for:
- a brand new CRUD project
- non-CRUD exploratory work
- handwritten UI redesign work before the CRUD rail is green

## Preconditions
Use this rail only when all of these are already true:
- the project already exists
- `crud-status` shows the expected connector/facade/UI rail
- the project was already green earlier in the same thread or can be proven green immediately
- the task still fits the deterministic CRUD envelope

If those conditions do not hold, fall back to `convertigo://resources/convertigo-crud-fastpath`.

## Deterministic rail for an existing CRUD project
1. Run `crud-status` to confirm the current project, connector, facade prefix, entry page, and UI variant.
2. Build the full updated CRUD `spec` in one pass.
3. Run `upsert-crud` with `sequence=true` and `ui=false`.
4. Run backend `crud-proof`.
5. If the task includes UI, run `upsert-ngx-crud-kit` once with `stage=final`.
6. Run `mobile-builder-open`.
7. Run `crud-proof` again with `expectUiShell=true` and the `viewerUrl`.
8. Save with `project-save` if a final save is still needed.
9. Stop after the first final green proof.

## What to avoid on this rail
- Do not reread the whole CRUD documentation set if the CRUD rail is already established in the thread.
- Do not grep the local workspace just to rediscover the public shape of `relations[]`, `ui.relationFields`, or `seed.data`.
- Do not run `upsert-ngx-crud-kit stage=bootstrap` on a project that is already green.
- Do not patch `init_schema` manually after `upsert-crud` just to inject better demo data.
- Do not normalize `project-reload` into the edit flow; stale runtime behavior after a mutation is a tooling issue to surface, not the default rail.

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

### Relation-aware UI controls
Prefer `entities[].ui.relationFields` over patching generated components.

Example:

```json
{
  "ui": {
    "relationFields": {
      "company_id": {
        "control": "select",
        "optionLabelField": "name",
        "optionValueField": "id",
        "placeholder": "Select company"
      }
    }
  }
}
```

Rules:
- `select` is the default relation control
- `autocomplete` is opt-in only
- the UI stores the FK and shows the related label

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

## Two canonical examples

### Employees / companies

```json
{
  "relations": [
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
  ],
  "entities": [
    {
      "name": "employees",
      "ui": {
        "relationFields": {
          "company_id": {
            "control": "select",
            "optionLabelField": "name",
            "optionValueField": "id",
            "placeholder": "Select company"
          }
        }
      }
    }
  ],
  "seed": {
    "enabled": true,
    "data": {
      "companies": [
        { "name": "Blue Orbit", "city": "Paris", "industry": "Software" },
        { "name": "North Harbor", "city": "Lyon", "industry": "Logistics" }
      ],
      "employees": [
        { "first_name": "Nora", "last_name": "Martin", "email": "nora.martin@example.test", "title": "Account manager", "company_id": 1 },
        { "first_name": "Leo", "last_name": "Bernard", "email": "leo.bernard@example.test", "title": "Field engineer", "company_id": 2 }
      ]
    }
  }
}
```

### Pokemon / types / regions

```json
{
  "relations": [
    {
      "name": "pokemon_region",
      "type": "many-to-one",
      "fromEntity": "pokemon",
      "fromField": "region_id",
      "toEntity": "regions",
      "toField": "id",
      "label": "Region",
      "required": true
    },
    {
      "name": "pokemon_primary_type",
      "type": "many-to-one",
      "fromEntity": "pokemon",
      "fromField": "primary_type_id",
      "toEntity": "types",
      "toField": "id",
      "label": "Primary type",
      "required": true
    },
    {
      "name": "pokemon_secondary_type",
      "type": "many-to-one",
      "fromEntity": "pokemon",
      "fromField": "secondary_type_id",
      "toEntity": "types",
      "toField": "id",
      "label": "Secondary type"
    }
  ],
  "entities": [
    {
      "name": "pokemon",
      "ui": {
        "relationFields": {
          "region_id": {
            "control": "select",
            "optionLabelField": "name",
            "optionValueField": "id",
            "placeholder": "Select region"
          },
          "primary_type_id": {
            "control": "select",
            "optionLabelField": "name",
            "optionValueField": "id",
            "placeholder": "Select primary type"
          },
          "secondary_type_id": {
            "control": "autocomplete",
            "optionLabelField": "name",
            "optionValueField": "id",
            "placeholder": "Select optional secondary type"
          }
        }
      }
    }
  ],
  "seed": {
    "enabled": true,
    "data": {
      "types": [
        { "name": "Grass" },
        { "name": "Poison" },
        { "name": "Electric" }
      ],
      "regions": [
        { "name": "Kanto" }
      ],
      "pokemon": [
        { "name": "Bulbasaur", "region_id": 1, "primary_type_id": 1, "secondary_type_id": 2 },
        { "name": "Pikachu", "region_id": 1, "primary_type_id": 3 }
      ]
    }
  }
}
```

## Stop condition
For a low-detail edit request, stop after:
- updated backend proof
- one final UI regeneration
- one final UI proof
- optional `project-save`

Do not launch a second UI refinement pass unless the user explicitly asked for it.
