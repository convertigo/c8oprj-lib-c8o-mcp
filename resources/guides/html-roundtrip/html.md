# HTML rules: anchors, attributes, directives and events

Read when: HTML rules: anchors, attributes, directives and events. Summary: `convertigo://guides/html-roundtrip`.
Previous: `convertigo://guides/html-roundtrip/workflow`. Next: `convertigo://guides/html-roundtrip/scss-ts`.

---

## HTML rules
- Every generated element carries a `class<priority>` token (`class="title class1757510317683"`): it is the anchor of its Convertigo object. Keep it on the same element, never copy it to another element, never invent one, never move it. A token appears at most once in a file.
- Change an existing element in place: edit its attributes, classes and text, keep its tag when it is a palette tag. Add semantic classes next to the anchor (`class="crm-card class1776709259833"`).
- New elements have no anchor: the import creates their components and the next generation adds their anchors. An existing element can be wrapped in a new one (a row to put a button next to a title): its component moves inside, with its events and actions.
- Removing an element removes its component and its children.
- Attributes of palette components map to their properties: `fill="outline"` sets the `IonFill` property of an `ion-button`, removing the attribute unsets it. Write them as the Ionic docs do: a text as is (`header="About"`, `message="It's ready."`), an expression, a boolean or an array bound (`[buttons]="['OK']"`, `[backdropDismiss]="false"`). Classes rendered by a property (`ion-padding` of `ion-content`) stay in that property: removing the class unsets it, other classes go to the element's class attribute.
- Texts: write plain text or `{{ expression }}`; `{{ 'key' | translate }}` becomes a translated text.
- Structural directives: use `*ngIf`, `*ngFor`, `[ngSwitch]` / `*ngSwitchCase` / `*ngSwitchDefault` (on the element or on an `ng-container`). The block syntax (`@if`, `@for`, `@switch`) is not imported.
- Events: write the behaviour as a method in the `/*Begin_c8o_PageFunction*/` block of the page ts (`CompFunction` for a shared component) and call it from the html: `(click)="exportList($event)"`, `(didDismiss)="choose($event)"`, with `$event` or literals as arguments. The import creates the event and an action that calls the method. Keep the generated `ETS<priority>(...)` calls of existing events as they are: replacing one by a method call replaces its actions.
- Do not fake a capability in plain HTML/CSS (charts, maps, editors, calendars...) when a palette or marketplace component provides it: mount the real component.
