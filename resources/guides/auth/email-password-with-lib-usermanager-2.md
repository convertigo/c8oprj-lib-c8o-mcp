# Seed access control, role checks and demo-account proof

Read when: Seed access control, role checks and demo-account proof. Summary: `convertigo://guides/auth`.
Previous: `convertigo://guides/auth/email-password-with-lib-usermanager`. Next: `convertigo://guides/auth/ngx-client`.

---

The seed creates accounts: it is never `Public`, nor `Hidden` without authentication. Make it `Private`, run by a scheduler job or by an administrator's sequence (`Hidden`, `authenticatedContextRequired=true`, role checked inside) that calls it, or delete it once the server is initialized. Prove it before giving the credentials to the user: run it where the account does not exist yet (an account created earlier with the recipe above makes a broken seed look right), then call the app's login sequence with the demo credentials (`requestable-execute`) or sign in with `browser-verify`.

Any deviation from the library is announced to the user and agreed before the project is changed, not justified afterwards.

Flows, in order:

| Step | Library sequence | User input | Server-side values |
|---|---|---|---|
| Sign-up | `lib_UserManager.CreateAccount` | `user` (email), `password`, `lang` | `emailSubject`, `emailLogo`, `targetApplicationName` from application symbols |
| Confirmation | `lib_UserManager.ConfirmAccount` (called by `CreateAccount` to send the link) | `email`, `passwordResetKey` from the confirmation link | same email settings |
| Sign-in | `lib_UserManager.SignIn` | `user`, `password`, optional `rememberMe` | — |
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
