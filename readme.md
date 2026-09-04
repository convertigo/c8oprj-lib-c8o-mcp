# Convertigo MCP

`lib_ConvertigoMCP` is the secure Streamable HTTP MCP server for Convertigo.
It exposes structured tools, prompts, resources, setup helpers, and authoring
guides to Codex, Mistral Vibe, Claude Code, and other MCP clients.

## Highlights

- Discovers, creates, edits, validates, saves, and reloads Convertigo projects.
- Provides purpose-built recipes and skills instead of relying on raw project
  file edits.
- Protects every MCP request with a bearer token.
- Includes a WEB_ADMIN application to create, list, and revoke durable tokens.
- Supplies short-lived managed credentials to the integrated Tigo Assistant
  without exposing bearer tokens to the browser or conversation history.
- Configures local Codex and Vibe profiles directly when running in Convertigo
  Studio.

## Requirements

- Convertigo Studio or Server 8.4.x.
- A `WEB_ADMIN` session to administer durable MCP tokens.
- An MCP client supporting Streamable HTTP and bearer authentication.

Endpoint:
`http://localhost:18080/convertigo/api/mcp`

## Authentication

Every request to `/api/mcp` requires a bearer token in the `Authorization`
header. Open the `lib_ConvertigoMCP` NGX application from the Convertigo
administration dashboard while signed in as a `WEB_ADMIN` to create, list, or
revoke durable tokens. The project root redirects to
`DisplayObjects/mobile/`. A token is shown only once when it is created.

When this application runs from Convertigo Studio on the same workstation as
the MCP client, use **Configure local Codex** or **Configure local Vibe** after
creating the token. The application updates the matching local profile and
keeps the token variable masked in the Convertigo execution logs. Restart the
client after setup.

Set the token in the client process environment:

```text
CONVERTIGO_MCP_TOKEN=<token>
```

Durable token metadata and the signing key are stored below
`$WORKSPACE/jwt/mcp`. Existing records below the former `$WORKSPACE/mcp`
location remain readable and its signing key is adopted automatically on first
use. Each token has its own metadata file so the directory can be shared by
several Convertigo nodes through an RWX volume without requiring a database.
Revocation takes effect on every node sharing that directory. On Convertigo
8.5.0 or newer, when both experimental libraries `lib_flow_engine` and
`lib_flow_mcp` are loaded, the same token also authenticates their MCP
endpoint. That alpha capability is otherwise neither configured nor required.

Tigo does not create durable entries for integrated Studio sessions. The
authenticated Assistant requests a short-lived managed token and passes only
an opaque in-memory handle to the Agent Bridge. The Bridge injects the token
into the local CLI environment and restarts the resident agent transparently
when the token is renewed.

## Mistral Vibe

Add the Convertigo MCP endpoint in the Vibe MCP configuration. Start each task by reading `convertigo-start` and the selected recipe. Create, validate, save, and reload Convertigo projects through MCP tools.

```toml
[[mcp_servers]]
name = "Convertigo"
transport = "http"
url = "http://localhost:18080/convertigo/api/mcp"

[mcp_servers.auth]
type = "static"
api_key_env = "CONVERTIGO_MCP_TOKEN"
api_key_header = "Authorization"
api_key_format = "Bearer {token}"
```

## Codex

Run the `lib_ConvertigoMCP._setupCodex` sequence once for the target `CODEX_HOME`, then ask Codex to use the `convertigo-generalist` skill. Codex must discover the MCP catalog first, read `convertigo://resources/convertigo-start`, then read the relevant recipe before creating or editing projects.

`bearer_token_env_var` is the **name** of an environment variable, not the
token itself. Define `CONVERTIGO_MCP_TOKEN` before starting Codex. Do not put
the token in `env_http_headers`: that table maps HTTP header names to
environment variable names.

```toml
[mcp_servers.convertigo]
url = "http://localhost:18080/convertigo/api/mcp"
bearer_token_env_var = "CONVERTIGO_MCP_TOKEN"
```

