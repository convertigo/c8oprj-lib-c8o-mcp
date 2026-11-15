# Symbols, reusable components and platform completion

Read when: Symbols, reusable components and platform completion. Summary: `convertigo://guides/platform`.
Previous: `convertigo://guides/platform/mandatory-workflow`. Next: `convertigo://guides/platform/recommended-guides-and-recipes`.

---

- name symbols in lower case with dots, prefixed by the project or feature (`myproject.api.url`), and reuse an existing one when `project-list-symbols` already shows it.

#### Marketplace libraries and starter projects
Marketplace projects are not just demos. They are reusable assets:
- libraries
- templates
- shared actions/components
- example project structures

For LLMs, they are one of the fastest ways to avoid reinventing complex Convertigo patterns from scratch.

#### Administration console
The admin side of Convertigo is part of the platform, not an external concern. It controls:
- engine configuration
- symbols
- logging
- FullSync configuration
- mobile builder behavior
- runtime diagnostics

When a task depends on runtime mode, logging, symbols, or builder behavior, admin knowledge is part of the solution.

### How the parts connect
The usual enterprise flow is:
1. a project hosts one or more business sequences
2. those sequences call transactions or helper sequences
3. the sequence maps raw source payloads into a stable public contract
4. the NGX application binds to that stable contract
5. FullSync or URL mapper may expose specialized runtime paths on top of the same core service structure
6. symbols and admin settings control environment-specific behavior

This is why contract-first design matters so much in Convertigo. The connector shape, the frontend, and the deployment/runtime settings are related, but they must not be tightly coupled.

### The Convertigo contract mindset
For most application work, the right contract structure is:
- business sequence or mapped requestable
- stable input names
- stable top-level response fields
- explicit nominal and error shapes
- source-specific complexity hidden below the business sequence

Good pattern:
- UI binds to `items`, `total`, `status`, `error`, or similarly deliberate fields
- SQL rows, raw HTTP payloads, or FullSync document internals stay behind the business sequence

Bad pattern:
- UI binds directly to connector output
- replacing a stub breaks field names
- integration shape leaks into every page

### The "qualified bricks" rule
Convertigo exists to let teams ship applications with maintained platform bricks. That means:
- use built-in steps before custom JavaScript
- use built-in action beans before custom actions
- use palette-backed objects before generic fallback nodes
- use starter projects and libraries before ad-hoc recreation

The LLM should not try to prove creativity by ignoring these bricks. It should prove mastery by composing them well.

### The role of schemas and pickers
Schemas are not secondary. They drive:
- source picker usability
- downstream binding confidence
- contract visibility across backend and frontend

This is why connector and sequence validation often requires:
- a real execute
- a schema refresh or schema-aware readback
- then frontend binding

Skipping this usually creates slow, fragile runs.

### The role of MCP in this platform
The MCP is not the product. It is the manipulation layer for product objects. It should help the agent:
- discover the right object
- apply the right tree mutation
- validate the runtime
- record friction when MCP or docs are insufficient

It should not force the agent to invent Convertigo from scratch.
