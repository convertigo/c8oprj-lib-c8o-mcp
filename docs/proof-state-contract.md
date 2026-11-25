# Proof state of a conversation (contract with the Agent Bridge)

Agents of a Tigo conversation said "fixed" or "build OK" while the problem was still there: the rules that a green tree
or a build is not a functional proof were text only, and nothing recorded whether a change was proven after it was
made. Convertigo MCP now keeps, per conversation, the objects changed through the MCP and not proven since their last
change (`js/write_journal.js`, the proof ledger), answers them in `project-changes` (`unproven`), and writes them for
`lib_ConvertigoAgentBridge`, which passes them to `lib_ConvertigoAssistant`. This page is the contract the other two
components rely on. The writer is `C8O.writeJournal.writeProofState`; the same contract is written next to it.

## Where and when

- Store: the store the engine server shares between requests, `context.server` (the one of the write journal).
- Key: `lib_ConvertigoMCP.proofState`.
- Value: a `java.util.concurrent.ConcurrentHashMap` from the RAW conversation id to a JSON string.
  - The conversation id is the value of the `X-Convertigo-Conversation-Id` header of the MCP call, as sent, when it
    matches `^[A-Za-z0-9._-]{1,128}$` (the `CONVERSATION_ID` pattern of the journal). The router's checked value is used
    first, else the header of the request.
  - A call without a valid conversation id (a durable token of another MCP client) writes nothing.
- When: after every journal append for that conversation: a write tool's answer, a `requestable-execute` run, a proof
  (`crud-proof`, `seed-proof`, `browser-verify`, `subagent-run` with profile `verifier`), from the MCP endpoint or from
  `batch-call` for its inner calls. The whole state is replaced each time.

## The JSON string

```
{"v":1,"at":<ms>,"writes":<number of recorded writes in the conversation>,
 "unproven":[{"qname":"<QName>","project":"<project>","kind":"backend"|"ui"|"file","changedAt":<ms>}],
 "lastProof":{"tool":"<tool name>","target":"<QName or project>","at":<ms>,"ok":true|false}|null}
```

- `v`: 1. A reader ignores a version it does not know and unknown fields.
- `at`: when the state was computed (ms since 1970).
- `writes`: the journal entries of the conversation that changed objects (one per write call or inner write of a
  batch), within 24 h.
- `unproven`: the objects changed and not proven since their last change, the most recent change first, 40 at most.
  `qname` is a Studio QName (`Shop.sq:list_orders`, `Shop.cn:db.tr:list_rows`, `Shop.Application.NgxApp.pg:Orders`),
  a project file as `<project>/<path>` (`Shop/js/app.js`), or a project name for a project-wide UI change (a theme).
  An object under another one of the list that the same proof proves (a step of a sequence, a component of a page) is
  given by that one, with the latest `changedAt`.
- `lastProof`: the last proof attempt of the conversation, ok or not, or `null`. `tool` is `requestable-execute`,
  `crud-proof`, `seed-proof`, `browser-verify` or `subagent-run`; `target` the QName of the requestable run (or of the
  seed) or the project of a CRUD proof or a verifier report (empty when the report named none).

## What proves what

| kind | objects | proven by (after the change) |
| --- | --- | --- |
| `backend` | a QName with `.sq:` or `.cn:`: a sequence and its steps and variables, a transaction, a connector; a CRUD scaffold of `upsert-crud` (project-wide) | a `requestable-execute` that answered ok of that sequence or transaction (any transaction of a changed connector; any requestable of the project for a project-wide change), or `crud-proof` (`status: success`) or `seed-proof` (`verdict: replayable`) of its project, or a passed verifier report in its project |
| `ui` | the mobile application and everything under it (pages, shared components and actions, styles), a theme, the files of the Ionic app, i18n files | a verifier report in its project: `passed` proves every UI object of the project; `partial` proves only the pages whose name is a word of the path names of its passed checks; `failed` or `not_checked` proves nothing |
| `file` | other project files written with `project-js-set` and the like | any `requestable-execute` of a requestable of its project that answered ok, or `crud-proof`/`seed-proof` ok |

Deleted objects, and objects created then deleted, need no proof. A rename or a move carries the change to the new
QName. A verifier report whose project is unknown (a dev viewer URL that names none) speaks for the only project with
UI changes, else for none.

## Bounds and privacy

- 64 conversations at most: the one with the oldest `at` leaves first.
- 40 unproven items at most, the most recent changes first.
- Nothing older than 24 h: journal entries past 24 h are not counted, and a conversation not written for 24 h leaves the
  map at the next write of any conversation.
- Never a data value: QNames, project and tool names, times and booleans only (no argument, no variable value, no row,
  no evidence text of a verifier).

## What the agent is told

`project-changes` answers `unproven` as lines `"<QName>: changed at HH:MM:SS, no proof since"` (UTC) with
`unprovenNote`, and its `howToUse` says to name every unproven object in the final summary as not verified, never as
fixed, working or OK, or to prove it first.

Tests: `node --test tests/scripts/validate_proof_ledger.cjs`.
