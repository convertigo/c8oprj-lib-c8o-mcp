# Tool Comment Style

This file defines the Phase 0 quality bar for database object comments that
feed MCP auto-documentation through `tools/list`.

## Goal

Make tool and parameter descriptions immediately useful without forcing the
caller to open a guide for obvious information.

## Hard rules

- Do not restate the parameter name in a sentence.
- Do not explain obvious types with boilerplate wording.
- Do not describe trivial fields with filler such as "this parameter defines...".
- Do not duplicate the same sentence in `title` and `description`.
- Do not hide important restrictions only in external guides when they can fit
  in the tool metadata.

## What good auto-documentation should say

Prefer high-signal information such as:

- restricted value sets
- accepted formats
- canonical examples when the shape is non-obvious
- default behavior
- side effects
- performance implications
- compatibility notes
- common failure triggers

## Good description patterns

- `Color value. Accept CSS color names, #rgb, #rrggbb, rgb(), rgba(), hsl(), or hsla(). Alpha is allowed only in rgba() and hsla().`
- `QName of an existing parent object. Case-sensitive.`
- `When true, records the learned response schema on disk before returning.`
- `Patch mode. Use merge for incremental updates and replace for strict subtree replacement.`

## Bad description patterns

- `Color: this parameter defines the color of the element.`
- `Name of the project.`
- `Boolean flag to enable the option.`
- `Execute the execution of the requestable.`

## Parameter-level checklist

For every important parameter, ask:

1. Is the accepted value domain obvious from the type alone?
2. If not, is the allowed format documented?
3. Are defaults explicit when they affect behavior?
4. Are side effects explicit when they matter?
5. Would an LLM know what to send without opening a guide?

If the answer to question 5 is no, the description is still too weak.
