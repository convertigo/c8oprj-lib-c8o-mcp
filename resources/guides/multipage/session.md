# Session

Read when: Session. Summary: `convertigo://guides/multipage`.
Previous: `convertigo://guides/multipage/business-sequence-shape`. Next: `convertigo://guides/multipage/ngx-pages`.

---

## Session
- `auth_login<...>` (Hidden, anonymous): verifies the identity, then `context.setAuthenticatedUser(<normalized email>)` and returns `{user, home}` where `home` is the page for the role. With `business-sequence-create`: `auth:false`, the identity check in `logic` (it reads the user, or calls the sign-in sequence of a library), and `session:{login:"resp.data.email"}`, a JS expression of the user id. The business sequence opens the session with it only when `logic` and the writes succeed. Without `session` the login answers `success:true` but opens no session, and the app falls back to its entry page at the first protected call. A library sign-in sequence that opens the session itself needs no `session`.
- `auth_getCurrentUser` (Hidden): returns the reloaded user. Either mark it `authenticatedContextRequired` (no session gives `Authentication required`) or keep it anonymous and return a business code such as `UNAUTHENTICATED`; the entry page handles whichever you chose.
- `auth_logout`: clears the session. With `business-sequence-create`: `auth:false` and `session:{logout:true}` (the authenticated user is removed, then the HTTP session ends after the response is written); the client calls it with `noAutoLogin`. Every page of the signed-in app reaches it: `ngx-page-create` kind `logout` (`sequence:"auth_logout"`, `logout:{page:"<login page>", message}`) adds a menu entry that ends the session with `noAutoLogin` and opens the login page as root; it stays the last menu entry (menu pages created later go before it). `project-lint` reports an app that signs users in without it (NGX-NO-LOGOUT) and a logout called without `noAutoLogin` (NGX-LOGOUT-AUTOLOGIN).
- Sessions expire (timeout, engine restart). A call without session to an `authenticatedContextRequired` sequence returns an error whose message is `Authentication required` (no dedicated code); the client treats it exactly like the business code of a lost session (`UNAUTHENTICATED` by default in `business-sequence-create` and `ngx-page-create`, or the code the application's contract names: pass it to both). The SDK auto-login replays the last login first, so a server-side logout is restored silently; test with the application's logout button, then a protected page.
- For a real identity provider, keep this layer and follow `convertigo-authentication`.
