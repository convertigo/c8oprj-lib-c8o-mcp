# Existing form data and submit chains

Read when: Existing form data and submit chains. Summary: `convertigo://guides/ngx`.
Previous: `convertigo://guides/ngx/forms`. Next: `convertigo://guides/ngx/smartsource`.

---

- When the form edits existing data, bind each control `Value` to a Local SmartSource of the loaded record (for example `?.draft?.email`) and still read the submitted values from the Form SmartSource.
- A single search box that is not submitted as a form may keep its `DoubleBinding` on a Local SmartSource, as described in the HTTP search page pattern; it still sits in a `FormItem` with its `Label`.
- A `Select` shows an option as selected only when its `Value` and the option `Value` have the same type. `SelectOption` values written in SCRIPT mode render as strings (`value="100"`), so a numeric record field leaves the select empty in edit mode. Give the `Select` a string too, for example SCRIPT `local?.draft?.ownerId != null ? '' + local.draft.ownerId : null`, and convert back to a number in the sequence. Template expressions cannot call `String(...)`; use `'' + value`.

### Submit chain
- `SubmitButton` → the form `onSubmit` event → `CallSequenceAction` with the field variables → children for the result (see Execution order inside an event).
- Do not also put an `onClick` event on the submit button: the form submits once through `onSubmit`.

Bad pattern:
- a `UIText` or `Label` placed before an `Input` as its label, with no `Label` property on the control
- controls placed side by side in one `FormItem`, or directly under a card without `FormItem`
- `LabelPlacement` left at `start` in a vertical form
- a password `Input` with `Type` `text`
- values read with `document.querySelector(...)` or copied into locals by `ionChange` instead of the Form SmartSource
- a Form SmartSource without `priority` in `model.data`, or with a priority that is not the one of its `UIForm`
