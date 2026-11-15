# Noncompliant calls and page navigation

Read when: Noncompliant calls and page navigation. Summary: `convertigo://guides/ngx`.
Previous: `convertigo://guides/ngx/http-results`. Next: `convertigo://guides/ngx/forms`.

---

- `scriptContent` method calls `this.c8o.callJson(...)`
- `scriptContent` method calls `this.c8o.callJsonObject(...).async()`
- `Begin_c8o_PageDeclaration` declares feature state such as `searchQuery`, `results`, `total`, `loading`, `error`, or `searched`
- page locals are not initialized in a page-enter `UIPageEvent` with `SetLocalAction` before being read by widgets/directives
- the search input is raw template markup with `[(ngModel)]="searchQuery"` or `[value]="searchQuery"` instead of a palette Input Binding/`DoubleBinding` sourced from Local `?.searchQuery`
- a `UIControlVariable` for `query` or another search/filter parameter reads from `document.querySelector(...)`, `event.detail.value`, or another DOM/event script instead of the Local `?.searchQuery` SmartSource
- a `UIControlVariable` for `query` or another search/filter parameter reads from `script:this.local?.searchQuery` instead of the Local `?.searchQuery` SmartSource
- a `CallSequenceAction` has an empty `requestable` because the tree mutation used `Sequence` instead of `requestable`
- a `UIControlVariable` is a sibling of `CallSequenceAction` rather than a child of it
- a custom action writes `page.local.*` or `this.local.*` directly instead of letting `SetLocalAction` own page-local state
- the page writes `results` but has no visible Local SmartSource/source read of `?.results`, no result row/detail fields, or only an empty/generic result placeholder
- the page writes `results` by guessing over raw `out.transaction.document` while the business sequence has no shaped `items`/record contract for the page to consume
- one `UICustom` / `htmlTemplate` contains the input, labels, loading notes, empty/error notes, button, list, or Angular directives, even if the `CallSequenceAction` is a child of that fragment
- raw `*ngFor` / `*ngIf` are embedded in a fragment instead of modeled with palette directives or components
- backend URL or HTTP transport appears anywhere in the NGX page

### Navigation with parameters and global state
Three scopes, one job each: page locals for the state of one page, navigation `data` for the id a page is opened with, global state for values shared by every page (current user, role, flags).

Opening a page with data:
- `PushPageAction` (or `RootPageAction`) with `page` set to the target page and `data` in SCRIPT mode holding an object of plain values, for example `{"mode":"SCRIPT","value":"{orderId: scope.order.id}"}` under a `ForEach` whose item is `order`
- `data` travels as URL route and query parameters: every value arrives as a string and nested objects are lost. Pass ids, convert them (`Number(...)`) where needed, and reload the record on the target page

Reading it on the target page:
- in the page-enter `UIPageEvent`, a `SetLocalAction` copies the value into a local, with `Value` in SCRIPT mode: `c8oPage.navParams?.data?.orderId`
- then widgets, directives and `UIControlVariable` read that local through the Local SmartSource, as everywhere else
- write `c8oPage.navParams`, not `this.navParams`: `this` is not the page in every SmartType context (templates in particular)

Global state:
- `SetGlobalAction` (`Property`, `Value`) writes `router.sharedObject[Property]`; action SCRIPT values read the same object as `c8oPage.global?.<property>`
- it lives in memory: it survives navigation, not a browser reload; restore it at startup (for example from the session sequence) if the app needs it after a reload
- templates read it with a Global SmartSource; write it as the short form `{"mode":"SOURCE","global":"?.currentUser?.role"}`, which the MCP expands to this tree-apply shape:

```json
{
  "mode": "SOURCE",
  "value": "{\"filter\":\"Global\",\"project\":\"<ProjectName>\",\"input\":\"\",\"model\":{\"data\":[{\"sharedObject\":\"router.sharedObject\"}],\"path\":\"?.currentUser?.role\",\"prefix\":\"\",\"suffix\":\"\",\"custom\":\"\",\"useCustom\":false}}"
}
```

Common trap:
- putting a whole record in `data` and binding the target page on it: it arrives as `"[object Object]"`
