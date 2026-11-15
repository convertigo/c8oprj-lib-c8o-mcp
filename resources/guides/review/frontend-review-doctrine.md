# Frontend review doctrine

Read when: Frontend review doctrine. Summary: `convertigo://guides/review`.
Previous: `convertigo://guides/review/backend-review-doctrine`. Next: `convertigo://guides/review/static-review-limits`.

---

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
- shared components and project references that nothing uses (`project-lint` reports them: NGX-UNUSED-SHARED-COMPONENT, PROJECT-UNUSED-REFERENCE)
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

