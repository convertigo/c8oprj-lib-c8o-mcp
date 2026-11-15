# OAuth / OpenID Connect with lib_OAuth

Read when: OAuth / OpenID Connect with lib_OAuth. Summary: `convertigo://guides/auth`.
Previous: `convertigo://guides/auth/golden-path-every-flow`. Next: `convertigo://guides/auth/email-password-with-lib-usermanager`.

---

## OAuth / OpenID Connect with lib_OAuth

Entry points (the sequence the client-facing business sequence calls):

| Provider | Library sequence | User input | Server-side `StepVariable` values |
|---|---|---|---|
| Google | `lib_OAuth.loginGoogleWithCode` | `code` | `client_id` = `${lib_oauth.google.clientid=...}`, `keySecret` = `${lib_oauth.google.keysecret.secret=...}`, `redirect_uri` = the application redirect symbol |
| GitHub | `lib_OAuth.loginGitHubWithCode` | `code` | `lib_oauth.github.clientid`, `lib_oauth.github.keysecret.secret`, redirect symbol |
| LinkedIn | `lib_OAuth.loginLinkedInWithCode` | `code` | `lib_oauth.linkedin.clientid`, `lib_oauth.linkedin.keysecret.secret`, redirect symbol |
| Azure AD | `lib_OAuth.loginAzureAdWithAccessToken` | `access_token` | `lib_oauth.azuread.clientid`, `lib_oauth.azuread.tenantid` |
| Generic OpenID | `lib_OAuth.loginOpenIDWithAccessToken` | `access_token` | `introspectURL` = `${lib_oauth.openid.instrospect_url=...}` (spelling as declared by the library), `lib_oauth.openid.clientid`, `lib_oauth.openid.clientsecret.secret` |

Rules:
- Never let the client choose `introspectURL`, `client_id`, `redirect_uri`, or `keySecret`. An attacker-controlled introspection or token endpoint can declare any user valid.
- The public client configuration comes from `lib_OAuth.GetOAuthCredentials` (client ids, Azure tenant, OpenID endpoint) or from an application configuration sequence that also issues `state`.
- `lib_OAuth.SignOut` removes the user and the stored provider token; call it with `__disableAutologin=true` and end the session.
- NGX `OAuthLoginAction` (providers `azure`, `linkedin`, `openid`): set `clientid` from the configuration response, `callbackurl` to the registered redirect page, and `loginRequestable` explicitly to the application business sequence. For `openid` the built-in default `lib_OAuth.loginOpenID` does not exist, so the action fails without an explicit `loginRequestable`.
- Provider tokens stay in the session (`oAuthAccessToken`). Do not return them to the client.

## FranceConnect with lib_FranceConnect

`lib_FranceConnect` is the reference pattern for OpenID Connect and shows every check a correct implementation performs:
- `getConfiguration` (Hidden) returns `OpenIDClientID`, `AuthorizeEndPoint`, `RedirectURI`, `Scopes`, `State`, and `Nonce`; `State` and `Nonce` are random and kept in the session.
- `loginWithCode(code, state)` (Hidden) checks and consumes `state`, exchanges the code server side with the client secret, verifies the id_token signature against the provider keys, checks `iss`, `aud`, `exp`, and `nonce`, then authenticates `fc:<sub>`.
- `checkAccessOpenID` (Hidden) restores an existing session; `Logout` (Hidden, authenticated) ends the FranceConnect session.
- The NGX shared component `FranceConnect` drives the flow: it calls `getConfiguration`, redirects to the authorization endpoint, then calls `loginWithCode` with the `code` and `state` read from the callback URL and removes them from the address bar.

Configuration symbols: `lib_franceconnect.clientid`, `lib_franceconnect.scopes`, `lib_franceconnect.authorize`, `lib_franceconnect.tokenendpoint`, `lib_franceconnect.issuer`, `lib_franceconnect.redirecturi`, `lib_franceconnect.endsession`, `lib_franceconnect.postlogouturi`, `lib_FranceConnect.client_secret.secret`, and `lib_FranceConnect.corsOrigin`. The library defaults target the FranceConnect sandbox; production must define every one of them on the engine.

