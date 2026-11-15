# NGX Page

Read when: NGX Page. Summary: `convertigo://guides/http-app`.
Previous: `convertigo://guides/http-app/business-sequence`. Next: `convertigo://guides/http-app/ngx-page-2`.

---

## NGX Page
Mutate `<Project>.Application.NgxApp.pg:Page`, especially `Page.Content`.

The starter visible page QName is known. Do not inspect broad application subtrees such as `<Project>.Application` at depth 2 or deeper just to find the page; those reads can return large style blocks and waste the headless budget. Use targeted reads of `<Project>.Application.NgxApp.pg:Page` or exact objects being edited.

Known classes:
- `ngx.components.UIDynamicElement#Input`, `#Button`, `#List`, `#ListItem`, `#DivTag`, `#Heading1`, `#Heading2`
- `ngx.components.UIText#UIText`
- `ngx.components.UIPageEvent#UIPageEvent`, `ngx.components.UIControlEvent#UIControlEvent`, `ngx.components.UIControlDirective#UIControlDirective`
- `ngx.components.UIDynamicAction#SetLocalAction`, `ngx.components.UIDynamicAction#CallSequenceAction`
- `ngx.components.UIControlVariable#UIControlVariable`

Tree shape:
- `tree` must be one concrete node with `name` and `className`.
- `children` is a sibling of `properties`, never inside `properties`.
- Use stable focused subtrees to reduce turns: page event with its `SetLocalAction` children, button with its `UIText`, click event with `SetLoadingTrue`, `CallSequenceAction` with its same-name `UIControlVariable`, and result list with its `ForEach` directive are acceptable. Create children separately only if nested JSON becomes hard to balance or a write returns partial/skipped properties.
- Do not send an `at:"inside"` write where `tree` contains only a `children` array. Create each child as its own concrete `tree` node with `name` and `className`.
- With `at:"inside"`, `tree` is the child being created, not a wrapper for the parent. For example, target a page with a `UIPageEvent` tree, target a connector with a transaction tree, and target a content node with one visible UI container tree.
- Do not use `at:"self"` on the page just to add a child. It can replace/recreate starter `Header` or `Content` and leave the generated app blank.

### Page Locals
Immediately after deleting starter placeholder content, create these page-enter local initializers. Do not pause for broad page redesign or optional UI choices between starter cleanup and this local initialization.

Create `UIPageEvent` directly under the page, without guessed properties such as `pageEvent`. Add one `SetLocalAction` child per local. Each child must set both `Property` and `Value`; a value without `Property` does not initialize the page local:
- `searchQuery`: `Property={"mode":"PLAIN","value":"searchQuery"}`, `Value={"mode":"SCRIPT","value":"''"}`
- `results`: `Property={"mode":"PLAIN","value":"results"}`, `Value={"mode":"SCRIPT","value":"{items:[], total:0, query:''}"}`
- `loading`: `Property={"mode":"PLAIN","value":"loading"}`, `Value={"mode":"SCRIPT","value":"false"}`
- `error`: `Property={"mode":"PLAIN","value":"error"}`, `Value={"mode":"SCRIPT","value":"false"}`
- `errorMessage`: `Property={"mode":"PLAIN","value":"errorMessage"}`, `Value={"mode":"SCRIPT","value":"''"}`

Use `SCRIPT` mode for all `SetLocalAction.Value` values that are JavaScript literals or expressions: booleans, objects/arrays, empty strings, fallback strings, normalizers, and any expression using `out` or `c8oPage.local`. Do not write these values as `plain:true`, `plain:false`, `plain:{...}`, `plain:''''`, or another `plain:` JavaScript fragment; generated TypeScript can become invalid or store text instead of state. Use single quotes inside empty-string script values. Do not use escaped double quotes such as `"\"\""`.
Do not feed page locals with `SetLocalAction.Value` in `source:` mode. A `SetLocalAction` that stores page state must have `Property` set to the local name in PLAIN mode and `Value` set to a concrete SCRIPT/PLAIN assignment; a Sequence/Local SmartSource value can generate an empty TypeScript expression such as `Value: ,`.
Create the page event with `target:"<Project>.Application.NgxApp.pg:Page"`, `at:"inside"`, and `tree.className:"ngx.components.UIPageEvent#UIPageEvent"`. Do not wrap it inside a `PageComponent` tree.

