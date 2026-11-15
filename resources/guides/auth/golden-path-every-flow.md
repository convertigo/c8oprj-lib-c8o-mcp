# Golden path (every flow)

Read when: Golden path (every flow). Summary: `convertigo://guides/auth`.
Previous: `convertigo://guides/auth/choosing-a-flow`. Next: `convertigo://guides/auth/oauth-openid-connect-with-lib-oauth`.

---

## Golden path (every flow)

1. **Import the library, pinned.** `marketplace-list` to find it, `marketplace-describe` to read its setup, then `marketplace-import({project, targetProject})`, which adds the reference in your project. Check the symbols it expects with `project-list-symbols`.
2. **Configure with symbols, server side.** Client ids, endpoints, redirect URIs, scopes, and SMTP settings are symbols. Secrets use a name ending with `.secret` and no default value that holds the real secret.
3. **Expose public configuration through a configuration sequence.** Symbols are resolved on the server only; NGX pages and TypeScript never see them. The client gets `client_id`, the authorization endpoint, the redirect URI, the scopes, and a per-login `state`/`nonce` from a configuration sequence, as the libraries already do (`lib_FranceConnect.getConfiguration`, `lib_OAuth.GetOAuthCredentials`). Rules for that sequence:
   - `Hidden`, anonymous by design (the client calls it before login). Record its `EXP-02` audit finding with `suppress` and the reason.
   - It writes no data: the audit refuses to suppress an exposure finding on a requestable anyone can call that writes data.
   - It returns public values only. Never a `.secret` symbol, never a token.
   - It generates `state` and `nonce` with `SecureRandom` and keeps them in the session; the login sequence checks them once and removes them.
   - Never hard-code a client id or an identity-provider URL in NGX code.
4. **Log in through application business sequences.** Create `Hidden` sequences in the application project (for example `auth_loginGoogle`, `auth_signIn`) that call the library with `SequenceStep` and `StepVariable` children:
   - only the values that genuinely come from the user reach the library from the client: the authorization `code` and `state`, or the email and password;
   - every other library input is set on the `StepVariable` from a symbol: `client_id`, `redirect_uri`, `keySecret`, endpoints, email subject, logo, and application name;
   - the business sequence does not declare those as its own `RequestableVariable`, so the client cannot override them.
   - for a login checked by the application itself (its own user table or a library sequence that does not open the session), `business-sequence-create` with `auth:false` and `session:{login:"resp.data.email"}` opens the session when `logic` succeeds; without that option nothing calls `context.setAuthenticatedUser`.
5. **Protect business sequences.** Every business sequence is `Hidden` with `authenticatedContextRequired=true`. Helpers and every transaction stay `Private`.
6. **Log out by ending the session.** A logout sequence runs `RemoveAuthenticatedUserStep` then `RemoveSessionStep` (`business-sequence-create` with `session:{logout:true}` builds it). The client calls it with `__disableAutologin=true`; otherwise the SDK replays the last successful login request as soon as the session is lost.
