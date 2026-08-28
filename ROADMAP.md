# Roadmap

## Stage 1 – Local Convertigo runtime
- [x] Confirm Docker cannot run inside Codex Cloud (daemon fails with missing `iptables` capabilities).
- [x] Download Tomcat 9.0.89 and the Convertigo 8.3.9 WAR outside the repo, unpack the WAR under `webapps/convertigo`, and start Tomcat with Java 21.
- [x] Link this repository into `/root/convertigo/projects/lib_ConvertigoMCP` so the engine sees the project workspace.
- [x] Discover a supported way to execute arbitrary scripts/operations on Convertigo 8.3.9.
  - [x] Inspect bundled admin services and URL mapper definitions to find or expose an equivalent capability (the `EXEC` sequence is mapped at `/convertigo/projects/lib_ConvertigoMCP/.json?__sequence=EXEC&script=<js>`).
  - [x] Confirm that once the project is primed through the sequence endpoint, the legacy `/convertigo/api/exec` endpoint responds again.
- [x] Create a dedicated `EngineMetrics` sequence (SimpleStep + JsonToXmlStep) and map it to `GET /convertigo/api/metrics` so MCP tools can retrieve runtime stats without arbitrary code execution.
- [ ] Update the MCP integration to call that endpoint and retrieve the engine product version as a first test.

## Stage 2 – MCP tool surface for Convertigo authoring
- [ ] Design the MCP tool contract (input/output schemas, safety constraints) for Convertigo operations.
- [x] Expose tooling to list Convertigo projects.
- [x] Expose tooling to list sequences of a project.
- [x] Invoke a sequence with parameters through the MCP facade.
- [x] Surface the logical tree of a project (DatabaseObject hierarchy) for navigation.
- [x] Provide read-only access to DatabaseObject properties.
- [x] Provide write access to DatabaseObject properties with validation and export.
- [x] List DatabaseObject types that can be created under a given parent.
- [x] Add support for creating a DatabaseObject under a parent and exporting the project.
- [x] Allow reordering of sibling DatabaseObjects and persist the change.
- [x] Map the above capabilities into URL mapper endpoints compatible with the MCP dialogue expectations.

## Current status (2025-10-17)
- Tomcat reports a successful startup (`bin/catalina.sh start` → `Tomcat started.`) and creates the Convertigo home under `/root/convertigo`.
- Calling `http://localhost:8080/convertigo/projects/lib_ConvertigoMCP/.json?__sequence=EXEC&script=return%20com.twinsoft.convertigo.engine.ProductVersion.productVersion` returns `{ "output": "8.3.9" }`, priming the project so `/convertigo/api/exec` can also process the same script payload.
- `/convertigo/api/metrics` now returns the `EngineMetrics` payload (memory usage, sessions, worker threads, contexts, request rate, uptime...).
- `/convertigo/api/mcp/projects` and `/convertigo/api/mcp/sequences` provide read-only discovery for project names and requestables.
- `/convertigo/api/mcp/tree` returns database object metadata and children for navigation, and `POST /convertigo/api/mcp/sequences/invoke` proxies sequence execution with optional payload forwarding.
- `/convertigo/api/mcp/candidates` reports the palette entries available for a given database object (optionally filtered by folder type).
- `/convertigo/api/mcp/properties` exposes property metadata, `/convertigo/api/mcp/properties/update` applies validated changes, `/convertigo/api/mcp/objects` creates new database objects, and `/convertigo/api/mcp/objects/reorder` persists sibling ordering.
- Next focus: design the MCP contract and tool schemas so the client can consume the new endpoints safely.
