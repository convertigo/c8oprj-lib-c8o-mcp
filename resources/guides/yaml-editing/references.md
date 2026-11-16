# Files, references, priorities and names

Read when: Files, references, priorities and names. Summary: `convertigo://guides/yaml-editing`.
Previous: `convertigo://guides/yaml-editing/files`. Next: `convertigo://guides/yaml-editing/sequence`.

---

## Files and references
- `c8oProject.yaml` holds the project bean and its direct children. A child held by its own file is one line: `  ↓crm_list_companies [sequences.GenericSequence]: 🗏 sequences/crm_list_companies.yaml`.
- The referenced file, under `_c8oProject/`, holds the body of that bean at column 0: its properties first, then its children (`↓...` lines at column 0). It never repeats the bean line.
- `_c8oProject/connectors/<connector>.yaml` holds a connector's body, its transactions at column 0. `_c8oProject/mobileNgxApp.yaml` holds the NGX application: its pages are lines `↓Name [ngx.components.PageComponent-priority]: 🗏 mobilePages/Name.yaml`.
- A file under `_c8oProject/` that no bean references is ignored by the reload (and deleted at the next save): a new file needs its reference line.

## Priorities and names
- The number after the class (`[steps.TransactionStep-1794587262763]`) is the object's priority: its identity. Steps, variables and NGX components carry one; some beans (sequences and transactions) often have none.
- Every priority is unique in the whole project. A new object gets a new number never used in the project: for example the current time in milliseconds plus a counter (`python3 -c "import time; b=int(time.time()*1000); print(*range(b, b+30))"`), checked with `grep -rn -- '-<number>]' c8oProject.yaml _c8oProject`.
- Priorities are referenced: a step source is `[<priority of the step>, <xpath>]`, and an NGX style may use `.class<priority>` selectors. When you copy an object, give every bean of the copy a new priority and replace each old number by its new one everywhere in the copy (a map old→new applied to the whole copied text).
- Names are unique among siblings; sequences are listed in `c8oProject.yaml` in alphabetical order.
