# Overview

Read when: Overview. Summary: `convertigo://guides/review`.
Next: `convertigo://guides/review/backend-review-doctrine`.

---

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
   For a security review, run `project-security-audit({project})` first: it returns sourced findings, a 0-100 score and an A-F grade, and never returns secret values. Verify each finding before reporting it, and pass risks the user accepts (for example authentication checked in JavaScript) through `suppress` with a reason. Report `grade` and `rawGrade` together: `grade` leaves the accepted risks out. A finding the audit refuses to suppress (`suppressRefused`: a requestable anyone can call that writes data) is a defect to fix, not a risk to accept, and it caps the grade at B (`gradeCappedBy: refused-suppression`); such a finding left without a suppression caps it at B too (`gradeCappedBy: anonymous-write`, the finding's `anonymousWrite` says what it writes, through a library included).
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
