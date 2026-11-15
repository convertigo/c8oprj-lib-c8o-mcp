# Email + password with lib_UserManager

Read when: Email + password with lib_UserManager. Summary: `convertigo://guides/auth`.
Previous: `convertigo://guides/auth/oauth-openid-connect-with-lib-oauth`. Next: `convertigo://guides/auth/email-password-with-lib-usermanager-2`.

---

## Email + password with lib_UserManager

Email + password accounts always use `lib_UserManager`. Never store, hash, or verify passwords in application code or in an application database, even for a demo or when the project data lives in SQL: accounts live in the library, business data stays where it is.

Prerequisites and what to do when one is missing:
- **FullSync available on the engine.** Accounts are FullSync documents keyed by email. If FullSync is not available, stop and tell the user; do not switch to another storage.
- **SMTP relay** (`lib_UserManager.smtp.*` symbols). Sign-up confirmation and password reset send emails; sign-in does not. Without a relay, still implement the email flows with the library, keep the symbols as placeholders, validate sign-in with a demo account, and report the email flows as implemented but functionally unvalidated.
- **Accounts created by an administrator.** `lib_UserManager.AddUser` with `askForPasswordReset=false` creates an already confirmed account without email. It is `Private` and requires an authenticated session, even when called from another sequence, so it belongs to an administration flow of a signed-in user; it cannot create the very first account.

### Demo or first account without SMTP
Use this recipe on a development engine to get a working account without a mail relay. It runs from the Studio with `requestable-execute` and adds nothing to the project:
1. Call the application sign-up business sequence, or `lib_UserManager.CreateAccount`, with the demo email and password. The library hashes the password and writes the account document, then stores a confirmation key in it before it tries to send the email. Without a relay the call ends with an SMTP error, but the account and its key exist.
2. Read the account: `lib_UserManager.lib_usermanager_fullsync.GetAccountDocument` with `{"_use_docid":"<email>"}`, and take `account.passwordResetKey`.
3. Confirm it: `lib_UserManager.ConfirmAccount` with `email` and that `passwordResetKey`. The account becomes `confirmed` and `SignIn` works.

Do not write an account document by hand or compute its password hash: the document and hash formats belong to the library and change with its versions. Do not add an anonymous sequence that creates or confirms accounts to make a demo work. Report the demo account to the user as a development-only step.

### Demo or first account created by a seed
When the user wants the demo account created on a fresh server (a seed run once the project is deployed), the seed makes the same library calls and checks each answer:
1. Read the account: `lib_UserManager.lib_usermanager_fullsync.GetAccountDocument` with `_use_docid` = the email. The account is missing when `./document/couchdb_output/error` exists. An `IfExistThenElseStep` runs its then branch when the node it sources exists: source that error path to create the missing account (sourced on `_id`, it would create only accounts that exist already).
2. `lib_UserManager.CreateAccount` with `user`, `lang`, and `password` from an input of the seed (`visibility` 15, no default) or a `.secret` symbol with an empty default the server defines (`${<app>.demo.password.secret=}`), never a literal; the seed answers an error when it is empty. Check its answer: an `IfExistThenElseStep` on `./document/error` whose then branch ends with an `XMLErrorStep`.
3. Read the account again and source `./document/couchdb_output/account/passwordResetKey/text()` into the `passwordResetKey` variable of `lib_UserManager.ConfirmAccount` (a source: a step is not a JavaScript variable), then check its answer the same way.
4. Give the role with `lib_UserManager.SetUserAttribute`, checking its answer too.
5. Answer what was done (`created` or `existing`) from those answers, never a constant `ok`.

