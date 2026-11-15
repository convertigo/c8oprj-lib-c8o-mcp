# Choosing a flow

Read when: Choosing a flow. Summary: `convertigo://guides/auth`.
Previous: `convertigo://guides/auth/overview`. Next: `convertigo://guides/auth/golden-path-every-flow`.

---

## Choosing a flow

| Need | Implementation |
|---|---|
| Google, GitHub, LinkedIn, Azure AD, generic OpenID provider | `lib_OAuth` |
| FranceConnect | `lib_FranceConnect`, the reference OpenID Connect implementation |
| Email + password accounts (sign-up, confirmation, sign-in, reset) | `lib_UserManager` (accounts stored in FullSync) |
| Corporate directory | `lib_UserManager.SignInLDAPBulk` / `SignInADBulk`, or `LDAPAuthenticationStep` |

Import the library with `marketplace-import` and keep the reference pinned on a released tag or version branch. Do not reference a moving branch with `autoPull=true` for a security library.

Each flow authenticates the session with a provider-prefixed user id: `google:<sub>:<email>`, `azuread:<id>:<upn>`, `openid:<sub>:<name>` for `lib_OAuth`, `fc:<sub>` for FranceConnect, the email for `lib_UserManager`. Base authorization decisions on that id, never on a value sent by the client.

