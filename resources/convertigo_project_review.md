# Convertigo Project Review Guide

## Overview

Use this guide for structured static reviews of Convertigo projects, with a strong focus on:

- backend exposure and access control
- frontend reusability and orchestration quality
- comparison with prior reviews when old reports exist
- client-ready recommendations without repository jargon

This guide is review-only by default. If the user wants code changes, switch explicitly from review to implementation and state the scope change.

## Review modes

Choose the mode first:

- `fresh review`: inspect the current project and produce findings
- `progress review`: start from older reviews or syntheses, then measure what was actually treated and what remains open
- `client synthesis`: produce short priorities and recommendations for a client audience
- `detailed expertise note`: keep the raw findings, evidence, metrics, and rationale

If older reviews exist, prefer `progress review` over a fresh rewrite from scratch.

## Scope framing

Identify the requested scope explicitly:

- backend only
- frontend only
- both, with separate conclusions first and optional merged synthesis second

Use audience terms such as:

- sequence
- transaction
- page
- shared component
- shared action
- backend service
- flow
- exposure
- access control

In client-facing reports, avoid internal implementation jargon such as `YAML`, `_c8oProject`, descriptor, and file-level object paths unless the user explicitly asks for implementation detail.

## Core workflow

1. Identify the project roots and look for prior reviews if the user mentioned them.
2. Inventory the current project before judging it:
   - backend: connectors, transactions, sequences, references
   - frontend: pages, shared components, shared actions, menus, references
3. If prior reviews exist, extract their main recommendations first.
4. Compare old recommendations with the current state:
   - treated
   - partially treated
   - not treated
   - removed because the perimeter changed
5. Build findings from direct evidence, not assumptions.
6. Produce priorities only after the current-state evidence and old-review comparison are clear.

## Backend review doctrine

Review backend projects around these families first:

- authentication and authorization
- administration and back-office entry points
- imports, exports, files, document generation, mail
- generic SQL helpers and dynamic filtering
- requestable transactions
- version governance of the project and its references

### Exposure rules

Reason from effective runtime exposure, not from missing-property wording:

- if `accessibility` is absent, the sequence is effectively `Public`
- if `authenticatedContextRequired` is absent, it is effectively `false`

Use these meanings:

- `Public`: publicly callable and visible in Test Platform
- `Hidden`: callable from the frontend project but not exposed publicly in Test Platform
- `Private`: callable only from another sequence

Review doctrine:

- do not recommend "define accessibility" when the real issue is effective `Public`
- do not recommend "define authenticatedContextRequired" when the real issue is effective `false`
- phrase recommendations as hardening targets: `Public -> Hidden`, `Public -> Private`, `false -> true`

Expected default stance in reviews:

- `Public` should be exceptional and deliberate
- business sequences should usually be `Hidden + authenticatedContextRequired=true`
- internal helpers should usually be `Private`
- transactions that do not need direct requestable exposure should not remain requestable by convenience alone

Before recommending `Private`, map visible callers first:

- frontend calls
- other sequences
- shared actions/components if visible from the frontend

### Backend hot spots

Always check:

- mail flows such as `SmtpStep`
- file and temporary output writes
- fixed export filenames
- dynamic SQL markers and SQL built by concatenation
- generic CRUD or table-driven helpers
- `todo`, `debugger`, `Test_Case`, disabled nodes

### Backend governance rule

Always review branches/tags governance on:

- referenced projects
- the project repository itself

If the project itself is not governed by an identifiable branch/tag strategy, state the consequence explicitly:

- inability to reconstitute a delivered version reliably
- inability to `checkout` and restore a known-good version cleanly

## Frontend review doctrine

Review frontend projects around these families first:

- actual backend sequence usage
- orchestration carried by pages versus shared actions
- shared component reuse and duplication
- fragments
- legacy references and disabled branches
- administration pages
- version governance of the project and its references

### Frontend hot spots

Always check:

- count of shared actions
- count and locations of fragments
- count and locations of `console.log`
- disabled nodes
- pages that centralize too much orchestration
- duplicated shared components or near-clones
- old project names still present in SmartSources or disabled branches

### Frontend doctrine

- fragments are a bad practice unless there is a very narrow justification
- large admin pages are usually an architecture smell
- repeated orchestration chains should become shared actions
- shared components that are generic enough may need to move into a shared library

When a frontend references backend projects or UI libraries, also review governance on:

- the referenced projects
- the frontend project repository itself

If branches/tags are not governed on the project itself, say explicitly that the team cannot reliably `checkout` or restore a specific delivered version.

## V1/V2 comparison rule

When older reviews exist, do not jump directly to new findings.

Structure the review like this:

1. Remind the major V1 recommendations.
2. Measure what changed in the current project.
3. Say what was treated, partially treated, not treated, or removed from the perimeter.
4. Derive the new priorities from that comparison.

Preferred wording:

- `treated`
- `partially treated`
- `not treated`
- `treated on authentication, not treated on exposure`
- `removed from the perimeter`

This comparison rule is especially important for:

- exposure hardening
- shared actions
- fragments
- legacy cleanup
- branches/tags governance

## Priority-building rules

Build priorities from risk and structural impact, not from cosmetic issues.

Typical high-priority candidates:

- backend exposure still effectively `Public`
- missing version governance on the project repo itself
- sensitive admin or batch flows still too exposed
- fragments still structuring the frontend
- absence of shared actions on repeated orchestration

When the user requests client syntheses with `P1`, `P2`, etc.:

- keep priorities short and decision-oriented
- state what must be treated
- explain the consequence in business or delivery terms

## Writing rules

Present findings first and order them by severity.

For each finding, state:

- the affected sequence, transaction, page, or shared component/action
- the observed evidence
- the risk
- the recommended target state

Client-facing writing rules:

- write in a formal expert tone
- do not sound like a generated checklist
- avoid filler
- prefer short, direct conclusions
- talk about sequences, transactions, pages, shared components, shared actions, and delivery governance

If the user asks for both detailed and client-facing material, split them:

- detailed review: evidence, counts, rationale
- client synthesis: short priorities, concrete recommendations, no repository jargon

## Static review limits

Unless the user explicitly asks for runtime validation or edits:

- treat the result as a static review
- do not claim runtime behavior that was not tested
- separate evidence from inference

State the limit clearly:

- `static review only`
- `static review plus runtime checks`
- `static review plus code changes`

## Expected deliverables

Depending on the request, produce one or more of:

- backend detailed review
- frontend detailed review
- backend client synthesis
- frontend client synthesis
- merged client synthesis

When both backend and frontend are reviewed, keep the detailed reviews separate first. Merge only at the synthesis level unless the user explicitly wants one combined expertise report.

When the user wants files generated, prefer stable names so later V2/V3 passes stay comparable.

Detailed reviews:

- `revue_securite_qualite.md` for backend detailed review
- `revue_frontend_securite_qualite.md` for frontend detailed review

Client syntheses:

- `synthese_client_backend_preconisations.md`
- `synthese_client_frontend_preconisations.md`

When a previous generation already exists and the new pass is explicitly a new version, prefer:

- `*_v2.md`
- `*_v3.md`

If PDF or DOCX exports are requested, keep the same base name and change only the extension.
