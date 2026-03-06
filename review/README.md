# Review Workspace

This directory stores Preparation and Phase 0 audit artifacts for the
Convertigo MCP review.

## Scope

- Internal-first review workspace for maintainers, benchmark builders, and
  agent experiments.
- Runtime-neutral artifacts only.
- No MCP wire changes, no YAML tool behavior changes, and no guide rewrites are
  performed here.

## Source-of-truth order

1. Live MCP signature and behavior
2. Repository implementation and exported schemas
3. Repository documentation, prompts, and tests
4. Colleague repositories as pattern sources only

## Structure

- `live-contract/`: captured local MCP baseline and normalized tool catalog
- `schemas/`: JSON Schemas for the tracked review artifacts
- `mismatch/`: gap matrix and human summary
- `glossary/`: canonical terms and deprecated aliases
- `patterns/`: reusable ideas extracted from colleague repositories
- `phase0/`: self-documentation audit, future metadata specs, and review output
- `scripts/`: reproducible capture helpers for the live contract

## Reproducibility

The current baseline is captured from the local MCP endpoint:

- `http://localhost:18080/convertigo/api/mcp`

To refresh the local live-contract artifacts, run:

```bash
bash review/scripts/capture_live_contract.sh
```

The generated files are repo-tracked because the audit must stay comparable
across iterations.
