# Convertigo CRUD Edit Fast Path

## When to read this
Read this when the target project is already a deterministic CRUD project, the CRUD rail is already established, and the task is to extend or update that existing scaffold quickly.

This is the fast path for requests such as:
- add new entities to an existing CRUD project
- add new many-to-one relations to an existing CRUD project
- add the pages of a new entity, or change a page, with `ngx-page-create`
- replace synthetic demo rows with a declared business dataset

Do not use this guide for:
- a brand new CRUD project
- non-CRUD exploratory work
- handwritten UI redesign work before the CRUD rail is green

## Preconditions
Use this rail only when all of these are already true:
- the project already exists
- `crud-status` shows the expected connector and business sequences
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

## Running upsert-crud again
- Run it again to change the spec: an entity, a field, a relation, a label. It is not the way to repair one object nor
  to clean the rows a test created: delete those rows by their id with the delete business sequence, and fix an object
  with `databaseobject-tree-apply` or `sql-transaction-create`.
- A run keeps as it is a transaction or business sequence changed since the previous run (by hand or by another tool):
  it writes nothing in it and names it in `warnings` (status `partial`). It does not create again an `auth_login` or
  `auth_logout` deleted since. To have one written again from the spec, losing what was changed in it, send the same
  call with `spec.overwrite: ["<name>"]` (`true` for all of them).
- An app's own steps placed before the call of a business sequence are not a change: they stay, and the rest of the
  business sequence follows the spec.

## A field with a fixed set of values
On a form page of `ngx-page-create`, give the field `type:"select"` and `options:[{value, label}]` (for example
`[{"value": "basse", "label": "Basse"}, {"value": "normale", "label": "Normale"}]`): the form shows a select instead
of a text input. `value` is the starting value of a create form, a TypeScript expression (a text is quoted:
`"'normale'"`); `fields[].default` of upsert-crud also applies to a create that leaves the field out. On a list page,
`badge.labels` (or a column's `labels`) shows the label of each code. No hand edit of the form.

## List filters
The list business sequences of upsert-crud take no variable: they answer every row, so a list page refuses `filters`
on them. Give the list `list.grid:true` (the AG Grid has a filter on every column), or create a business sequence that
takes the filter (`business-sequence-create` reading the list transaction with a WHERE on that variable) and give it
to the page with `filters:[{name, label, type:"select", options}]` or `type:"search"`. No hand edit of the list.

## Real users (a login form)
- The generated `auth_login` accepts any user name. For real users, make the login sequence check the password and
  refuse with an error: an `IfStep` holding an `XMLErrorStep` (the message the form shows) and a `ReturnStep`, before
  its `SetAuthenticatedUser` step. Or use the app's own login sequence.
- The login page is an `ngx-page-create` form page with `root:true`: `form.submit` the login sequence, one field per
  variable of it (`type:"password"` for the password), `success:{page:"<home page>", kind:"root"}`. It shows the
  refusal, and every protected page takes `authRedirect` to it. A login page that signs in without asking anything
  (built by an older version): delete it and create this one. No hand-built form.
- Check a sequence that needs what the login stores (the user, a role) with `requestable-execute` and
  `before: [{"requestable": "<project>.<login sequence>", "variables": {...}}]`: the login and the call share one session.

## Language of the page texts
`ngx-page-create` writes the texts you give it: titles, labels, buttons, empty texts, success messages. Its defaults
are English and its answer warns when one was used: give every text in the app's language. upsert-crud writes the
required-field messages in French with `ui.language: "fr"` in the spec.

## Server-side checks (validation)
- upsert-crud already checks the required fields (`fields[].required`): their create and update sequences answer
  "<Label> is required." (in French with `ui.language: "fr"` in the spec) and write nothing.
- Put another check in the create and update business sequences (`crud_create_<entity>`, `crud_update_<entity>`): an
  `IfStep` on the variable, holding an `XMLErrorStep` with `code` and the message the user reads (`output: true`) and
  then a `ReturnStep`, before the call of the transaction. An `XMLErrorStep` alone does not stop the sequence: the write
  still runs. The sequence answers an `error` element and the call resolves. upsert-crud keeps the steps before the call.
- A form page of `ngx-page-create` shows that message instead of its success message; check the message with a save
  the check refuses.

## Deterministic rail for an existing CRUD project
1. Run `crud-status` to confirm the current project, connector and business sequence prefix.
2. Build the full updated CRUD `spec` in one pass: every field of each entity you change.
3. Run `upsert-crud` with `sequence=true`.
4. Run backend `crud-proof`.
5. If the task includes UI, run `ngx-page-create` once per new page (a new entity: its list, detail and form pages, with `home` and `authRedirect`). A page to change: delete it and create it again (`ngx-page-create` never overwrites an existing page), or patch it with `databaseobject-tree-apply`.
6. Run `mobile-builder-open(stateOnly=true, wait=true)` if the viewer was already warmed up, or a normal waited `mobile-builder-open` otherwise.
7. Run `project-lint` and fix what it reports.
8. Prove the changed paths with `browser-verify` (`url` the `viewerHomeUrl`). Without it, use the Playwright tools as the common skill says; if those MCP browser tools are unavailable, disabled, stale, or attached elsewhere, report the managed Playwright MCP configuration problem instead of using Node scripts, raw CDP, or a separate browser.
9. Save with `project-save` if a final save is still needed.
10. Stop after the first final green proof.

## Pages from an older CRUD UI generator
A page, shared component or shared action whose comment says `Managed by upsert-ngx-crud-kit` comes from a CRUD UI
generator that is retired: never call it. Such an object is the app's own now. To change such a page, delete it and
create it again with `ngx-page-create`, or patch it with `databaseobject-tree-apply` like any other object. Then remove
the shared components nothing uses any more: `project-lint` reports them (NGX-UNUSED-SHARED-COMPONENT).

## What to avoid on this rail
- Do not reread the whole CRUD documentation set if the CRUD rail is already established in the thread.
- Do not grep the local workspace just to rediscover the public shape of `relations[]`, `ui.relationFields`, or `seed.data`.
- Do not import the starter again or create again a page that did not change.
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
