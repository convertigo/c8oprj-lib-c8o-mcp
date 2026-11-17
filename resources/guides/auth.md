# Convertigo Authentication

Authentication is server-side session state, not a page flag. Use standard marketplace libraries for login, SSO or accounts. Keep business sequences authenticated; hidden exposure is not access control. Use lib_UserManager and its _ui_ngx companion for accounts, lib_OAuth for OAuth/OIDC or lib_FranceConnect as appropriate. Generated auth_login accepts any password until replaced: for named accounts with a password (ids as the user gives them, an e-mail only when given) follow the login and roles recipe of convertigo://guides/auth/email-password-with-lib-usermanager, never a password checked in the app. Put secrets in deployment symbols with harmless defaults and visibility=15, never in logs or shipped defaults. Prove unauthorized refusal, login, authorized access and logout; then project-save. To check signed-in pages in a Studio use viewer-sign-in (or browser-verify with signInAs), never a guessed, reset or cracked password.

## Drawers
- `convertigo://guides/auth/overview` — Scope, prerequisites and route selection.
- `convertigo://guides/auth/choosing-a-flow` — Choosing a flow.
- `convertigo://guides/auth/golden-path-every-flow` — Golden path (every flow).
- `convertigo://guides/auth/oauth-openid-connect-with-lib-oauth` — OAuth / OpenID Connect with lib_OAuth.
- `convertigo://guides/auth/email-password-with-lib-usermanager` — Accounts with a password (lib_UserManager): login and roles recipe.
- `convertigo://guides/auth/email-password-with-lib-usermanager-2` — Seed access control, role checks and demo-account proof.
- `convertigo://guides/auth/ngx-client` — NGX client.
- `convertigo://guides/auth/ngx-client-2` — OAuth redirect cleanup, secrets and final proof.
