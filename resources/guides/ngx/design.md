# Deliberate layouts and visual review

Read when: Deliberate layouts and visual review. Summary: `convertigo://guides/ngx`.
Previous: `convertigo://guides/ngx/components`. Next: `convertigo://guides/ngx/presentation`.

---

## Visual design

An app built only for readability looks like every other generated app: the starter's blue, raw lists, dark in a dark browser. Give it a deliberate look, with palette objects and styles only (no `UICustom`, no inline style).

- **Choose the tokens before the pages.** Right after the starter import, call `ngx-theme-apply` once: the user's brand color as `primary` when they gave one (a logo, a website, a charter), and the preset that fits the app: `institutional` (administration, public services, internal tools: deep blue-grey, colored toolbar, small radius), `modern` (product or consumer app: violet, white toolbar, rounded cards), `dense` (back-office screens full of tables: teal, dark toolbar, compact). Give `appName` for the menu header. It writes the app-level `UIStyle` `AppTheme` (Ionic colors with their contrast, shade and tint, background, text, the `--app-*` tokens) and keeps the starter's `LightTheme`, `AutoDarkTheme` and `TailwindTheme` underneath. `ngx-page-create` takes the same tokens as `theme`.
- **Never leave the default blue by accident.** While an app still has the starter's colors, `ngx-page-create` applies the `institutional` preset and says so in its warnings: that is a fallback, not a choice. `project-lint` reports `NGX-DEFAULT-THEME` for an app that kept the starter's colors.
- **Light by default for a business app**; `mode: "dark"` only when the user asks for it, `"auto"` when the app must follow the device. The dark palette is always written and its contrast is checked: look at one page in each (the starter's theme switch, or `localStorage` `c8o-theme-dark` set to `true` before the page loads).
- **Visual hierarchy.** One page title, sections that stand out, key figures as KPI cards (`dashboard.kpis[].icon` and `.color`; without them the label gives the accent and its icon), status badges whose color says the status: `ngx-page-create` derives it from the words of `badge.labels` (done or valid: success, late or refused: danger, waiting: warning, inactive: medium) and gives it back as `badgeColors`; give `badge.colors` when the words do not say it.
- **Layout.** A list sits in a panel; a list whose rows carry more than three values gets `list.columns` (a table with a header row on a wide screen, label and value lines on a phone). Details are label/value lists, forms sit in a panel at most 720px wide, buttons are grouped. Every empty state has an icon (`emptyIcon`) and a sentence.
- **App shell.** The page toolbars take the theme's toolbar color, each menu page has an icon (`icon`, the base ionicons name such as `people` or `calendar`: the menu adds `-outline` or `-sharp`), the menu header shows `appName`.
- **Consistency.** Hand-written rules read the tokens: spacing `--app-space-1` to `--app-space-6`, type `--app-font-size-xs` to `--app-font-size-2xl`, `--app-radius-sm`, `--app-radius`, `--app-radius-lg`, surfaces `--app-surface`, `--app-surface-2`, `--app-muted`, `--app-border`, colors `--ion-color-<name>`. Never a fixed color or pixel size the theme already gives.
- **Check it.** `browser-verify` returns `designSuggestions`; check a phone width (`viewport: "mobile"`) as well as the desktop.
