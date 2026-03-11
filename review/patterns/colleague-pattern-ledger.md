# Colleague Pattern Ledger

This ledger captures reusable ideas from colleague repositories. Every entry in
this file is a `pattern-source`, not contract truth.

## `/Users/nicolas/git/codex-cli-multiagent/AGENTS.md`

### Reusable patterns

- Planner plus specialists:
  - planner first for cross-domain work
  - specialists in dependency order
  - minimal skill selection per run
- Acceptance gates:
  - reject UI work that starts before backend contract clarity
  - require final save and minimal end-to-end validation
- Fallback discipline:
  - treat non-critical agent close errors as non-blocking when evidence already exists

### Import decision

- Import into future prompt roles and benchmark orchestration.
- Do not import skill naming or file-path assumptions into the MCP contract.

## `/Users/nicolas/git/codex-cli-multiagent/learn.md`

### Reusable patterns

- Non-negotiable preflight gates before implementation
- Response-contract-first thinking before UI wiring
- Explicit cleanup and validation-data lifecycle
- Save, reload, then smoke-test after structural changes
- UI resilience as a required behavior, not an optional enhancement

### Import decision

- Import as benchmark and acceptance criteria.
- Do not copy domain-specific examples into the canonical start guide.

## `/Users/nicolas/git/convertigo-project-editor/README.md`

### Reusable patterns

- Tight validation workflow
- Minimal, targeted changes instead of broad rewrites
- Strong distinction between project descriptors and generated frontend output

### Import decision

- Import delivery discipline and validation mindset only.
- Do not import YAML-editing-first workflow into the MCP-tool-first canonical guide.

## `/Users/nicolas/git/convertigo-project-editor/SKILL.md`

### Reusable patterns

- Marketplace cross-check before assuming shared assets are unavailable
- Security profile discipline for sequence creation
- Bean-first policy for NGX state and orchestration
- Compile gate for NGX-impacting changes
- Structured final-deliverable checklist

### Import decision

- Import into specialized frontend and backend guides later.
- Keep these ideas out of the canonical start guide unless they are needed for every agent.

## What stays out for now

- YAML delta-apply workflow as a default authoring path
- File-level YAML linting instructions in the MCP start guide
- Project-editor-specific icon and asset conventions
- Any rule that assumes direct `_c8oProject` editing instead of live MCP authoring
