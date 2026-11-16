# SCSS and TypeScript rules

Read when: SCSS and TypeScript rules. Summary: `convertigo://guides/html-roundtrip`.
Previous: `convertigo://guides/html-roundtrip/html`. Next: `convertigo://guides/html-roundtrip/shared-components`.

---

## SCSS rules
- The scss of a page or shared component is generated from its style components: a `.class<priority> { ... }` block per styled element, then the styles of the page or component. Edit the lines of a block to change that element's style; the other lines keep their text.
- A new `.class<priority> { ... }` rule for an element of the file becomes a style of that element. Other new rules go to the nearest style of the page or component.
- Removing a whole `.class<priority>` block removes the styles of that element.
- A style for every page or component (all card titles, all buttons...) is one rule in `src/app/app.component.scss`, not one `.class<priority>` block per element: edit it inside its `/*Begin_c8o_style:<priority>*/ ... /*End_c8o_style:<priority>*/` blocks, or append plain new rules at its end (never write `Begin_c8o_style`/`End_c8o_style` markers yourself: the import creates the style and the next generation adds its markers), then import it (`ionicTarget` = that file). `src/global.scss` is not imported.

## TypeScript rules
- Only the bodies of the marker blocks are imported: `/*Begin_c8o_PageDeclaration*/ ... /*End_c8o_PageDeclaration*/` and the other `Page*` / `Comp*` markers, plus the `CTS<priority>` blocks of custom actions, and in a shared component the values of its `@Input() Name: any = value` lines, which are the default values of its variables. Other code outside the markers is regenerated and lost.
- In a method, `this` is the page or shared component: `this.getInstance(ToastController)` gives the Ionic controllers already imported by the file.
- Keep every marker line. Changing one block only updates that block.
