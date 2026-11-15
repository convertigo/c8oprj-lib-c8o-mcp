# CRUD payload shapes, build order and application proof

Read when: CRUD payload shapes, build order and application proof. Summary: `convertigo://guides/multipage`.
Previous: `convertigo://guides/multipage/ngx-pages`. Next: `convertigo://guides/multipage/order-of-work`.

---

- The facades of `upsert-crud` answer their data itself, without that envelope: `{rows}` (list), `{row}` (read), `{total}` (count), `{message}` (create, update, delete), and `{error: {code, message}}` when they fail. A page on a facade reads `out?.rows` and tests `out?.error`, never `out?.success`, which a facade never answers (the page would keep no data and show its error over a call that answered). `ngx-page-create` writes the tests for what the called sequence answers and gives it in `answers`; `project-lint` reports a page that reads a key the sequence never answers (`NGX-RESPONSE-CONTRACT`).
- Load page data on `viewEvent` `pageWillEnter`, not the default `pageDidEnter`: checked on a production build, `pageDidEnter` does not fire when the app opens on the page's URL (reload, bookmark, deep link), so the page stays without its locals and data; `pageWillEnter` fires there and on every navigation.
- Protected page: page-enter event with `setLocals` for every local it reads -> `CallSequenceAction` of its data business sequence -> child `SetLocalAction` storing `out` -> under it an `IfAction` on the auth error codes -> `RootPageAction` back to the entry page, and the state updates for the success path. Widgets read the locals with the `local` short form.
- Lists open details with `PushPageAction` `data` holding ids only; the target page copies `c8oPage.navParams?.data?.id` into a local at page enter and calls its business sequence.
- Session-wide values (current user, role, flash message) go in global state with `SetGlobalAction`, read with the `global` short form; it is lost on a browser reload, so the entry page restores it.
- Add one application-level `UIAppEvent` with `appEvent` `onSessionLost`: it clears the session globals and `RootPageAction` to the entry page when the SDK detects a lost session. Keep the per-page check on the auth error codes: the failing call still returns its error to its page.
- Every form follows the Forms section of `convertigo-frontend-ngx`; a `Select` and its options share one value type.
