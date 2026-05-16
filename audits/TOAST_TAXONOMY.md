# Toast taxonomy normalize — 2026-05-15

Goal: stop using `window.toast(msg, kind)` with non-canonical `kind` values.
Standardize on four kinds: **`success`**, **`info`**, **`warn`**, **`error`**.

## Canonical mapping applied

- `"warning"` → `"warn"`  (0 call sites — already clean)
- `"danger"`  → `"error"`  (8 call sites rewritten)
- Anything else outside `{success, info, warn, error}` → log + skip + flag
  (0 sites found — taxonomy was clean apart from `"danger"`)

## Toast renderer audit

`polish.jsx` (lines 13-45):

```js
window.toast = function (msg, kind = "info") {
  // ... pushes { id, msg, kind, ts } to activeToasts, sets dismiss timer ...
};

function ToastHost() {
  return (
    <div className="toast-host">
      {activeToasts.map(t => (
        <div key={t.id} className={`toast toast-${t.kind}`}>
          {t.kind === "success" && <Icons.Check size={13}/>}
          {t.kind === "error"   && <Icons.X size={13}/>}
          {t.kind === "info"    && <Icons.Sparkles size={13}/>}
          ...
```

CSS in `styles.css` (lines 1246-1248):

```css
.toast-success { border-left: 3px solid var(--accent-money); }
.toast-error   { border-left: 3px solid var(--state-danger); }
.toast-info    { border-left: 3px solid var(--state-info); }
```

**Renderer findings:**

- The dismiss timer in `window.toast` only special-cases `"error"` (6 s vs the
  default 3.5 s) — all other kinds get the same dismissal.
- Icons are rendered for `success`, `error`, and `info` only. `warn` has no
  explicit icon — it falls through to no icon. (Same was true before this
  sweep; not in scope to add an icon.)
- CSS exists for `.toast-success`, `.toast-error`, `.toast-info`. There is no
  `.toast-warn` rule — `warn` toasts render with the base `.toast` styles
  (still readable, just no left-border accent). Same was true before this
  sweep.
- Legacy names `"warning"` and `"danger"` were never special-cased in the
  renderer — they always rendered as the default styling because the CSS
  classes `.toast-warning` and `.toast-danger` don't exist. So callers that
  passed those values were already getting visually-degraded toasts.
  Normalizing to canonical kinds restores correct visual treatment for the 8
  former `"danger"` sites (they now get the red left-border + ✕ icon).

## Before / after counts

Kind frequency, repo-wide:

| Kind | Before | After | Δ |
|---|---|---|---|
| `"success"` | 160 | 160 | 0 |
| `"info"`    | 51  | 51  | 0 |
| `"warn"`    | 42  | 42  | 0 |
| `"error"`   | 109 | 117 | +8 |
| `"danger"`  | 8   | 0   | -8 |
| `"warning"` | 0   | 0   | 0 |
| **Total**   | 370 | 370 | 0 |

(`"error"` total includes the 109 already-canonical sites *plus* the 8 newly
rewritten from `"danger"`. The grand total of toast-with-kind call sites is
unchanged.)

## Sites rewritten (8)

| File | Line (post-rewrite) | Context |
|---|---|---|
| page-extras.jsx | 328  | Vault — script targetRoles validation |
| page-extras.jsx | 823  | Vault — document targetRoles validation |
| page-extras.jsx | 971  | Vault — supabase not connected |
| page-extras.jsx | 1003 | Vault — segment create failure |
| page-resources.jsx | 294 | Doc copy clipboard failure |
| page-resources.jsx | 359 | Doc import — bad URL |
| page-resources.jsx | 371 | Doc import — API returned `data.error` |
| page-resources.jsx | 387 | Doc import — exception path |

## Out-of-scope notes

- The renderer's icon for `warn` and the CSS for `.toast-warn` are *not* in
  scope here — both were missing before this sweep and remain missing.
  Adding them is a separate visual-polish task. The instruction was to
  normalize *callers*, which is done.
- No bare `toast(...)` calls (without `window.` prefix) were found — every
  call site goes through `window.toast`.
- No variable-kind expressions (e.g. `toast(msg, cond ? "x" : "y")`) were
  found — every site passes a literal string. So this normalization is
  exhaustive and won't regress with new branching.
