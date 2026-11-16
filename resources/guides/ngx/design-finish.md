# Visual finishing pass of the pages

Read when: Visual finishing pass of the pages. Summary: `convertigo://guides/ngx`.
Previous: `convertigo://guides/ngx/design`. Next: `convertigo://guides/ngx/presentation`.

---

## Finishing pass

When the pages work (their paths passed `browser-verify`), give the app the look of a hand-made one: `browser-verify` with `design: true`, `url` (the `viewerHomeUrl`), `signInAs` (the demo account) and `pages`, the addresses of the pages users see most (6 by default, 8 at most: the dashboard, each list, one detail, one form). Each page is opened at 1280 and 390 px, measured (contrast, overflow and tap targets at the phone width, raw values and ISO dates, empty lists without an empty state, two titles, left edges, the same font, title size, radius and button color as the other pages) and judged on six points: spacing, hierarchy, states, contrast, consistency, phone. It answers `design.toFix`, major points first, each with its fix, and `usage` (about 0.005 $ and 25 s a page).

- Fix the major points, and the minor ones a page option or a token fixes: `ngx-page-create` options (re-create the page: `subtitle`, `actions`, `columns` with `format`, `hint`, `chart: "bars"`, `wide`), `ngx-theme-apply` (`preset`, `primary`, `sideMenu`), or a rule of the app's `AppLayout` style that reads the tokens. Never fix one app's data in a shared rule.
- Then run it once more on the pages that failed only. Two rounds per project: a third answers `skipped` unless the user asked for another pass (`userAsked: true`). Say in the final answer what is left.
- Skip it when the user says so (no design pass, no finishing), for a change that touches no page, and when it answers `skipped` (the global symbol `convertigo.mcp.design.review=off` turns it off for a Studio or a server).
