# Mutation failures and functional browser proof

Read when: Mutation failures and functional browser proof. Summary: `convertigo://guides/common`.
Previous: `convertigo://guides/common/reveal`. Next: `convertigo://guides/common/proof-results`.

---

## Validation and evidence

- Treat `status:"partial"`, skipped properties, stale incompatible properties, failed operations, child patch errors, failed palette creation, and failed readback as failures to repair before continuing. If a partial create touched the UI tree, read back the affected root and delete or recreate the malformed child before adding more objects.
- Keep structural proof compact: normally `databaseobject-tree-get({target:"<changed-root>",childrenDepth:2,properties:"changed"})`. Do not combine a deep `properties:"all"` read with a waited builder call in one result.
- Validate backend behavior with `requestable-execute`, `crud-proof`, or `crud-status`, then persist once with `project-save` after a successful targeted readback.
- A browser proof should evaluate all relevant acceptance criteria together when practical: visible content, layout and style, interaction or timed state, and console/runtime errors.
- Every sequence, transaction, connector and page you create gets a one-line comment saying what it does, and the application keeps none of the starter's own pages, nor a shared component or a project reference that nothing uses (a library referenced and not used: remove the reference): `project-lint` reports them (DOC-NO-COMMENT, NGX-STARTER-PAGE, NGX-UNUSED-SHARED-COMPONENT, PROJECT-UNUSED-REFERENCE).
- Run `project-lint({project})` before each Mobile Builder build and before calling a lot done. In one read-only pass it reports the pitfalls that break an app silently or at run time (SQL literals, date units and lists; sequence variables read through context; writes whose errors are never read; c8oPage in templates; scope in custom actions; glued texts; i18n keys missing from the i18n files; a CSV, grid, chart package or password check built by hand where a library provides it, LIB-*). It also has a gateway model proofread every text the app shows and each `i18n/<lang>.json` file, in whatever language they are written (spelling, accents, a string in the wrong language): those come as `TEXT-REVIEW` warnings with the corrected text. Fix every `error` finding, and each `warning` unless you can say why it does not apply.
- Delegate each functional and visual browser proof to a verifier sub-agent, `subagent-run({profile:"verifier", task, inputs:{url, paths, checks, hints}})` (`browser-verify` is the same with flat arguments), instead of driving the page yourself: every browser tool call costs a full model step on your whole context (run 5 spent about 230 single Playwright calls on one proof). The verifier has a vision model and a small context of its own: it drives the same Studio viewer, looks at its screenshots and returns a short report. Call it once `mobile-builder-open` reports `browserControlReady:true`, with:
  - `url`: the `viewerHomeUrl`, or the page the paths start from;
  - `paths`: one entry per path, in plain language, as a user would do it, with the values to type and the result to read, for example `Log in as rpca.demo / demo, tick Poste Accueil and Poste RH, click Déclarer, read the status of both posts`;
  - `checks`: the acceptance criteria to report one by one, with the exact expected texts or values, for example `Both declared posts show the status "À jour"`;
  - `hints`: what the sub-agent cannot guess: demo accounts and passwords, expected values, what you just changed.
  Put all the paths of a lot in one verification (up to 8); it takes about 20 s to 3 min. A call answers within 45 s: when it answers `status:"running"`, call the tool again with the id alone (`runId`, or `verificationId` for `browser-verify`) until `status:"finished"` brings the report, never a shell loop or a sleep on its folder; never start another verification meanwhile. It checks visual defects on every page it shows (glued texts, texts hidden under another element, overlaps, cut text, missing accents, empty areas) without being asked.
