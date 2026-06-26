


# ConvertigoMCP

# Convertigo MCP Usage Guide

ConvertigoMCP exposes Convertigo tools, prompts, resources, setup helpers, and authoring guides through the local Streamable HTTP MCP endpoint.

Endpoint:
`http://localhost:18080/convertigo/api/mcp`

## Mistral Vibe

Add the Convertigo MCP endpoint in the Vibe MCP configuration. Start each task by reading `convertigo-start` and the selected recipe. Create, validate, save, and reload Convertigo projects through MCP tools.

```toml
[mcp_servers.convertigo]
transport = "http"
url = "http://localhost:18080/convertigo/api/mcp"
```

## Codex

Run the `ConvertigoMCP._setupCodex` sequence once for the target `CODEX_HOME`, then ask Codex to use the `convertigo-generalist` skill. Codex must discover the MCP catalog first, read `convertigo://resources/convertigo-start`, then read the relevant recipe before creating or editing projects.

```toml
[mcp_servers.convertigo]
url = "http://localhost:18080/convertigo/api/mcp"
```

## Claude Code

Register Convertigo as a Streamable HTTP MCP server. Ask Claude Code to call `tools/list`, `resources/list`, and `prompts/list`, then use the exposed MCP tools for project tree edits, validation, save, and runtime checks.

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
     ConvertigoMCP=git@github.com:convertigo/c8oprj-c8o-mcp.git:branch=codex
     ```
     </td></tr>
     <tr><td>To simply use</td><td>

     ```
     ConvertigoMCP=git@github.com:convertigo/c8oprj-c8o-mcp/archive/codex.zip
     ```
     </td></tr>
    </table>
3. Click the `Finish` button. This will automatically import the __ConvertigoMCP__ project


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



