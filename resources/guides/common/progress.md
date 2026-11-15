# Durable progress and resume

Read when: Durable progress and resume. Summary: `convertigo://guides/common`.
Previous: `convertigo://guides/common/readback`. Next: `convertigo://guides/common/subagents`.

---

## Long tasks: progress file and resume

A build of several lots outlives the conversation context: the harness compacts it into a summary that keeps the goal but drops names and details. Keep the state in the project, not in memory.
A change of an existing app that fits in one turn needs no progress file: do not add files to the user's project for it.
- Keep `<project>/docs/generated/PROGRESS.md` and update it at the end of each lot: lots done and checked (with the proof: requestable run, test sequence, viewer), the object inventory (exact names of connectors, transactions, sequences, pages and shared components), the decisions and rules learned on the way (SQL column case, optional filters, workarounds), the open problems, and the next step.
- At any resume (after a context compaction, a new turn or a restart), read `PROGRESS.md`, then `databaseobject-tree-get` the project at `childrenDepth:1` (or the part you work on) before calling, reading or patching an object by name. Never rebuild a name from memory: copy it from these two sources.

