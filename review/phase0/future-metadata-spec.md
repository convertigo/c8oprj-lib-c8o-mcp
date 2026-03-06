# Future Metadata Spec

This file records candidate metadata extensions for Phase 1 and later. Nothing
here is implemented in Phase 0.

## Goals

- keep the design stateless-compatible
- let tools recommend the right guides without blocking execution
- keep guide discovery machine-readable
- reduce unnecessary RAG calls

## Guide identifier format

Use stable semantic identifiers with explicit revisions:

- `convertigo/start@1`
- `convertigo/backend-sequences@1`
- `convertigo/integration-http@1`
- `convertigo/frontend-ngx@1`
- `convertigo/benchmarking@1`

Rules:

- namespace first
- semantic topic second
- explicit numeric revision after `@`
- avoid opaque names such as `c8o-12`

## Resource metadata extension

Future `resources_index.json` entries should support:

```json
{
  "uri": "convertigo://resources/convertigo-start",
  "name": "Convertigo Start Guide",
  "title": "Convertigo Start Guide",
  "description": "Canonical onboarding guide for all agents.",
  "mimeType": "text/markdown",
  "file": "convertigo_start.md",
  "guideId": "convertigo/start",
  "revision": 1,
  "scopeTags": ["start", "tree-authoring", "validation"],
  "prerequisites": [],
  "recommendedTools": [
    "project-list",
    "databaseobject-tree-get",
    "databaseobject-tree-apply",
    "requestable-execute"
  ],
  "guidanceLevel": "start",
  "fallbackToRag": false
}
```

## Prompt metadata extension

Future `prompts_index.json` entries should support:

```json
{
  "name": "convertigo-start",
  "title": "Convertigo MCP Start",
  "description": "Role-neutral start prompt for live MCP work.",
  "file": "convertigo_start.md",
  "roleId": "convertigo/generalist-planner",
  "recommendedGuides": ["convertigo/start@1"],
  "outputContract": ["short-mcp-critique"],
  "benchmarkSuitable": true
}
```

## Tool metadata extension

Future `tools/list` entries should gain optional metadata fields:

```json
{
  "recommendedGuides": [
    "convertigo/start@1",
    "convertigo/backend-sequences@1"
  ],
  "requiredGuides": [
    "convertigo/backend-sequences@1"
  ],
  "primaryOutputs": [
    "typed payload",
    "warnings"
  ],
  "docQualityHint": "needs-output-envelope-clarification"
}
```

Rules:

- `recommendedGuides` is advisory
- `requiredGuides` must never block execution by itself
- `docQualityHint` is for maintainers and benchmark reports, not end users

## guideContext placement

To remain stateless-compatible, place future guide awareness under request
metadata instead of adding mandatory top-level fields.

Candidate request shape:

```json
{
  "_meta": {
    "guideContext": {
      "seen": [
        "convertigo/start@1",
        "convertigo/backend-sequences@1"
      ]
    }
  }
}
```

Batch calls can carry one shared guideContext in their outer `_meta`, unless a
future need for per-call overrides appears.

## Warning payload candidate

Future non-blocking warnings should live in successful tool results:

```json
{
  "warnings": [
    {
      "code": "missing-guide-hint",
      "severity": "warning",
      "tool": "databaseobject-tree-apply",
      "message": "This mutation targets sequence objects, but convertigo/backend-sequences@1 is not declared in guideContext.seen.",
      "recommendedGuide": "convertigo/backend-sequences@1",
      "resourceUri": "convertigo://resources/convertigo-backend-sequences",
      "blocking": false
    }
  ]
}
```

Rules:

- warnings must never convert a success into an error on their own
- warnings must be specific and low-noise
- tools should emit them only when the missing guide is relevant to the current action

## RAG usage policy

Use `rag-query` only when:

- the tool metadata is insufficient
- no tracked guide answers the question
- the issue is about product semantics, setup, troubleshooting, or best practices

Do not use `rag-query` for:

- basic tool names
- basic parameter syntax
- the canonical authoring workflow

Future report policy:

- every run should track `ragCalls`
- repeated useful RAG answers should create a guide backlog item once the same need appears at least twice in the same review cycle