For a local static configuration, `_setupCodex` and the administration
application instead write the bearer credential as a protected HTTP header:

```toml
[mcp_servers.convertigo.http_headers]
Authorization = "Bearer <token>"
```

## Claude Code

Register Convertigo as a Streamable HTTP MCP server and provide the bearer
token through an `Authorization` header. Ask Claude Code to call `tools/list`,
`resources/list`, and `prompts/list`, then use the exposed MCP tools for project
tree edits, validation, save, and runtime checks.

```toml
[mcp_servers.convertigo]
type = "streamable-http"
url = "http://localhost:18080/convertigo/api/mcp"
```



For more technical informations : [documentation](./project.md)

- [Installation](#installation)
- [Rest Web Service](#rest-web-service)
    - [Mappings](#mappings)
        - [/mcp](#mcp)
            - [Operations](#operations)
                - [Get](#get)
                - [Post](#post)
        - [/mcp/](#mcp-1)
            - [Operations](#operations-1)
                - [Get](#get-1)
                - [Post](#post-1)
- [Mobile Application](#mobile-application)
    - [Pages](#pages)
        - [Home](#home)
        - [Templates](#templates)
        - [TplEntityPage](#tplentitypage)
        - [TplHome](#tplhome)
        - [TplLogin](#tpllogin)
    - [Shared Components](#shared-components)
        - [TplCrudErrorRetryState](#tplcruderrorretrystate)
        - [TplCrudLoadingState](#tplcrudloadingstate)
        - [TplCrudPageHeader](#tplcrudpageheader)
        - [TplDashboardStatCard](#tpldashboardstatcard)
        - [TplEntityDetailCard](#tplentitydetailcard)
        - [TplEntityEditForm](#tplentityeditform)
        - [TplEntityListPanel](#tplentitylistpanel)
        - [TplWorkInProgressCard](#tplworkinprogresscard)


## Installation

1. In your Convertigo Studio click on ![](https://github.com/convertigo/convertigo/blob/develop/eclipse-plugin-studio/icons/studio/project_import.gif?raw=true "Import a project in treeview") to import a project in the treeview
2. In the import wizard

   ![](https://github.com/convertigo/convertigo/blob/develop/eclipse-plugin-studio/tomcat/webapps/convertigo/templates/ftl/project_import_wzd.png?raw=true "Import Project")
   
   paste the text below into the `Project remote URL` field:
   <table>
     <tr><td>Usage</td><td>Click the copy button at the end of the line</td></tr>
     <tr><td>To contribute</td><td>

     ```
     lib_ConvertigoMCP=git@github.com:convertigo/c8oprj-lib-c8o-mcp.git:branch=main
     ```
     </td></tr>
     <tr><td>To simply use</td><td>

     ```
     lib_ConvertigoMCP=git@github.com:convertigo/c8oprj-lib-c8o-mcp/archive/main.zip
     ```
     </td></tr>
    </table>
3. Click the `Finish` button. This will automatically import the __lib_ConvertigoMCP__ project


## Rest Web Service

### Mappings

#### /mcp

##### Operations

###### Get

###### Post

Streamable HTTP entry point for MCP requests

**Parameters**

<table>
<tr>
<th>name</th><th>comment</th>
</tr>
<tr>
<td>jsonOnly</td><td></td>
</tr>
<tr>
<td>request</td><td>JSON-RPC request body</td>
</tr>
</table>

#### /mcp/

##### Operations

###### Get

###### Post

Streamable HTTP entry point for MCP requests

**Parameters**

<table>
<tr>
<th>name</th><th>comment</th>
</tr>
<tr>
<td>jsonOnly</td><td></td>
</tr>
<tr>
<td>request</td><td>JSON-RPC request body</td>
</tr>
</table>

## Mobile Application

### Pages

#### Home

#### Templates

#### TplEntityPage

Template source for generated CRUD entity pages.

#### TplHome

Template source for the generated CRUD home page.

#### TplLogin

Template source for the generated login/session bootstrap page.

### Shared Components

#### TplCrudErrorRetryState

Template source for the CRUD error/retry card.

**variables**

<table>
<tr>
<th>name</th><th>comment</th>
</tr>
<tr>
<td>Message</td><td></td>
</tr>
</table>

**events**

<table>
<tr>
<th>name</th><th>comment</th>
</tr>
<tr>
<td>Retry</td><td>Emitted when the user asks to retry the current CRUD state.</td>
</tr>
</table>

#### TplCrudLoadingState

Template source for the CRUD loading state card.

**variables**

<table>
<tr>
<th>name</th><th>comment</th>
</tr>
<tr>
<td>Message</td><td></td>
</tr>
</table>

#### TplCrudPageHeader

Template source for the CRUD page header.

**variables**

<table>
<tr>
<th>name</th><th>comment</th>
</tr>
<tr>
<td>Subtitle</td><td></td>
</tr>
<tr>
<td>Title</td><td></td>
</tr>
</table>

#### TplDashboardStatCard

Template source for the CRUD dashboard stat card.

**variables**

<table>
<tr>
<th>name</th><th>comment</th>
</tr>
<tr>
<td>Caption</td><td></td>
</tr>
<tr>
<td>Count</td><td></td>
</tr>
<tr>
<td>Title</td><td></td>
</tr>
</table>

#### TplEntityDetailCard

Template source for the CRUD entity detail card.

**variables**

<table>
<tr>
<th>name</th><th>comment</th>
</tr>
<tr>
<td>RefreshToken</td><td></td>
</tr>
<tr>
<td>SelectedId</td><td></td>
</tr>
<tr>
<td>Title</td><td></td>
</tr>
</table>

#### TplEntityEditForm

Template source for the CRUD entity edit form.

**variables**

<table>
<tr>
<th>name</th><th>comment</th>
</tr>
<tr>
<td>ActionLabel</td><td></td>
</tr>
<tr>
<td>CreateTitle</td><td></td>
</tr>
<tr>
<td>DeleteLabel</td><td></td>
</tr>
<tr>
<td>DraftSeed</td><td></td>
</tr>
<tr>
<td>EditTitle</td><td></td>
</tr>
<tr>
<td>Mode</td><td></td>
</tr>
<tr>
<td>RefreshToken</td><td></td>
</tr>
<tr>
<td>SelectedId</td><td></td>
</tr>
</table>

**events**

<table>
<tr>
<th>name</th><th>comment</th>
</tr>
<tr>
<td>Cancelled</td><td>Emitted when the user cancels form editing.</td>
</tr>
<tr>
<td>Deleted</td><td>Emitted after a successful delete.</td>
</tr>
<tr>
<td>Saved</td><td>Emitted after a successful create or update.</td>
</tr>
</table>

#### TplEntityListPanel

Template source for the CRUD entity list panel.

**variables**

<table>
<tr>
<th>name</th><th>comment</th>
</tr>
<tr>
<td>ActionLabel</td><td></td>
</tr>
<tr>
<td>PrimaryField</td><td></td>
</tr>
<tr>
<td>RefreshToken</td><td></td>
</tr>
<tr>
<td>SecondaryField</td><td></td>
</tr>
<tr>
<td>Title</td><td></td>
</tr>
</table>

**events**

<table>
<tr>
<th>name</th><th>comment</th>
</tr>
<tr>
<td>ItemSelected</td><td>Emitted when the user selects one row from the local list.</td>
</tr>
<tr>
<td>NewRequested</td><td>Emitted when the user wants to create a new row.</td>
</tr>
</table>

#### TplWorkInProgressCard

Template source for the bootstrap work-in-progress card.

**variables**

<table>
<tr>
<th>name</th><th>comment</th>
</tr>
<tr>
<td>Message</td><td></td>
</tr>
</table>
