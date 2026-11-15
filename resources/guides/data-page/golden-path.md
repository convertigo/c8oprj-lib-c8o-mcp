# Golden path and palette-first state

Read when: Golden path and palette-first state. Summary: `convertigo://guides/data-page`.
Previous: `convertigo://guides/data-page/orientation`. Next: `convertigo://guides/data-page/input-binding`.

---

## Mandatory workflow

### Golden path
1. Confirm the backend business sequence contract first.
   - For HTTP-backed pages, the business sequence contract must expose the application data the page will bind to, not only a raw `TransactionStep` subtree. If the UI is expected to render a list, prove a shaped list contract such as `{items:[...], total, query}` or an equivalent neutral shape before creating result UI.
2. Inspect the target page subtree and identify the actual visible entry page.
3. On starter-derived apps, replace the dominant starter body on the visible entry page first. In the default starter this is usually `Application.NgxApp.pg:Page` and `Page.Content`. Do not keep `WelcomeCard` or equivalent demo content as the main visible body while other work continues.
4. The first visible pass must already make the real entry page look alive:
   - title/header changed
   - starter body replaced
   - one visible feature section exists
   - loading, empty, or retry states are visible
   - one contract-shaped slot exists for the eventual live count/item binding
5. If stable business sequence proof already exists, bind one real count, value, or repeated item in that first pass. Otherwise treat this as `phase 1` shell progress and return for a second binding pass after backend proof. A raw HTTP transaction response shown only under `transaction.document` is not stable business sequence proof for an NGX page unless the page explicitly targets that raw diagnostic contract.
6. Use the palette or canonical tree shapes to create:
   - visible feature shell that replaces the default starter content early
   - first visible write on the actual visible entry page; for starter-derived projects this usually means replacing the dominant body under `Page.Content`
   - page load event
   - state flags
   - success container
   - empty state
   - error state
   - retry action
5. Use `CallSequenceAction` or the equivalent built-in action for backend calls.
6. For external HTTP/SQL/service data, the page calls only a stable Convertigo business sequence through a palette action chain. Do not use browser `fetch`, direct `this.c8o.callJson()`, `this.c8o.callJsonObject(...).async()`, or custom action transport for normal data loading.
7. Prefer `SC` source bindings for data already available from the business sequence/action output, current iterator scope, forms, or global/page context. Use `TS` only for small local expressions that are not cleanly sourceable.
8. Bind only to stable business sequence fields. Do not make the page responsible for discovering or reshaping raw HTTP transaction internals.
9. Keep the main page body on native NGX objects. Do not collapse a data page into one large `UICustom` / `htmlTemplate` fragment.
10. Model lists with `UIControlDirective#UIControlDirective` (`directiveName=ForEach`) instead of raw `*ngFor` attributes whenever child actions, repeated controls, or repeated business sequence data are involved.
11. Under a palette `ForEach`, pass iterator values through `scope.<itemName>` in child action variables. A generated action variable such as `vars:{record: record}` means the loop/action scope was modeled incorrectly. Bind the list source itself from page-local state, for example `directiveSource` on Local `?.results?.items`, but do not bind repeated row fields as fake page locals. Row fields belong to the current iterator item, for example `record.name` / `record.status`, or to a selected item local such as `selectedRecord.name`. If child text uses `record.*`, the `ForEach` must set `directiveItemName: record` and usually `directiveIndexName: recordIndex`; otherwise generated Angular will use an auto item variable and `record.name` will not resolve.
12. For Angular property bindings such as `[value]`, `[disabled]`, and `[selectedText]`, use `SC` when sourceable or `TS` for short local expressions. Plain/TX mode is wrong if it produces generated output like `[value]="'searchQuery'"` or `disabled="{{loading}}"`.
