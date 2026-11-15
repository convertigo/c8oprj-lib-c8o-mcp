# Same-rail repairs and HTTP proof failures

Read when: Same-rail repairs and HTTP proof failures. Summary: `convertigo://guides/http-app`.
Previous: `convertigo://guides/http-app/http-backend-2`. Next: `convertigo://guides/http-app/business-sequence`.

---

6. If a direct HTTP proof returns HTML, documentation, login content, CSS/JavaScript, an error page, DNS/TLS/timeout failure, missing credentials, quota/auth messages, or metadata-only output for an expected JSON/XML API, perform at most one same-rail repair using readback evidence. Then rerun proof. If the second proof has the same payload class or transport failure, stop toggling settings and report proof incomplete.
   Do not repair HTML/CSS/documentation output by adding guessed HTTP headers or mutating `httpParameters`. Fix `server`, explicit `baseDir`, `subDir`, and `RequestableHttpVariable.httpName` first. Only set header/list properties when the provider contract explicitly requires them and readback has proven the exact property shape.
7. In headless automation runs, do not switch provider after metadata-only, empty-text, malformed-path, HTML/error-page, DNS/TLS/timeout, missing-credential, quota/auth, or provider 4xx/5xx proof failures. Fix the same connector/transaction shape or mark the live proof incomplete. Do not try static files, raw source hosts, generic search/lookup providers, documentation hosts, encyclopedia/entity search, or another API family as a fallback. Switch provider only when the provider returns an explicit application/domain error proving that endpoint cannot satisfy the requested contract; if you switch, first stop and explain the incomplete proof instead of continuing generation.
8. Once an `HttpConnector` exists, do not patch its `server` property to a different hostname. A `databaseobject-tree-apply` self-merge that changes `server` is a provider switch, not a same-rail repair. If the hostname was wrong or does not resolve, report the live proof incomplete instead of continuing with another host.
9. Do not call `Convertigo_log-view` in this fast path. Use direct `requestable-execute` proof and targeted object readback; broad or requestable-scoped logs consume the run budget and are not needed for the proof criteria.
10. A direct HTTP proof that only succeeds when callers supply fixed technical variables such as `format`, `mode`, `action`, `type`, `limit`, `fields`, or headers is not yet a clean public contract. Put such constants behind backend defaults only after the public user-facing variable has already proven records, otherwise stop and report proof incomplete.

