# Project notes and resume

Read when: Project notes and resume. Summary: `convertigo://guides/common`.
Previous: `convertigo://guides/common/readback`. Next: `convertigo://guides/common/subagents`.

---

## Project notes and resume

A build of several lots outlives the conversation context: the harness compacts it into a summary that keeps the goal but drops names and details. Keep the state in the project, not in memory: its notes, `<project>/_private/docs/PROGRESS.md`, which the next turns of Tigo get first and `project-brief` returns.
- Write them with `project-notes-write({project, text, mode})`: `replace` rewrites the file, `append` adds a section. Update them at the end of each lot of a build and at the end of a generation: the conventions and decisions of the app (where its styles live and which classes it uses, its naming, its pages and the sequence each calls, its roles, its demo accounts by name), the lots done and checked (with the proof), the object inventory (exact names), the rules learned on the way (SQL column case, optional filters, workarounds), the open problems and the next step. Keep them short: facts a next turn needs, not a log.
- Never a password, token or key in the notes, nor anywhere in the project: name the account and say where its password is (`given to the user at hand-off`). `project-notes-write` refuses a text that holds one.
- Every document of a build (the notes, a specification, a plan, a report) goes under `<project>/_private/docs/`: a server serves every other folder of a project to anyone, `docs/` included, and never `_private/`. `project-notes-write` moves notes left in `docs/generated/` there, and `project-lint` reports a password, token or key in a served file (`SEC-SERVED-SECRET`).
- A change of an existing app that fits in one turn adds no file: it updates the notes only when it decides a convention they lack (see Frequent changes).
- At any resume (after a context compaction, a new turn or a restart), start from the notes and `project-brief` (with `page` for the page you work on) before calling, reading or patching an object by name. Never rebuild a name from memory: copy it from these two sources.
