# Accounts with a password: lib_UserManager

Read when: Accounts with a password (lib_UserManager): login and roles recipe. Summary: `convertigo://guides/auth`.
Previous: `convertigo://guides/auth/oauth-openid-connect-with-lib-oauth`. Next: `convertigo://guides/auth/email-password-with-lib-usermanager-2`.

---

## Accounts with a password: lib_UserManager

Named accounts with a password always use `lib_UserManager`. Never store, hash, or verify passwords in application code or in an application database, even for a demo or when the project data lives in SQL: accounts live in the library, business data stays where it is. A password compared inside `auth_login` (an `IfStep`) is not a login.

Account ids are the ones the user gives (`admin`, `tech`); an e-mail only when the user gives one or the app mails sign-up or reset links. Never invent an address.

### Login and roles recipe
1. **Accounts**: created through the library by an administrator: `CreateAccount` and `ConfirmAccount` (below, or the seed of the next drawer), then `SetUserAttribute` (`attribute` `role`, `value` the role; `Private` and signed in: `requestable-execute` with `authenticatedUser`). A password comes from the user, a seed input or a `.secret` symbol, never a literal in the project.
2. **`auth_login`** (`Hidden`, anonymous, inputs as the login page sends them, here `username`, `password`), in this order:
   - `InputVariablesStep`;
   - `SequenceStep` to `lib_UserManager.SignIn` with `importVariables:true` (step variables `user`, `password`, `rememberMe`), each sourced on the `InputVariablesStep` (`user` on `./username/text()`, `password` on `./password/text()`), or a `SimpleStep` `var user = username;` before the call;
   - `IfExistThenElseStep` on the call's `./document/error`, its then branch an `XMLErrorStep` (one message for every refusal) and a `ReturnStep`. Without it a wrong password answers like a success (`project-lint`: `SEQ-SIGNIN-UNCHECKED`);
   - `SequenceStep` to `lib_UserManager.GetUserAttribute` (`user` sourced as above, `attribute` value `role`): the session is open, it answers `./document/value`;
   - `XMLElementStep`s `user` and `role`, sourced on the `InputVariablesStep`'s `./username/text()` and that call's `./document/value/text()` (a `nodeText` is plain text, never JavaScript).

   `SignIn` opens the session: delete the skeleton's `SetAuthenticatedUser` step.
3. **Each protected sequence** (`Hidden`, `authenticatedContextRequired=true`) checks the role server side before its transaction call (upsert-crud keeps steps there): a `SimpleStep` `var user = String(context.getAuthenticatedUser()); var attribute = "role";`, the `GetUserAttribute` call, a `SimpleSourceStep` (`variableName` `role`) on its `./document/value`, an `IfStep` `String(role) !== "admin"` holding an `XMLErrorStep` and a `ReturnStep`. A button hidden in the page is not access control.
4. **Prove** with `requestable-execute`: the right password answers user and role, a wrong one the error, a protected sequence refuses the other role (`before`: the login).

Same-name rule: a `StepVariable` with no source and no value takes the JavaScript variable of the same name (an input, a `var` of an earlier `SimpleStep`), else its default: `password` finds the input, `user` finds nothing and every login is refused. A different name needs a source or a `var`; a source names a step by its priority, never an input. More: `convertigo://guides/backend/step-taxonomy-that-matters-most-3`.

Prerequisites and what to do when one is missing:
- **FullSync available on the engine.** Accounts are FullSync documents keyed by their account id. If FullSync is not available, stop and tell the user; do not switch to another storage.
- **SMTP relay** (`lib_UserManager.smtp.*` symbols) for the sign-up confirmation and password reset mails; sign-in needs none. Without a relay, still build the mail flows with the library, keep the symbols as placeholders, validate sign-in with a demo account, and report the mail flows as built but unvalidated.
- **Accounts created by an administrator.** `lib_UserManager.AddUser` with `askForPasswordReset=false` creates an already confirmed account without email. It is `Private` and requires an authenticated session, even when called from another sequence, so it belongs to an administration flow of a signed-in user; it cannot create the very first account.

### Demo or first account without SMTP
Use this recipe on a development engine to get a working account without a mail relay. It runs from the Studio with `requestable-execute` and adds nothing to the project:
1. Call the application sign-up business sequence, or `lib_UserManager.CreateAccount`, with the account id (`user`) and password. The library hashes the password and writes the account document, then stores a confirmation key in it before it tries to send the email. Without a relay the call ends with an SMTP error, but the account and its key exist.
2. Read the account: `lib_UserManager.lib_usermanager_fullsync.GetAccountDocument` with `{"_use_docid":"<account id>"}`, and take `account.passwordResetKey`.
3. Confirm it: `lib_UserManager.ConfirmAccount` with `email` = the account id and that `passwordResetKey`. The account becomes `confirmed` and `SignIn` works.

Do not write an account document by hand or compute its password hash: the document and hash formats belong to the library and change with its versions. Do not add an anonymous sequence that creates or confirms accounts to make a demo work. Report the demo account to the user as a development-only step.
