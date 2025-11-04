# Convertigo MCP Tooling Checklist

This file tracks the low-level Convertigo sequences (“tools”) that power the MCP
server. Each entry should be backed by a sequence in `ConvertigoMCP` following
the naming convention `CategoryVerbAction` (CamelCase, no spaces). Check the box
once the sequence exists, emits JSON-only output, and is wired into the MCP
tool catalog.

## Meta / Introspection
- [ ] `MetaListPalette` — list database objects that can be created at root or under a given parent (filterable by allowed types).
- [x] `DatabaseObjectPropertiesSet` — update properties on a database object by QName.
- [x] `DatabaseObjectPropertiesGet` — read metadata and property values for a database object identified by QName.
- [ ] `MetaDescribeObject` — return metadata for a specific database object (type, path, properties).

## Project Discovery
- [ ] `ProjectDescribeTree` — breadth-limited traversal of a project’s connectors, sequences, pages, and steps.
- [ ] `ProjectFetchSource` — fetch the serialized YAML of a database object with checksum/hash.
- [ ] `ProjectSearch` — locate objects/steps by name, comment, or smart source pattern.
- [ ] `ProjectListSymbols` — expose environment and symbol definitions with visibility flags.

## Project Authoring (Mutations)
- [ ] `ProjectEnsureSequence` — create or update a sequence scaffold (comment, accessibility, variables).
- [ ] `ProjectAddStep` — append a child step under a parent path with specified bean/config.
- [ ] `ProjectUpdateProperty` — change a property or smart source on an existing database object.
- [ ] `ProjectBindSource` — update step bindings (JSON field, mobile smart source, etc.).
- [ ] `ProjectRemoveObject` — delete a database object safely with dependency checks.
- [ ] `ProjectCommitMutation` — export/persist project after pending mutations (supports dry run reporting).

## Execution & Validation
- [ ] `InvokeRequestable` — execute a sequence/transaction with input variables, returning payload and logs.
- [ ] `InvokeRunTestCase` — trigger a stored TestCase and report assertion results.
- [ ] `InvokeExportProject` — force project export and return file paths/checksums.

## Monitoring / Admin
- [x] `AdminListProjects` — enumerate installed Convertigo projects with status info.
- [ ] `AdminGetEngineStatus` — expose engine version, uptime, sessions, and health indicators.
- [ ] `AdminGetEngineMetrics` — return key runtime metrics (memory, threads, JVM stats).

_Next steps_: implement one tool end-to-end (sequence + MCP wiring) before tackling
the rest, ensuring JSON schema and error handling patterns are nailed down.
