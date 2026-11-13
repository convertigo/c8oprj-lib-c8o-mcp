


# lib_ConvertigoMCP

# Convertigo MCP

Secure Streamable HTTP MCP server for Convertigo. It exposes structured project tools, prompts, resources, setup helpers, and authoring guides to AI agents.

The project includes a WEB_ADMIN application for durable token management, short-lived managed credentials for the integrated Tigo Assistant, and one-click local setup for Codex and Mistral Vibe.

Endpoint: `http://localhost:18080/convertigo/api/mcp`


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


## Installation

1. In your Convertigo Studio click on ![](https://github.com/convertigo/convertigo/blob/develop/eclipse-plugin-studio/icons/studio/project_import.gif?raw=true "Import a project in treeview") to import a project in the treeview
2. In the import wizard

   ![](https://github.com/convertigo/convertigo/blob/develop/eclipse-plugin-studio/tomcat/webapps/convertigo/templates/ftl/project_import_wzd.png?raw=true "Import Project")
   
   paste the text below into the `Project remote URL` field:
   <table>
     <tr><td>Usage</td><td>Click the copy button at the end of the line</td></tr>
     <tr><td>To contribute</td><td>

     ```
     lib_ConvertigoMCP=git@github.com:convertigo/c8oprj-c8o-mcp.git:branch=main
     ```
     </td></tr>
     <tr><td>To simply use</td><td>

     ```
     lib_ConvertigoMCP=git@github.com:convertigo/c8oprj-c8o-mcp/archive/main.zip
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





## Tigo project resources

With lib_ConvertigoAssistant 1.5.0 or newer, the full MCP catalog exposes
`tigo-resources` to list and edit a named project's `.tigo/` prompts, standard
skills and MCP declarations. Updates and removals use optimistic revisions;
project writes add the HTTP privacy rule. The tool cannot edit built-ins or
personal resources, activate skills/connections, read credentials, or commit Git
changes. See the Assistant's [resource format and usage guide](https://github.com/convertigo/c8oprj-lib-convertigo-assistant/blob/master/docs/tigo-library.md).

## Tigo release channels

Customer stable bundle: Assistant **1.4.49**, Bridge **0.4.22**, MCP **0.2.23**.
The Assistant **1.5.0** / Bridge **0.4.23** / MCP **0.2.24** bundle is a preview
awaiting review. Use the complete bundle from the Assistant's
[stable manifest](https://github.com/convertigo/c8oprj-lib-convertigo-assistant/blob/master/stack-release-stable.json)
or explicitly choose its
[preview manifest](https://github.com/convertigo/c8oprj-lib-convertigo-assistant/blob/master/stack-release-preview.json).
Pushes/tags build and publish pre-releases; they never deploy a server.
