# Finding the user's forms

Read it when a form is named without its id, or the user asks which or how many forms they have. Summary: `SKILL.md`, in this folder.

---

## Finding the user's forms

`nocode-form-list` lists the forms and applications the user can open in No Code Studio, as the Édition list of its home shows them: those they own and those shared with them, folders included, the newest first. It never writes. C8Oforms keeps a form and an application as the same document: answer with the user's word.

- « Combien de formulaires / d'applications ai-je ? », « liste mes applications »: call it once without `name` and answer with `total`. `total` counts the forms shared with the user too: when they ask how many are their own, count the forms with `access: "owner"` (`limit: 40`, every page).
- « Retrouve mon formulaire Congés », « ouvre l'application des notes de frais », any form named without its id: call it with `name` (a distinctive part of the name, matched without case nor accents), then read the `id` it gives with `nocode-form-get`. Several forms match: show their names, dates and owners and ask which one. None: try one shorter or other word, then tell the user.
- Each form gives `id`, `name`, `access` (`owner`, or `shared` with its `creator`), `publication` (`never`, `published`, or `changed`: saved again since its published `version`), `modified` (its last change) and `folders`. `nextCursor` reads the next forms (pass it as `cursor` with the same `name`); read further pages only when the question needs them. `limit` is 20 by default, 40 at most.
- The list is the user's own, an administrator's too. The form open in No Code Studio comes with the host context: use its id without listing.
- `auth_required`: the No Code authentication is not ready (see No-Code Authentication). `form_list_failed`: tell the user the list is unavailable; never guess their forms from the Baserow catalog.
