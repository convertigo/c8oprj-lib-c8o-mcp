# SmartType modes and source-picker tuples

Read when: SmartType modes and source-picker tuples. Summary: `convertigo://guides/backend`.
Previous: `convertigo://guides/backend/step-taxonomy-that-matters-most-3`. Next: `convertigo://guides/backend/schema-learning-when-mapping-matters`.

---

Avoid this by default:
- nested `try/catch` wrappers
- manual fallback branches for routine failures
- duplicating Convertigo's standard runtime error reporting in each sequence

## SmartType and source picker: the real rules

### SmartType is a modeling choice
Many properties are SmartTypes. That means the same property can be expressed as:
- fixed text
- JavaScript expression
- source-picked value

Pick the mode intentionally.

Use text mode when:
- the value is part of the stable contract or static configuration
- the same literal should appear every time

Use JavaScript mode when:
- the value is computed from inputs or previous intermediate values
- the computation is small and obvious

Use source mode when:
- the value is already present in a previous step result
- the source path is the clearest representation of the intent

### Source picker is about exact provenance
A source is not “some previous value”. It is:
- one producer step
- one XPath
- evaluated at runtime on that step result

Good canonical example:

```json
["123456789", "./ip/text()"]
```

The first token is the producer step priority. The second token is the exact extraction path. Keep both stable and deliberate.

### Common source-picker mistakes
- picking the parent element instead of the text node when text is needed
- guessing the path without reading the producer tree
- reusing a stale sourceDefinition copied from another sequence
- sourcing from a step whose execution is conditional, then assuming it always exists

Why this matters:
- these mistakes create silent empty values or wrong shapes that only appear later in the business sequence

Minimum validation proof:
- inspect the producer tree
- run the sequence and confirm the sourced value materializes where expected
