# Knowledge Base

## Convertigo server access
- Docker remains unavailable in this Codex Cloud workspace because the kernel lacks the permissions required by `iptables`, so `dockerd` exits immediately even after installing `docker.io`.
- As a workaround we can run Convertigo 8.3.9 on Tomcat 9 with Java 21:
  1. Work outside the Git repo (e.g. `/workspace/tmp`).
  2. Download Tomcat 9.0.89 and the `convertigo-8.3.9.war` release.
  3. Extract Tomcat, create `webapps/convertigo`, and unzip the WAR there.
  4. Start the server with `bin/catalina.sh start` and stop it with `bin/catalina.sh stop`.
  5. On first start Tomcat creates `/root/convertigo`; symlink the repo with `ln -s /workspace/c8oprj-lib-c8o-mcp /root/convertigo/projects/lib_ConvertigoMCP`.
- The Convertigo console is reachable at `http://localhost:8080/convertigo` once Tomcat is running.
- Prime the engine by calling `/convertigo/projects/lib_ConvertigoMCP/.json?__sequence=EXEC&script=<js>` so the project is loaded into the workspace. Once primed, `/convertigo/api/exec` succeeds again and returns the Rhino output (e.g. `{"output": "8.3.9"}` for `return com.twinsoft.convertigo.engine.ProductVersion.productVersion`).

## Useful commands
```sh
# Start Tomcat after unpacking the WAR under apache-tomcat-9.0.89/webapps/convertigo
bin/catalina.sh start

# Stop Tomcat
bin/catalina.sh stop

# Query the Convertigo engine version through the EXEC sequence (primes the project)
curl "http://localhost:8080/convertigo/projects/lib_ConvertigoMCP/.json?__sequence=EXEC&script=return%20com.twinsoft.convertigo.engine.ProductVersion.productVersion"

# Same script through /convertigo/api/exec once the project is loaded
curl "http://localhost:8080/convertigo/api/exec" \
  -H "Content-Type: text/plain" \
  -d "return com.twinsoft.convertigo.engine.ProductVersion.productVersion"

# Retrieve live engine metrics (SimpleStep + JsonToXmlStep sequence)
curl "http://localhost:8080/convertigo/projects/lib_ConvertigoMCP/.json?__sequence=EngineMetrics"
curl "http://localhost:8080/convertigo/api/metrics"

# Discover projects and sequences exposed through the MCP facade
curl "http://localhost:8080/convertigo/api/mcp/projects"
curl "http://localhost:8080/convertigo/api/mcp/sequences?project=lib_ConvertigoMCP"
curl "http://localhost:8080/convertigo/api/mcp/tree?depth=2"
curl "http://localhost:8080/convertigo/api/mcp/tree?qname=lib_ConvertigoMCP&depth=1"
curl "http://localhost:8080/convertigo/api/mcp/candidates?qname=lib_ConvertigoMCP&folder=st"
curl "http://localhost:8080/convertigo/api/mcp/properties?qname=lib_ConvertigoMCP"
curl "http://localhost:8080/convertigo/api/mcp/properties/update" \
  -X POST \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "qname=lib_ConvertigoMCP" \
  --data-urlencode 'properties={"comment":"Updated via MCP"}'
curl "http://localhost:8080/convertigo/api/mcp/objects" \
  -X POST \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "parent=lib_ConvertigoMCP" \
  --data-urlencode "className=com.twinsoft.convertigo.beans.core.UrlMapper" \
  --data-urlencode "newName=MyMapper" \
  --data-urlencode 'properties={"comment":"Created by MCP"}'
curl "http://localhost:8080/convertigo/api/mcp/objects/reorder" \
  -X POST \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "parent=lib_ConvertigoMCP" \
  --data-urlencode 'order=["lib_ConvertigoMCP.UrlMapper","lib_ConvertigoMCP.ListProjects"]'

# Invoke a sequence safely through the MCP facade (POST body contains form data or JSON payload parameter)
curl "http://localhost:8080/convertigo/api/mcp/sequences/invoke" \
  -X POST \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "project=lib_ConvertigoMCP" \
  --data-urlencode "sequence=EngineMetrics" \
  --data-urlencode "payload={}" 

```

## Git tips
- Codex Cloud does not automatically sync with the remote repository after a PR merges. Before running `make_pr`, execute `git fetch origin` followed by `git rebase origin/main` (replace `main` with the actual default branch) so your changes apply cleanly.
- If `make_pr` reports merge conflicts, cancel it, rebase or reset the branch against the updated remote as described above, resolve conflicts locally, then rerun the command.

## MCP capability targets
- MCP dialogue must eventually expose project discovery, sequence listing/invocation, DatabaseObject exploration, property read/write, allowed child type discovery, object creation, and reordering.
- Property inspection lives at `/convertigo/api/mcp/properties` and updates at `/convertigo/api/mcp/properties/update`; object creation is available through `/convertigo/api/mcp/objects` and reordering through `/convertigo/api/mcp/objects/reorder`.
- Each capability should be provided through dedicated sequences and URL mapper endpoints so the MCP client never needs raw `/convertigo/api/exec` access.
- Use Rhino-based `SimpleStep` blocks inside sequences to manipulate `Engine.theApp.databaseObjectsManager` and export changes with `Engine.theApp.databaseObjectsManager.exportProject(project);` once modifications are ready for Git.
```
