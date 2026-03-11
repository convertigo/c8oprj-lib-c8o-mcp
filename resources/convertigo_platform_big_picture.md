# Convertigo Platform Big Picture

## When to read this
Read this before serious backend, integration, frontend, FullSync, marketplace, or admin work. This is the guide that explains what Convertigo is, what it optimizes for, and how its major parts fit together.

## What this guide covers
- The Convertigo mindset: qualified platform bricks first, not code generation first.
- The main runtime layers: projects, connectors, transactions, sequences, URL mapper, NGX app, FullSync, symbols, marketplace libraries, and admin settings.
- How backend, integration, and frontend responsibilities should be separated.
- The practical consequences for LLM-driven work.

## Mandatory workflow

### What Convertigo is really for
Convertigo is a full-stack application platform. It is not only a source-code generator and it is not only a low-code editor. Its value is that backend services, connectors, data synchronization, deployment, and frontend composition are all built from platform objects that are maintained, qualified, and deployable.

The right mindset is:
- use Convertigo objects and patterns first
- keep public contracts stable
- hide source-specific complexity behind facades
- use code only where the platform does not already provide a brick

If an agent treats Convertigo as a generic code workspace, it will waste time searching, inventing object trees, and bypassing qualified components. That is exactly what this guide is meant to prevent.

### The major building blocks

#### Project
A Convertigo project is the deployable unit. It can contain:
- backend connectors and transactions
- sequences and URL mapper
- an NGX application
- references to marketplace libraries
- runtime descriptors and generated build material

For MCP work, the project root is the main ownership boundary. Most benchmark and POC work should mutate one project at a time.

#### Connector and transaction
Connectors talk to external systems. Transactions are the concrete operations inside those connectors.

Common connector families:
- SQL
- HTTP
- FullSync / CouchDB
- other specialized enterprise connectors

Important rule:
- connectors and transactions are integration details
- they should usually not define the public application contract directly

#### Sequence
Sequences are backend service flows. They orchestrate:
- input variables
- flow control
- calls to transactions or other sequences
- JSON or XML shaping
- business rules

In most application work, a sequence is the public facade that frontend or external callers should consume.

#### URL mapper
The URL mapper exposes REST-style endpoints on top of requestables. It matters when the application must expose clear HTTP APIs to external clients, but it still depends on the same contract discipline: stable facade shape first, exposure second.

#### NGX application
The NGX application is the low-code frontend tree. It is built from:
- pages
- components
- events
- actions
- bindings
- shared actions and shared components

The correct frontend mindset is:
- palette and bean first
- stable backend contract first
- page state handled through Convertigo action/state patterns
- custom code only when no platform brick exists

#### FullSync / CouchDB
FullSync is not just a database connector. It is the offline and synchronization layer. It changes how the frontend, backend, user identity, ACL, and synchronization strategy fit together. When a use case is offline-first or sync-heavy, FullSync must be treated as a first-class architecture choice, not a late storage detail.

#### Global symbols
Global symbols are runtime configuration values managed by admins and resolved by projects. They are a core part of how Convertigo adapts behavior across environments without hardcoding values. They matter for:
- URLs
- credentials indirection
- feature flags
- runtime modes such as MCP reporting

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
1. a project hosts one or more facade sequences
2. those sequences call transactions or helper sequences
3. the sequence maps raw source payloads into a stable public contract
4. the NGX application binds to that stable contract
5. FullSync or URL mapper may expose specialized runtime paths on top of the same core service structure
6. symbols and admin settings control environment-specific behavior

This is why contract-first design matters so much in Convertigo. The connector shape, the frontend, and the deployment/runtime settings are related, but they must not be tightly coupled.

### The Convertigo contract mindset
For most application work, the right contract structure is:
- facade sequence or mapped requestable
- stable input names
- stable top-level response fields
- explicit nominal and error shapes
- source-specific complexity hidden below the facade

Good pattern:
- UI binds to `items`, `total`, `status`, `error`, or similarly deliberate fields
- SQL rows, raw HTTP payloads, or FullSync document internals stay behind the facade

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

## Recommended guides and recipes

### Read next by task shape
| Task shape | Read next | Why |
| --- | --- | --- |
| First serious session on Convertigo | `convertigo/start@1`, then this guide | Start explains MCP flow, this guide explains the platform itself. |
| Facade or stub sequence | `convertigo/recipe-facade-stub@1`, then `convertigo/backend-sequences@1` | First get the golden path, then the deeper backend rules. |
| HTTP-backed feature | `convertigo/recipe-http-facade@1`, then `convertigo/integration-http@1` | First get the pattern, then the connector subtleties. |
| SQL-backed feature | `convertigo/recipe-sql-crud@1`, then `convertigo/integration-sql@1` | First get the CRUD/facade path, then driver and typing subtleties. |
| NGX data page | `convertigo/recipe-ngx-data-page@1`, then `convertigo/frontend-ngx@1` | First get the page pattern, then deeper UI rules. |
| New project or POC from a starter | `convertigo/recipe-starter-extension@1` | This is the fastest high-signal path for many demos. |

## Recommended MCP tools
- `project-list`
- `marketplace-import`
- `databaseobject-tree-get`
- `databaseobject-tree-apply`
- `palette-list`
- `palette-describe`
- `databaseobject-schema`
- `requestable-execute`
- `project-save`
- `rag-query`

## Anti-patterns / do not do
- Do not treat Convertigo like a blank TypeScript or Java workspace.
- Do not let SQL, HTTP, or FullSync payloads define the public UI contract directly.
- Do not use custom code first when a Convertigo object already exists for the job.
- Do not bind UI to unstable connector internals.
- Do not confuse "project compiles" with "application contract is well designed".
- Do not use RAG as a replacement for the platform mindset; use it to fill documented gaps.

### Common failure modes
- Agents search the tree for too long because they do not know which Convertigo object family should exist.
- Agents recreate structures that marketplace libraries or starter projects already provide.
- Agents wire UI before stabilizing the backend contract.
- Agents validate structure only, not runtime contract behavior.
- Agents write technically valid trees that violate Convertigo's intended object layering.

## Completion checks
- You can explain the role of sequences, transactions, connectors, NGX pages, FullSync, symbols, marketplace libs, and admin settings without mixing them up.
- You can identify which layer should own the public contract for the task.
- You have chosen a recipe before broad exploration when the task matches a known pattern.
- You are using MCP to manipulate Convertigo objects, not to rediscover the platform from first principles.
