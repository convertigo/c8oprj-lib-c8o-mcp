# Releasing

This project is released as part of the Tigo agent stack. The order, the manifest and the
checks are described once, in the Assistant repository:
https://github.com/convertigo/c8oprj-lib-convertigo-assistant/blob/master/RELEASING.md

## Pre-releases

Tagging a beta (`vX.Y.Z-beta.N`) publishes a GitHub pre-release and offers it to no Studio
yet. A beta reaches the **Pre-releases** update channel of Studios only once
`stack-release-preview.json` on `master` of the Assistant repository lists it, after it has
been installed and checked together with the Assistant and the Bridge on test-nocode.
Releasing this project does not do it: updating that manifest is the last step of the
checked set, see [the Assistant procedure](https://github.com/convertigo/c8oprj-lib-convertigo-assistant/blob/master/RELEASING.md#preview-manifest-after-a-checked-pre-release-set).

## Checks before a tag

- `node --test tests/scripts/validate_tool_schemas.cjs`: every tool's input and output schemas, as `tools/list`
  answers them, read by a strict JSON Schema client. The CI runs it before it builds the archive.
- Install a pre-release on test-nocode with the Tigo panel closed: a Vibe session started while
  `lib_ConvertigoMCP` is being replaced keeps no Convertigo MCP tool for its whole life (Vibe resolves its MCP
  servers when the session starts and does not reconfigure them during a turn). After the install, open a new
  conversation and check that the agent lists the No Code tools before going on.
