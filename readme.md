


# ConvertigoMCP

Mashup Sequencer project


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



