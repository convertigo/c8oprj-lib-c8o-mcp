# Reading Baserow rows and Preview capture

Read it before checking saved rows, a computed value or how a page renders. Summary: `SKILL.md`, in this folder.

---

## Reading Baserow rows

`nocode-baserow-rows-list` reads the rows of a Baserow table with the user's own Baserow account, through the lib_BaseRow sequence the viewer's grids read through; it never writes. Check the data instead of assuming it:

- After a save (a submit tested with the user, rows of `nocode-baserow-schema-apply` or `nocode-app-create`), read the table back and confirm the record holds the values entered: filter on what identifies it, for example `{ column: "Reference", operator: "equal", value: "D-104" }`.
- To check a computed value (a formula, lookup or rollup field, an amount a flow saves), read the rows with the fields it depends on and recompute it from them; report the rows that disagree.
- To explain an empty or surprising list, gallery or chart, read the table of its source (`forms_config.table_id_int`) with the filter of the source written in the reduced shorthand.
- `table` is a table id from `nocode-baserow-catalog-list` or a source's `forms_config.table_id_int`. `fields` lists the columns you need (all by default). `filter` and `sort` take the shorthand of `quickReference.baserow` with literal values: `{ field }` reads a component at runtime and is refused here. `size` is 20 rows by default, 50 at most.
- The answer gives `rows` (each with its `id`; a select by its label, a link as `{ id, value }`, a file by its name), `total` (the rows that match) and `nextPage` while more pages follow. Read further pages only when the check needs them, and show the user only the rows the check is about.
- `unauthorized` (`table_not_readable`, `baserow_account_unavailable`): the user's account cannot read that table; say so and use no other tool to read it. `invalid_request` names the field, operator or page to fix; `baserow_refused_query` means an operator does not fit the type of its column.

## Preview capture

`nocode-form-preview-capture` shows you the saved form as the user's browser renders it: the open No Code Studio page takes the image, and you get its `path` in the conversation attachments and a `description` of it (exact texts, layout top to bottom, visual defects). It works only while the user has No Code Studio open with Tigo; the first capture of a browser session asks the user, in the Tigo panel, to allow it.

- After creating or visually changing an application (a home page, buttons, lists, several pages with custom navigation), capture each page you changed (`page`: its pageTechName, its name or its number from 1; empty for the first one) before telling the user the work is done. A questionnaire saved with a valid answer needs no capture unless the user asks to see it. Use `device:"mobile"` when the phone layout matters (several columns, action bars, lists, charts). Pass a `question` for what you need checked ("Are the three filter buttons on one line?").
- At most 4 captures per turn and 2 correction rounds for what they show; then report what is left instead of capturing again.
- `pending` with a `captureId`: call again once with that `captureId`; if it is still pending, finish without it and say that the visual check waits for the user's permission. `unavailable`: tell the user in one sentence, do not ask for a capture again in this turn, and rely on the `validation` of the last create or edit.
- Never claim you checked the rendering without a capture: say that the visual check is pending.
