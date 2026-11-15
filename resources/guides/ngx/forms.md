# Forms, labels, validation and Form SmartSources

Read when: Forms, labels, validation and Form SmartSources. Summary: `convertigo://guides/ngx`.
Previous: `convertigo://guides/ngx/navigation`. Next: `convertigo://guides/ngx/form-submit`.

---

## Forms and input fields

### Structure
Model every form with palette objects, in this order:
1. `ngx.components.UIForm#UIForm` with an `identifier` in lowerCamelCase, for example `loginForm`
2. one `ngx.components.UIDynamicElement#FormItem` (`ion-item`) per field, as a direct child of the form
3. exactly one control inside each `FormItem`: `UIDynamicElement#Input`, `#TextArea`, `#Select`, `#Toggle`, `#CheckBox`, or another Forms palette control
4. the buttons inside the form: `UIDynamicElement#SubmitButton` (and `#ResetButton` when useful), each with a `UIText` child for its visible text; group them in a `Grid` > `GridRow` > `GridCol` when there are several
5. a `UIControlEvent` with `eventName:"onSubmit"` as a child of the form, holding the action chain

Do not put a control directly under the page or a card without its `FormItem`, and do not put several controls in one `FormItem`.

### Labels and placement
- The visible label of a control is its `Label` property. Ionic uses the modern control layout only when `Label` (or an aria label) is set.
- Set `LabelPlacement` explicitly. Use `stacked` (label always above the field) for forms, or `floating` (label moves above on focus or when filled). The default `start` puts the label on the left of the field on the same line and squeezes the input, especially on phones; `fixed` truncates long labels.
- Never add a separate `Label` (`ion-label`) or `UIText` next to a control to act as its label, and never set `Legacy:true`: the control falls back to the legacy markup and the label is misplaced or duplicated.
- `Placeholder` is an example value, not a label: keep the `Label` even when a placeholder is set.
- Use `HelperText` for guidance and `ErrorText` for the validation message; both render under the field.

### Values, types, and validation
- Every control has a `ControlName`: it is the key of the value in the form and usually matches the sequence variable name.
- Set `Type` on text inputs: `email`, `password`, `number`, `tel`, `url`, `date`, `time`, or `search`. Never leave a password field as `text`.
- Mark mandatory fields with `Required`.
- Pass values to the sequence with one `UIControlVariable` per field under the `CallSequenceAction`, sourced from the Form SmartSource of the submitted form.
- Canonical Form SmartSource contract:
  - `filter` is `Form`;
  - `model.data` holds exactly one entry `{"priority":<priority of the UIForm>,"identifier":"<identifier of the UIForm>"}`. `priority` is the `priority` of the `UIForm` node returned by `databaseobject-tree-get`, written as a JSON number. Without it the engine cannot link the SmartSource to its form (its source `form<priority>` is not produced);
  - `path` carries the value path `?.controls?.['<ControlName>']?.value`;
  - `prefix`, `suffix`, and `custom` stay empty and `useCustom` stays `false`.
- Short form: `{"mode":"SOURCE","form":"email"}` on a variable inside the form (its submit event and action) is expanded by the MCP to this shape, with the priority and identifier of the enclosing `UIForm`; a path such as `?.controls?.['email']?.value` works too. Prefer it.
- Do not write this JSON from memory. Read back a valid Form SmartSource of the same project with `databaseobject-tree-get` (`properties:"all"`), or copy one from Studio, and reproduce its exact shape; change only `priority`, `identifier`, and the `ControlName` in `path`. Its shape, for a form whose `UIForm` priority is `1790757878391` and identifier `loginForm`:

```json
{
  "mode": "SOURCE",
  "value": "{\"filter\":\"Form\",\"project\":\"<ProjectName>\",\"input\":\"\",\"model\":{\"data\":[{\"priority\":1790757878391,\"identifier\":\"loginForm\"}],\"path\":\"?.controls?.['email']?.value\",\"prefix\":\"\",\"suffix\":\"\",\"custom\":\"\",\"useCustom\":false}}"
}
```

- After applying it, read the `UIControlVariable` back and check that `model.data[0].priority` equals the `UIForm` priority and that `identifier` and `ControlName` match.
