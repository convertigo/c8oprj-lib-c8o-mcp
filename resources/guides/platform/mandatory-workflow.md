# Mandatory workflow

Read when: Mandatory workflow. Summary: `convertigo://guides/platform`.
Previous: `convertigo://guides/platform/overview`. Next: `convertigo://guides/platform/mandatory-workflow-2`.

---

## Mandatory workflow

### What Convertigo is really for
Convertigo is a full-stack application platform. It is not only a source-code generator and it is not only a low-code editor. Its value is that backend services, connectors, data synchronization, deployment, and frontend composition are all built from platform objects that are maintained, qualified, and deployable.

The right mindset is:
- use Convertigo objects and patterns first
- keep public contracts stable
- hide source-specific complexity behind business sequences
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

In most application work, a sequence is the public business sequence that frontend or external callers should consume.

#### URL mapper
The URL mapper exposes REST-style endpoints on top of requestables. It matters when the application must expose clear HTTP APIs to external clients, but it still depends on the same contract discipline: stable business sequence shape first, exposure second.

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

How to introduce a new symbol, without any admin tool:
- reference it **with a default value** wherever a property accepts text: `${my.symbol=defaultValue}`. An empty default is allowed: `${my.symbol=}`.
- the default makes the project load and run as soon as it is saved: no undefined-symbol error, no deployment prerequisite.
- the symbol then appears in the administration console (Symbols), where an admin overrides the value per environment. The project keeps working with its default until they do.
- never reference a bare `${my.symbol}`: it fails wherever the symbol was not created beforehand.
- never put a secret in the default: leave it empty (`${my.api.key=}`) and tell the user which symbol to fill in.
