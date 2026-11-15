# Two canonical examples

Read when: Two canonical examples. Summary: `convertigo://guides/crud-edit`.
Previous: `convertigo://guides/crud-edit/canonical-crud-additions-to-express-direct`.

---

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
            "optionLabelField": "name",
            "optionValueField": "id"
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
            "optionLabelField": "name",
            "optionValueField": "id"
          },
          "primary_type_id": {
            "optionLabelField": "name",
            "optionValueField": "id"
          },
          "secondary_type_id": {
            "optionLabelField": "name",
            "optionValueField": "id"
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
- the new or changed pages
- one browser proof of the changed paths
- optional `project-save`

Do not launch a second UI refinement pass unless the user explicitly asked for it.
