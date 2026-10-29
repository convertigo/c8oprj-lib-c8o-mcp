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
- `crud-status` shows the expected connector/business sequence/UI rail
- the project was already green earlier in the same thread or can be proven green immediately
- the task still fits the deterministic CRUD envelope

If those conditions do not hold, fall back to `convertigo://resources/convertigo-crud-fastpath`.

## An app whose tables hold data
- `upsert-crud` keeps the rows of tables that already hold rows: no reset, no demo seed. A field added to an entity
  becomes a new column (`ALTER TABLE ... ADD`), filled on the existing rows with its `default` (`fields[].default`);
  `runtimeEvidence.existingDatabase` lists the rows kept and the columns added.
- List every field of an entity you change: a field left out leaves its CRUD (its column and values stay in the table),
  and the answer warns about the table columns left out. An entity named without fields, only for a relation, keeps
  all the columns of its table (`runtimeEvidence.existingDatabase.keptColumns`).
- It never changes or drops an existing column. A type change (more decimals, a longer text) is an `ALTER TABLE` you
  write in a one-shot transaction (`sql-transaction-create`), run once, then delete; the answer of `upsert-crud` gives
  the statement when the spec asks for more decimals than the column has.
- Never run `init_schema` by hand to apply a schema change: the `init_schema` of an app generated earlier deletes every
  row and inserts the demo rows again. Read its SQL first. `seed.reset:true` resets the tables to the demo rows, only
  when the user asks for it.
- A value a defect damaged (cents lost to a column without decimals) is fixed with an UPDATE of the rows concerned, after
  the ALTER TABLE: never delete the table's rows and insert the demo rows again, which loses what the user entered.
  `allowDataReset:true` is for a reset the user asked for in their own words.
- A row you create to check a change (`requestable-execute`, a browser proof) lands among the user's rows: delete it by
  its id as soon as its check is done, before the next step, and say in the answer if one is left.

## A field with a fixed set of values
Give the kit `ui.fieldOptions.<field>` (values, or `{value, label}` items, for example
`{"priorite": [{"value": "basse", "label": "Basse"}, {"value": "normale", "label": "Normale"}]}`): its form shows a
select instead of a text input. The create form starts from `ui.fieldDefaults.<field>`, else from the column default;
`fields[].default` of upsert-crud also applies to a create that leaves the field out. No hand edit of the form.

## Real users (a login form)
- The generated `auth_login` accepts any user name and the kit's login page signs in as demo. For real users, make the
  login sequence check the password and refuse with an error: an `IfStep` holding an `XMLErrorStep` (the message the
  form shows) and a `ReturnStep`, before its `SetAuthenticatedUser` step. Or use the app's own login sequence.
- Then run `upsert-ngx-crud-kit` with `stage: "final"` and `auth: "form"` (or `{"mode": "form", "sequence": "<login
  sequence>", "userVariable": "<name>", "passwordVariable": "<name>"}`): the login page asks a user name and a password,
  shows the refusal, and a page opened without a session goes to it. No hand-built form.
- Check a sequence that needs what the login stores (the user, a role) with `requestable-execute` and
  `before: [{"requestable": "<project>.<login sequence>", "variables": {...}}]`: the login and the call share one session.

## Language of the kit texts
The kit writes its buttons, titles, states and messages in English unless `language` says otherwise. For a French
app, or to translate pages the kit wrote in English, run `upsert-ngx-crud-kit` with `stage: "final"`,
`language: "fr"` and the same entities and ui hints as before: one call instead of editing every text. Texts you
wrote yourself (field labels, action labels) come from the ui hints.

## Server-side checks (validation)
- upsert-crud already checks the required fields (`fields[].required`): their create and update sequences answer
  "<Label> is required." (in French with `ui.language: "fr"` in the spec) and write nothing.
- Put another check in the create and update business sequences (`crud_create_<entity>`, `crud_update_<entity>`): an
  `IfStep` on the variable, holding an `XMLErrorStep` with `code` and the message the user reads (`output: true`) and
  then a `ReturnStep`, before the call of the transaction. An `XMLErrorStep` alone does not stop the sequence: the write
  still runs. The sequence answers an `error` element and the call resolves. upsert-crud keeps the steps before the call.
- The kit edit form shows that message above its buttons and does not emit `Saved`. A form generated before this
  behaviour gets it from `upsert-ngx-crud-kit` with `stage: "final"` (same entities and ui hints as before); check the
  message with a save the check refuses.

## Deterministic rail for an existing CRUD project
1. Run `crud-status` to confirm the current project, connector, business sequence prefix, entry page, and UI variant.
2. Build the full updated CRUD `spec` in one pass: every field of each entity you change.
3. Run `upsert-crud` with `sequence=true` and `ui=false`.
4. Run backend `crud-proof`.
5. If the task includes UI, run `upsert-ngx-crud-kit` once with `stage=final`.
6. Run `mobile-builder-open(stateOnly=true, wait=true)` if the viewer was already warmed up, or a normal waited `mobile-builder-open` otherwise.
7. Run `crud-proof` again with `expectUiShell=true` and the `viewerUrl`. When the waited builder result reports `browserControlReady:true`, use Playwright or browser-control MCP against that endpoint for visible Studio viewer smoke proof; if `browserControlTargetUrl` is `about:blank`, keep polling because the Studio loader is still building. If those MCP browser tools are unavailable, disabled, stale, or attached elsewhere, report the managed Playwright MCP configuration problem instead of using Node scripts, raw CDP, or a separate browser.
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
