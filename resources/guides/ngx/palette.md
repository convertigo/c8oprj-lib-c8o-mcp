# Palette structure and source-object rules

Read when: Palette structure and source-object rules. Summary: `convertigo://guides/ngx`.
Previous: `convertigo://guides/ngx/orientation`. Next: `convertigo://guides/ngx/components`.

---

## Palette-first authoring rules

- Think of every NGX application as a normal Ionic / Angular application represented by the Convertigo object tree.
- For each Angular or Ionic component, use the matching Convertigo palette component first.
- Prefer palette-backed NGX components, events, actions, bindings, forms, lists, cards, tabs, menus, and Ionic controls over hand-written templates.
- Never use `UICustom` fragments for application UI. Treat fragments as forbidden for normal UI authoring, not as a shortcut.
- If you are about to create `ngx.components.UICustom#UICustom` with a large `htmlTemplate` for a data page, stop and redesign the tree with palette objects. A compiling large fragment is still a failed NGX delivery when palette components can express the page.
- Do not use a `UICustom` fragment as the main renderer even when the backend call itself is wired through `CallSequenceAction`. A fragment that contains the input, labels, loading notes, empty/error notes, list, or repeated result markup is still the primary page implementation and is non-compliant.
- If you already created such a fragment while probing, remove it before completion and replace it with visible palette objects. Do not keep it as a renderer and claim completion on builder proof alone.
- Treat `palette-describe` text for `UICustom#UICustom` as generic platform documentation, not permission for normal app delivery. For feature pages, use `UIDynamicElement`, `UIElement`, `UIText`, `UIAttribute`, `UIStyle`, `UIControlEvent`, `UIDynamicAction`, and `UIControlDirective` instead.
- A page that calls backend data from `scriptContent` with `this.c8o.callJson(...)` is not palette-first. Move the backend call to a button/page event containing `UIDynamicAction#CallSequenceAction` and pass variables with `UIControlVariable`.
- A page that calls backend data from `scriptContent` with `this.c8o.callJsonObject(...).async()` has the same failure mode and is also non-compliant. The page may contain small local helper methods, but backend execution belongs in the NGX action chain.
- Use generic `Div`, `Tag`, or other low-level HTML palette entries only as a last resort when no specific Ionic / Angular palette component exists for the need. Plain HTML containers such as `section`, `div`, `p`, `h1`, or `span` are acceptable for layout and copy; Ionic controls such as cards, inputs, lists, labels, buttons, progress bars, select controls, and items must use their `UIDynamicElement#...` palette entries when available.
- Keep UI structure visible in the tree: page layout, loading, empty, error, retry, forms, and action paths must be modeled with palette objects whenever possible.
- If a needed component seems missing, call `palette-list` / `palette-describe` on the intended parent before falling back to lower-level HTML nodes.
- Do not put business logic, filtering, mapping, set-difference computation, or complex Angular expressions in Convertigo pages. Pages should bind to backend-prepared fields with simple property paths or simple method-free expressions.
- Prepare filtered lists, candidate lists, relation summaries, and other view models in backend business sequences. The NGX page should consume those prepared fields directly, especially for `ForEach` sources and select options.
- Apply CSS classes through the palette `Attribute` object with `attrName=class`; do not use inline `style` attributes for normal styling.
- Put additional global CSS in a new dedicated `UIStyle` object under the NGX app, with a clear name for the feature or concern. Do not append unrelated feature CSS to an existing generic `Style` object.
- Keep page-specific layout CSS in a page-level `UIStyle` only when it belongs only to that page; reusable classes and cross-page styling belong in their own app-level `UIStyle` object.
- Prefer stable class names such as `admin-list-item` applied through `Attribute` objects over broad selectors that affect every Ionic component of the same type.
