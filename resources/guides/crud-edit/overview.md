# Scope, prerequisites and route selection

Read when: Scope, prerequisites and route selection. Summary: `convertigo://guides/crud-edit`.
Next: `convertigo://guides/crud-edit/running-upsert-crud-again`.

---

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

If those conditions do not hold, fall back to `convertigo://guides/crud`.

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
