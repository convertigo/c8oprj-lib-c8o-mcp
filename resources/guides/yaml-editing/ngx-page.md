# Add an NGX page and its menu entry

Read when: Add an NGX page and its menu entry. Summary: `convertigo://guides/yaml-editing`.
Previous: `convertigo://guides/yaml-editing/sequence`. Next: `convertigo://guides/yaml-editing/reload`.

---

## Add an NGX page and its menu entry
1. Copy the closest existing page (`_c8oProject/mobilePages/<Page>.yaml`, a list page for a list) to the new name, and renumber all its priorities.
2. Reference it in `_c8oProject/mobileNgxApp.yaml`, next to the other page lines (their order is the menu order): `↓<Page> [ngx.components.PageComponent-<p>]: 🗏 mobilePages/<Page>.yaml`.
3. The first lines of the page file are its properties: `segment` (its URL path, unique), `title` (the toolbar and menu label), `icon` (an ionicon name, shown in the menu). A page is in the menu unless it has `inAutoMenu: false`: the menu lists the pages itself (`UIDynamicMenuItems`), so a menu entry is a page without that line.
4. Data comes from a page event and actions, never from code in `scriptContent`: a `↓PageEvent [ngx.components.UIPageEvent-<p>]: ` with `viewEvent: onWillEnter`, holding a `CallSequenceAction` (`beanData: '{"ionBean":"CallSequenceAction","requestable":"plain:<Project>.<sequence>"}'`) whose children `SetLocalAction` store `out` into `local` (`"Property": "plain:data"`, `"Value": "script:out"`); the elements bind `local?.data...` with `script:` MobileSmartSourceType values. Keep the binding forms the copied page uses (`plain:`, `script:`, `source:{...}`).
5. Elements are `ngx.components.UIDynamicElement` beans with `beanData` (`{"ionBean":"Card"}`, `{"ionBean":"List"}`...) and `tagName`; texts are `UIText` with `textValue`; classes are `UIAttribute` children. `palette-list` and `palette-describe` on the page give the ionBeans and their properties.
6. Reload, then `mobile-builder-open(project)`: wait for `status: "ready"` with no `compileErrors`, then prove the page in the viewer (`browser-verify`, or the Playwright tools).
