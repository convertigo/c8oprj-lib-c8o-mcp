# Authentication libraries and seed safety

Read when: Authentication libraries and seed safety. Summary: `convertigo://guides/common`.
Previous: `convertigo://guides/common/review`. Next: `convertigo://guides/common/viewer`.

---

## Authentication route

- Use this route for login, logout, sign-up, password reset, OAuth, OpenID Connect, FranceConnect, or access control. Reuse the marketplace libraries (`lib_OAuth`, `lib_FranceConnect`, `lib_UserManager`) pinned on a released tag; do not re-implement any of their flows. Email + password accounts always use `lib_UserManager`: never store, hash, or verify passwords in application code, even for a demo. A missing SMTP relay or test provider is not a reason to switch; implement with the library and report what could not be validated. Announce any deviation to the user before changing the project.
- Only `authenticatedContextRequired=true` protects a requestable. Business sequences are `Hidden` with `authenticatedContextRequired=true`; helpers and transactions stay `Private`.
- Symbols are resolved on the server only, never in NGX. The client receives public settings (client id, authorization endpoint, redirect URI, scopes, `state`/`nonce`) from a configuration sequence that never returns a secret or a token.
- Login business sequences pass only user-provided values from the client (authorization `code` and `state`, or email and password). Client ids, redirect URIs, endpoints, secrets, and email content come from symbols on `StepVariable` values, never from client input.
- Logout runs `RemoveAuthenticatedUserStep` then `RemoveSessionStep`, and the client calls it with `__disableAutologin=true`.
- A sequence that creates a demo or first account on a fresh server follows "Demo or first account created by a seed" in `convertigo://guides/auth`: each library answer checked, never public, the sign-in proven.
- Finish with `project-security-audit`; an anonymous configuration or login sequence is recorded with `suppress` and its reason, never left unexplained. Report `grade` and `rawGrade` together. A sequence anyone can call that writes data is fixed, never suppressed: `Private` when only other sequences or the scheduler run it (a scheduled job runs a `Private` sequence), else `authenticatedContextRequired=true` with a role check.
