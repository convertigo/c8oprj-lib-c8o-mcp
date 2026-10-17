# Convertigo Recipe: Multi-page App with Roles

## When to read this
Read this before building a new NGX business application from a specification: several pages, a session with roles, server-side access rules, SQL persistence, scheduled or batch logic. It gives the architecture and the order of work that a full V1 build (25 facades, 11 pages, about 2,700 objects) converged on, so you can start writing instead of rediscovering it.

Read `convertigo-backend-sequences` sections 4 and 5, `convertigo-frontend-ngx` (navigation, forms, execution order) and `convertigo-authentication` only for the questions this recipe leaves open.

## Cost rules for a large build
Output tokens are the main cost, far ahead of tool latency. Before writing trees:
- Generate repetitive trees with a script, write the calls array to `<workspace>/_mcp_payloads/<lot>.json` and run `batch-call({callsFile:"_mcp_payloads/<lot>.json"})`. Never print the generated JSON and re-type it as `calls`.
- Use the tree shortcuts: `{"mode":"SOURCE","local":"?.x"}` and `{"mode":"SOURCE","global":"?.x"}` SmartSources, `attributes:{...}` on elements, `setLocals:{...}` on events and actions, `importVariables:true` on `TransactionStep` and `SequenceStep`.
- Keep the default compact responses of `batch-call` and `databaseobject-tree-apply`.

## Architecture
1. Project from `marketplace-import({project:"template_ngxBuilderIonic", importedProjectName:"<App>"})`.
2. One `SqlConnector` for the application database (HSQLDB file database is enough for a V1 and a demo).
3. One `SqlTransaction` per statement: `q_*` for reads, `w_*` for writes. A write that must be atomic across several statements is one transaction with several queries separated by `;` and `autoCommit` `2` (enabled, once at the end). `palette-describe` lists the codes in `allowedValues`.
4. Business rules in one `js/<app>.js` file written with `project-js-set({project:"<App>", ...})`: constants, date and status computations, validation, response builders. Hang everything on one object (`var app = (function () { ... return {...}; })();`).
5. One facade sequence per service, all with the same response contract `{success, data, errors:[{code,message,field}], meta}` emitted by `JsonToXmlStep` steps.
6. Configuration in global symbols `${app.setting=default}`, read from JS; secrets in `.secret` symbols without default.

## Facade sequence shape
Every protected service has the same five parts:

```text
seq <service>                accessibility=Hidden, authenticatedContextRequired=true
  init      SimpleStep       include("js/<app>.js"); read inputs; var sessionEmail = String(context.getAuthenticatedUser());
  callMe    TransactionStep  q_user_by_email, importVariables:true      (uses the JS var sessionEmail)
  srcMe     JsonSourceStep   ["<callMe priority>", "./document/sql_output"] -> meRows
  ...reads  TransactionStep + JsonSourceStep pairs, same pattern
  logic     SimpleStep       resp = app.run(function () { var u = app.currentUser(meRows); check role and perimeter; return app.ok(data); });
  ...writes IfStep resp.success -> TransactionStep w_*, importVariables:true (set the JS vars first)
  out*      JsonToXmlStep    success, data, errors, meta from resp
```

- Check the role and the data perimeter in `logic`, from the user reloaded in the database on every call: a disabled account loses its rights at once. Hiding a button is not access control.
- Refuse out-of-perimeter reads without returning the record (`ACCES_INTERDIT`).
- Variables read in JS are Java strings and rows come from another Rhino scope: see `convertigo-backend-sequences` section 5.

## Session
- `auth_login<...>` (Hidden, anonymous): verifies the identity, then `context.setAuthenticatedUser(<normalized email>)` and returns `{user, home}` where `home` is the page for the role.
- `auth_getCurrentUser` (Hidden, `authenticatedContextRequired`): returns the reloaded user.
- `auth_logout`: clears the session.
- A call without session to an `authenticatedContextRequired` sequence returns an error whose message is `Authentication required`; the client treats it like the business codes `NON_AUTHENTIFIE` or `COMPTE_INACTIF`.
- For a real identity provider, keep this layer and follow `convertigo-authentication`.

