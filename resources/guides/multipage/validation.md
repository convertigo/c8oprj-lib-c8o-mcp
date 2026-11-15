# Validation

Read when: Validation. Summary: `convertigo://guides/multipage`.
Previous: `convertigo://guides/multipage/order-of-work`.

---

## Validation
- `requestable-execute` runs without an HTTP session: use it for transactions, anonymous business sequences, the rules, and the test sequences of step 5 that open their own session.
- Test session-protected business sequences over HTTP with a cookie jar, one jar per role, on the Studio host name:

```bash
curl -s -b admin.jar -c admin.jar "http://<studio-host>.localhost:<port>/convertigo/projects/<App>/.json" --data-urlencode "__sequence=auth_loginDemo" --data-urlencode "profile=ADMIN"
curl -s -b admin.jar -c admin.jar "http://<studio-host>.localhost:<port>/convertigo/projects/<App>/.json" --data-urlencode "__sequence=order_list"
```

- A seed that creates a demo account is proven by signing in with it after the seed ran where the account did not exist yet (`requestable-execute` of the login sequence, or a verifier path that signs in); report the account only then.
- Before a deployment, run `mobile-builder-build({project})` once the dev build is green: it writes the production build to `DisplayObjects/mobile` (a project deployed without it shows "Not built"). When it answers `unsupported`, tell the user to click Build in the Studio's Build panel before deploying.
- Prove the UI in the viewer returned by `mobile-builder-open` (see its `browserControlHint`) with verifier sub-agents, not click by click: one run per role, whose paths log in with that role and run each specification acceptance criterion, and whose checks include that the role cannot reach another role's page or data.
