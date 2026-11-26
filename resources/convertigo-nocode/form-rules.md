# No-Code Form Rules

Read it before writing reduced JSON or edit operations. Summary: `SKILL.md`, in this folder.

---

## No-Code Form Rules

- Prefer the compact contract from `nocode-form-contract-get` before requesting `includeAllTypes=true`.
- Use only component types, aliases, properties, and graph patterns present in the no-code contract.
- Preserve user intent, labels, choices, required fields, conditions, pages, and layout in the reduced JSON.
- For app-like forms, prefer an actionable home page with native navigation buttons. Preserve explicit user choices. When tabs are chosen, prefer persisted-good base icon names and verify their saved flags.
- New app-like forms should include a polished background and thumbnail by default when supported, unless the user asks for a plain form.
- Treat wallpaper and thumbnail defaults as persisted-output requirements too: if they are requested or intended by default but compile/create drops them, repair through no-code update when contract-supported or explicitly report the no-code contract limitation.
- Do not generate `thumbnailUrl`. For a thumbnail image, pass `thumbnailImage: {attachment:"<file name>"}` for an image the user attached in the panel (PNG, JPEG or WebP), else `thumbnailImage: {contentType:"image/png", base64:"..."}`, in reduced JSON or in a `set_media`/`set_root` edit operation. The bytes are checked before the save (the signature of the type, a PNG whole with every chunk checksum up to IEND, a JPEG up to its end marker): a truncated or altered image is refused (`invalid_thumbnail_image`) and nothing is saved; never send base64 text you cannot copy exactly. Thumbnail images must be smaller than 512x512 px. The MCP tool writes the image to a temporary server file and persists it only through `C8Oforms.APIV2_updateFormulaireDocument` as the attachment named `thumbnail`. If a fetched existing document contains `thumbnail.url` or `thumbnail.type=url`, treat it as legacy/runtime state and continue through the no-code tools; the MCP validator reports it as a warning, not a blocking form error.
- Prefer multi-column layouts for dense app-like pages when supported by the no-code contract and when they improve readability.
- When using reduced JSON, express layout as a field with `type: "layout"` and nested `fields`. Prefer responsive sizing equivalent to `cols: [{size:6},{size:6},0...]`, `tablet: [{size:6},{size:6},0...]`, and `phoneL`/`phoneP` as a single `size:12` column.
- Keep generated reduced JSON concise, valid, and deterministic.
- Do not invent undocumented component properties.
- You do not see the No Code Studio editor. Name a tab, button, menu or choice of the editor only when the contract names it (`contextualDefaults.editor` for default values), never from a tool property: `defaultFrom` sources such as `clock` exist in the tools, not in the editor. When the user asks where to set something by hand and the contract does not name the place, say you cannot see where the editor puts it, then offer to make the change with the tools or to give the value or code to paste.
- Do not directly edit full C8Oforms internals unless the no-code tool contract explicitly requires that shape.
- When editing existing forms, prefer semantic `nocode-form-edit` operations over replacing full arrays through `nocode-form-update`.
- Do not infer or expose authentication tokens. If authentication is missing, report that the integrated No Code assistant session is not authenticated instead of switching tools.
- For Baserow catalog discovery and schema application, use `nocode-baserow-catalog-list` or `nocode-baserow-schema-apply` through the integrated authentication context. Do not ask for or use a Baserow JWT, Baserow database token, API key, or project name.
