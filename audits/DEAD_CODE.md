# DEAD CODE SWEEP — top-level `function X` and `const X =` in .jsx

Date: 2026-05-15
Method: Parsed every top-level (column-0) declaration starting with an uppercase letter (`function Foo(...)` or `const Foo = ...`) in every `.jsx` file outside `node_modules`/`dist`. For each name, counted whole-word occurrences across the whole repo (`.jsx`, `.js`, `.html`, `.css`, `.md`, `.txt`). Also checked `window.<Name> =` attachments and string-literal references (`"Name"` / `'Name'`). Definitions with `count == 1` AND no window attach AND no string ref are deletable.

Auditor: `/tmp/audit_dead.py`. Raw JSON: `/tmp/audit_dead.json`.

Total top-level uppercase declarations scanned: **341**.

---

## Verified DEAD — deleted

### `AEPBanner` — `page-today.jsx:100`
- One whole-word reference in the entire repo: the definition itself (no callers anywhere).
- No `window.AEPBanner =` attachment.
- No `"AEPBanner"` / `'AEPBanner'` string reference.
- 27 lines, returns `<div className="panel">…AEP banner</div>`. Imports `useAepContext` only.
- Likely orphaned when `page-today.jsx`'s role-view layouts were refactored — no view renders it.
- **Removed** in this commit. Replaced with a one-line comment noting the removal date.

---

## Known-dead candidates from the task description

### `AutodialerPill`
- Already deleted before this sweep. No definition anywhere in `.jsx`/`.js`.
- Only reference left is in `CHANGES.md:183` (historical log entry).
- Nothing to do.

### `VaultSegmentsPane`
- **Alive.** Used at `page-extras.jsx:193` (`{tab === "segments" && <VaultSegmentsPane canEdit={canEdit}/>}`). The premise that "Segments tab removed" is stale — the tab is still wired up.

### `VaultSegmentsListBlock`
- **Alive.** Used at `page-extras.jsx:182` (rendered inline in the vault landing list view when `fSegments.length > 0`).

---

## Uncertain cases (not deleted, left intact)

None. The auditor flagged 0 unsure cases for this run — every top-level Uppercase declaration with `count == 1` also had no `window.X =` attachment and no string ref, so the binary fell cleanly into "delete" or "alive".

---

## Limitations

- Only inspects `.jsx`. `.js` library files in `lib/`, `api/`, `scripts/` were scanned for references but their own internal helpers (lowercase or non-React) were not enumerated.
- Identifiers starting with a lowercase letter or `_` are not enumerated as defs (focuses on React components and PascalCase helpers).
- Dynamic dispatch via `eval`, `Function()`, or template-string class lookup is not tracked. None observed in this repo.
- Multi-file defs of the same name (e.g., `Modal` defined in two different page files) are skipped from the dead-check to avoid false positives where one is a local component and the other is genuinely a different component.
