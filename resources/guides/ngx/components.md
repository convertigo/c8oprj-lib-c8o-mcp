# Palette component names and visual design

Read when: Palette component names and visual design. Summary: `convertigo://guides/ngx`.
Previous: `convertigo://guides/ngx/palette`. Next: `convertigo://guides/ngx/design`.

---

- If a temporary inline style was used while probing a layout, remove it before completion and replace it with a palette `Attribute` class plus a dedicated `UIStyle` rule.

## NGX palette names

An NGX palette entry is named `ngx.components.<Class>#<logicalId>`, always written in full: `palette-describe` and `databaseobject-tree-apply` do not add the `ngx.components.` prefix.

- `<Class>` is the class of the object: `UIDynamicElement` for Ionic and HTML elements (`#Button`, `#Input`, `#FormItem`, `#Card`, `#List`, `#Heading2`, `#DivTag`), `UIDynamicAction` for actions (`#CallSequenceAction`, `#SetLocalAction`), and a class of its own for the others, whose logical id repeats the class (`ngx.components.UIText#UIText`, `ngx.components.UIControlEvent#UIControlEvent`, `ngx.components.UIStyle#UIStyle`).
- `<logicalId>` is the palette's own id, in PascalCase. It is not the HTML tag (`ion-button`, `ion-card`), it takes no `Ion` or `UI` prefix (`#IonButton`), and it is not a name of your page (`#SearchForm`, `#ResultsList`). An id belongs to one class: `CallSequenceAction` is a `UIDynamicAction`, not a `UIDynamicElement`.
- The exact names come from `palette-list` with an NGX parent as `target` (`<Project>.Application.NgxApp.pg:<Page>`, or the component that will hold the new one) and one word as `filter` (`button`, `card`). Pass the returned `className` unchanged to `palette-describe` and `databaseobject-tree-apply`. Without `target`, `palette-list` lists the built-in entries and the NGX classes without their logical id, which are not palette names.
- When a palette tool answers `Palette entry not found` or `Database object not found`, take one of the close entries it lists, or list the parent once. Do not try another guessed name.

