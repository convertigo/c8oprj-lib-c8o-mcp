# Mandatory workflow

Read when: Mandatory workflow. Summary: `convertigo://guides/starter`.
Previous: `convertigo://guides/starter/overview`. Next: `convertigo://guides/starter/mandatory-workflow-2`.

---

## Mandatory workflow

### Golden path
1. Import `template_ngxBuilderIonic` under the exact requested project name unless the task or live catalog explicitly names another starter. The canonical call is `marketplace-import({"project":"template_ngxBuilderIonic","importedProjectName":"<targetProject>"})`; do not guess aliases or argument names.
2. Confirm the project exists and is the only mutation target.
3. Start the viewer once with `mobile-builder-open({"project":"<targetProject>","wait":false})`. Do not run a state-only readiness check before this launch.
4. Add the minimal backend business sequence first.
5. Add connector or transaction work second.
6. If the UI will display backend, HTTP web-service, SQL, or FullSync results, read `convertigo://guides/data-page` before any page mutation.
7. Add or extend the UI page third, starting with the actual visible entry page instead of leaving the default starter body dominant.
8. After useful mutations are complete, make one waited state check. If the first launch reports Node download, npm install, or a cold Angular build, use `mobile-builder-open({"project":"<targetProject>","stateOnly":true,"wait":true,"timeoutSec":180})` instead of repeated 30-second polls.
9. Validate runtime and save.

Do not combine a builder check with another MCP read in the same parallel tool turn unless the client explicitly guarantees concurrent calls on one MCP session. The portable default is sequential calls. Do not replace builder polling with shell `sleep`; the waited builder call owns readiness and timeout reporting.

### Local-state UI fast path
Use this shorter path when the new starter application only needs static content or local page state, with no backend, HTTP, SQL, or FullSync data:

1. Import the starter and launch `mobile-builder-open({"project":"<targetProject>","wait":false})`.
2. Read the exact entry page once with `databaseobject-tree-get({"target":"<targetProject>.Application.NgxApp.pg:Page","childrenDepth":4,"properties":"all"})`.
3. Reuse the returned starter QNames and the common NGX contracts below. Do not call `palette-list` or `palette-describe` for them.
4. Apply one coherent mutation plan. A property patch must use `tree.properties`, for example `databaseobject-tree-apply({"target":"<qname>","mode":"merge","tree":{"properties":{"isEnabled":false}}})`; top-level `properties` is invalid.
5. Keep `batch-call` at its default compact response. A corrected argument-shape mistake is not a reason to request `responseDetail:"full"`.
6. Read back only the changed root with `childrenDepth:2, properties:"changed"`, then perform one waited builder check and one acceptance-oriented browser proof as separate calls.

Known contracts for this path are `UIStyle#UIStyle.styleContent`, `UIAttribute#UIAttribute.attrName/attrValue`, `UIDynamicElement#DivTag`, `UIText#UIText.textValue`, `UIPageEvent#UIPageEvent.viewEvent`, and `UICustomAction#UICustomAction.actionValue`. Palette discovery is only needed when the requested object type or property is outside this list and is not already present in the entry-page tree.

### What the starter is for
The starter gives you:
- a valid project structure
- a working NGX app root
- a faster path to visible UI work
- fewer object-creation decisions at the beginning

The starter is not a reason to inherit its demo behavior blindly.
For fresh NGX projects in the current MCP flow, the starter import is the supported path. Do not waste bootstrap time asking the human to choose between “starter” and “blank NGX structure” unless another creation path is explicitly available.
When no starter is explicitly named, use `template_ngxBuilderIonic`. Do not guess names such as `NGXAppStarter`; if import fails, call `marketplace-list` and retry with a real listed project.

### Extension rules
- Keep new work under the imported benchmark or POC project only.
- Reuse existing app shell and page structure where it helps speed.
- Replace or extend demo placeholders with stable business-sequence-backed structures.
