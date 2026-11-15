# Called sequence paths and minimal shaping

Read when: Called sequence paths and minimal shaping. Summary: `convertigo://guides/backend`.
Previous: `convertigo://guides/backend/step-taxonomy-that-matters-most-2`. Next: `convertigo://guides/backend/step-taxonomy-that-matters-most-4`.

---

- check the exact path with `databaseobject-schema` or one `requestable-execute` of the called requestable before wiring it
- under a `SequenceStep`, source `./document` and read the fields in JS (`.document.data`): a deeper xpath such as `./document/data` can return `null`
- rows from `./document/sql_output` come as an array created in another Rhino scope: `rows instanceof Array` is `false`. Loop on `rows.length` (or copy into a local array first) instead of testing `instanceof Array`
- a sequence variable is a JavaScript variable of the same name in every step: read `profile` directly. `context.get("profile")` reads a context attribute (set with `context.set`), not a request variable, so it returns nothing and the code falls back to its default on every call. Do not redeclare the variable from another source (`var profile = context.get(...)`)
- sequence variables read in JS are Java strings (`typeof` is `object`): call `String(v)` before `split`, regular expressions or `===` comparisons

A failing call does not stop the sequence:
- when the transaction behind a `TransactionStep` fails (SQL error, type mismatch), the sequence goes on with the next steps and the business sequence still answers success. The error is in the step's document: source `./document` and test it before using the rows or counting a write, for example `if (doc && doc.document && doc.document.error) { resp = app.fail("ECRITURE_KO", String(doc.document.error.details || doc.document.error.message)); }` (checked: a failing INSERT left the following steps running)
- pass dates to SQL as strings (`'2026-10-17'`, `'2026-10-17 08:00:00'`), never as a JavaScript `Date` object: the object becomes its English text form, which the column refuses

Calling a requestable with parameters:
- a `StepVariable` with no source and no value takes the value of the JavaScript variable of the same name in the sequence scope (a sequence variable or a `var` set by a previous `SimpleStep`), else its default value
- create the step variables with `importVariables:true` on the `TransactionStep` or `SequenceStep` node (after `sourceTransaction`/`sourceSequence`): the MCP imports one `StepVariable` per variable of the called requestable, with its default value. Then set the JavaScript variables of the same names before the call

`business-sequence-create` builds this chain for a business sequence (include, user read and role check, reads, a logic step calling a function of the file, guarded writes, the four outputs): see `convertigo-recipe-multipage-app`, Generators. Build it by hand when the business sequence needs other steps.

Minimal chain:

```text
↓Include          steps.SimpleStep       include("js/pca_rules.js");
↓CallList         steps.TransactionStep  output=false
↓Rows             steps.JsonSourceStep   source ["<CallList priority>", "./document/sql_output"], variableName=rows
↓Compute          steps.SimpleStep       var result = Pca.withStatus(rows, today);
↓response         steps.JsonToXmlStep    jsonObject = JS "result", key "response", output=true
```

The key of the output step is the top-level key of the response: here callers read `response.*`. A business sequence called by NGX pages emits its contract keys at top level instead (one `JsonToXmlStep` per key `success`, `data`, `errors`, `meta`, see `convertigo-recipe-multipage-app`), so `out?.success` works in the page.

Common trap:
- reading the transaction through `context.*` or re-executing it in JS instead of sourcing the `TransactionStep`

Minimum validation proof:
- one `requestable-execute` of the sequence showing the computed fields
- after editing the file with `project-js-set`, run the sequence again and check the new behaviour is used

### Best-case first, trust the error bubble
Default backend generation should assume the nominal path works:
- wire the happy-path requestables cleanly
- keep helper steps internal
- let standard Convertigo execution errors surface unless a special UX contract really needs interception

Prefer this:
- one clear call path
- one explicit shaping step
- one validation proof
