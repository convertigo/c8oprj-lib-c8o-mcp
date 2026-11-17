# Seed access control, role checks and demo-account proof

Read when: Seed access control, role checks and demo-account proof. Summary: `convertigo://guides/auth`.
Previous: `convertigo://guides/auth/email-password-with-lib-usermanager`. Next: `convertigo://guides/auth/ngx-client`.

---

## Demo or first account created by a seed
When the user wants the demo account created on a fresh server (a seed run once the project is deployed), the seed makes the library calls of "Demo or first account without SMTP" (`convertigo://guides/auth/email-password-with-lib-usermanager`) and checks each answer:
1. Read the account: `lib_UserManager.lib_usermanager_fullsync.GetAccountDocument` with `_use_docid` = the account id. The account is missing when `./document/couchdb_output/error` exists. An `IfExistThenElseStep` runs its then branch when the node it sources exists: source that error path to create the missing account (sourced on `_id`, it would create only accounts that exist already).
2. `lib_UserManager.CreateAccount` with `user`, `lang`, and `password` from an input of the seed (`visibility` 15, no default) or a `.secret` symbol with an empty default the server defines (`${<app>.demo.password.secret=}`), never a literal; the seed answers an error when it is empty. Check its answer: an `IfExistThenElseStep` on `./document/error` whose then branch ends with an `XMLErrorStep`.
3. Read the account again and source `./document/couchdb_output/account/passwordResetKey/text()` into the `passwordResetKey` variable of `lib_UserManager.ConfirmAccount` (a source: a step is not a JavaScript variable), then check its answer the same way.
4. Give the role with `lib_UserManager.SetUserAttribute`, checking its answer too.
5. Answer what was done (`created` or `existing`) from those answers, never a constant `ok`.

The seed creates accounts: it is never `Public`, nor `Hidden` without authentication. Make it `Private`, run by a scheduler job or by an administrator's sequence (`Hidden`, `authenticatedContextRequired=true`, role checked inside) that calls it, or delete it once the server is initialized. Prove it before giving the credentials to the user: run it where the account does not exist yet (an account created earlier without the seed makes a broken seed look right), then call the app's login sequence with the demo credentials (`requestable-execute`) or sign in with `browser-verify`.

Any deviation from the library is announced to the user and agreed before the project is changed, not justified afterwards.

Flows, in order:

| Step | Library sequence | User input | Server-side values |
|---|---|---|---|
| Sign-up | `lib_UserManager.CreateAccount` | `user` (an e-mail: the confirmation goes to it), `password`, `lang` | `emailSubject`, `emailLogo`, `targetApplicationName` from application symbols |
| Confirmation | `lib_UserManager.ConfirmAccount` (called by `CreateAccount` to send the link) | `email`, `passwordResetKey` from the confirmation link | same email settings |
| Sign-in | `lib_UserManager.SignIn` | `user` (the account id), `password`, optional `rememberMe` | — |
| Reset request | `lib_UserManager.ForgotPassword` (or `ForgotPasswordWithBrand`) | `email` | `emailSubject`, `emailBody`, `emailLogo`, `targetApplicationName` from application symbols |
| Reset | `lib_UserManager.ForgotPassword` | `passwordResetKey`, `newPassword` | — |
| Password change | `lib_UserManager.ModifyPassword` (authenticated) | `password` | `user` from `context.getAuthenticatedUser()`, never from input |
| Sign-out | `lib_UserManager.SignOut` | optional remember-me `token` | removes the remember-me token and the authenticated user; the business sequence still ends the session |

Rules:
- Wrap each step in an application business sequence. The business sequence never forwards `emailSubject`, `emailBody`, `emailLogo`, or `targetApplicationName` from the client: those let anyone send arbitrary content through your mail server.
- The sign-in business sequence returns one generic error for every failure (unknown user, wrong password, unconfirmed account) so the response does not reveal which accounts exist.
- Add a proof-of-work captcha on sign-up and reset requests: `lib_Captcha.altcha_createChallenge(action)` on the client side, then `lib_Captcha.altcha_verifyPayload(payload, expectedAction, preventReplay=true)` in the business sequence before calling `lib_UserManager`.
- Configure the mail relay with the `lib_UserManager.smtp.*` symbols (`server`, `port`, `user`, `sender`, `authtype`).
- Build links sent by email from a base-URL symbol, not from the request host: the host header is client-controlled.
- Schedule `lib_UserManager.RemoveDraftedAccounts` to purge unconfirmed accounts.
- Password hashing and comparison belong to the library. Application code never computes a password hash.