## NGX pages
- Entry page (`isRoot`): page-enter event -> `CallSequenceAction` `auth_getCurrentUser` with `noAutoLogin` and `noLoading` -> one `IfAction` per role on `out?.success && out?.data?.user?.role == '<ROLE>'` -> `RootPageAction` to that role's home page. Otherwise it shows the login form or buttons.
- Login: `CallSequenceAction` login with `noAutoLogin` -> child `IfAction` on `out?.success` -> `RootPageAction` home; its Failure handler sets a network error local.
- Protected page: page-enter event with `setLocals` for every local it reads -> `CallSequenceAction` of its data facade -> child `SetLocalAction` storing `out` -> under it an `IfAction` on the auth error codes -> `RootPageAction` back to the entry page, and the state updates for the success path. Widgets read the locals with the `local` short form.
- Lists open details with `PushPageAction` `data` holding ids only; the target page copies `c8oPage.navParams?.data?.id` into a local at page enter and calls its facade.
- Session-wide values (current user, role, flash message) go in global state with `SetGlobalAction`, read with the `global` short form; it is lost on a browser reload, so the entry page restores it.
- Every form follows the Forms section of `convertigo-frontend-ngx`; a `Select` and its options share one value type.

## Order of work
1. Data model and `SqlTransaction`s, seeded with demo data by a reset sequence; prove each with `requestable-execute`.
2. `js/<app>.js` with the rules, then the session facades, then the other facades.
3. Pages, one lot per page through `callsFile`.
4. Scheduled or batch logic as a sequence that takes an injectable date for tests.
5. Non-regression sequences that call the facades and assert the contract.

## Validation
- `requestable-execute` runs without an HTTP session: use it for transactions, anonymous facades and the rules.
- Test session-protected facades over HTTP with a cookie jar, one jar per role, on the Studio host name:

```bash
curl -s -b admin.jar -c admin.jar "http://<studio-host>.localhost:<port>/convertigo/projects/<App>/.json" --data-urlencode "__sequence=auth_loginDemo" --data-urlencode "profile=ADMIN"
curl -s -b admin.jar -c admin.jar "http://<studio-host>.localhost:<port>/convertigo/projects/<App>/.json" --data-urlencode "__sequence=poste_list"
```

- Prove the UI in the viewer returned by `mobile-builder-open` (see its `browserControlHint`): log in with each role, run each specification acceptance criterion, check that a role cannot reach another role's page or data.
</content>
</invoke>
<invoke name="Bash">
<parameter name="command">cd ~/dev/convertigo/studios/Studio_8.4_sandbox/lib_ConvertigoMCP/resources; python3 - <<'EOF'
import json, io
p='resources_index.json'; raw=io.open(p,encoding='utf-8').read(); d=json.loads(raw)
d.append({
 "uri": "convertigo://resources/convertigo-recipe-multipage-app",
 "name": "Convertigo Recipe Multipage App",
 "title": "Convertigo Recipe: Multi-page App with Roles",
 "description": "Architecture and order of work for a specification-driven NGX business app: SQL transactions, shared JS rules, uniform facades with server-side role checks, session, role-based navigation, protected pages, cost rules for large builds, and session-aware validation.",
 "mimeType": "text/markdown",
 "file": "convertigo_recipe_multipage_app.md",
 "guideId": "convertigo/recipe-multipage-app",
 "revision": 1,
 "scopeTags": ["recipe", "ngx", "sql", "session", "roles", "multipage"],
 "prerequisites": ["convertigo/start@1"],
 "recommendedTools": ["marketplace-import", "project-js-set", "batch-call", "databaseobject-tree-apply", "databaseobject-tree-get", "requestable-execute", "mobile-builder-open", "project-save"],
 "promptNames": ["convertigo-backend", "convertigo-frontend-ngx"],
 "guidanceLevel": "recipe",
 "fallbackToRag": False
})
indent = 2
io.open(p,'w',encoding='utf-8').write(json.dumps(d, indent=indent, ensure_ascii=False) + ("\n" if raw.endswith("\n") else ""))
p='convertigo_task_routes.json'; raw=io.open(p,encoding='utf-8').read(); r=json.loads(raw)
ids=[x['id'] for x in r['routes']]; i=ids.index('existing-ngx-ui')
r['routes'].insert(i, {"id":"new-multipage-app","match":"New NGX business application from a specification with several pages, roles or a session, and SQL persistence","required":["convertigo://resources/convertigo-recipe-multipage-app"],"fallback":["convertigo://resources/convertigo-backend-sequences","convertigo://resources/convertigo-frontend-ngx","convertigo://resources/convertigo-authentication"]})
io.open(p,'w',encoding='utf-8').write(json.dumps(r, indent=2, ensure_ascii=False) + ("\n" if raw.endswith("\n") else ""))
EOF
git diff --stat; git diff resources_index.json | head -20; grep -n "guidanceLevel" resources_index.json | awk -F'"' '{print $4}' | sort | uniq -c