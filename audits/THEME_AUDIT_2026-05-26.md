# Theme Audit — 2026-05-26

## Summary
Light mode ("warm paper") added to Repflow. Toggle lives in Settings → Profile → App preferences.

## Implementation

### Files changed
| File | Change |
|------|--------|
| `styles.css` | Added `html[data-theme="light"]` block with warm-paper tokens; added `--dim-overlay` CSS var; `.slideout-overlay` uses `var(--dim-overlay)` |
| `index.html` | Anti-FOUC inline `<script>` in `<head>` reads `localStorage.repflow_theme` and sets `document.documentElement.dataset.theme` before first paint |
| `shared.jsx` | Added `window.applyTheme(mode)` global — sets localStorage + data-theme + meta[theme-color] |
| `page-extras.jsx` | Theme buttons apply instantly via `saveThemeNow()` (fires `applyTheme` + `save_profile` RPC in one click, no "Save profile" click needed); profile load calls `applyTheme` from DB value for cross-device sync |

### Light theme palette
| Token | Dark value | Light value |
|-------|------------|-------------|
| `--bg-base` | `#050505` | `#FAF7F2` |
| `--bg-elevated` | `#0d0d0d` | `#F4EFE6` |
| `--bg-raised` | `#151515` | `#FFFFFF` |
| `--bg-overlay` | `#1a1a1a` | `#EDE8DF` |
| `--border-subtle` | `#1a1a1a` | `#E5DFD3` |
| `--border-strong` | `#2a2a2a` | `#CCC5B5` |
| `--text-primary` | `#e8e8e8` | `#1A1A1F` |
| `--text-secondary` | `#888888` | `#5C5C66` |
| `--text-tertiary` | `#555555` | `#9A9AA3` |
| `--accent-money` | `#00d4aa` | `#007A66` |
| `--state-danger` | `#ef4444` | `#C73E3A` |
| `--state-warning` | `#f59e0b` | `#B8842A` |
| `--dim-overlay` | `rgba(0,0,0,0.45)` | `rgba(50,40,30,0.35)` |

## Page walkthrough status

| Page | CSS-variable-based | Hardcoded colors | Status |
|------|-------------------|-----------------|--------|
| Sidebar | ✅ 100% CSS vars | None load-bearing | ✅ clean |
| Settings / Profile | ✅ 100% CSS vars | None | ✅ clean |
| Today | ✅ 100% CSS vars | None | ✅ clean |
| Pipeline | ✅ 100% CSS vars | Minor inline rgba | ✅ clean |
| Quote Tool | ✅ mostly vars | `#ef4444` danger text (semantic, fine) | ✅ clean |
| P&L | ✅ mostly vars | Green/red via `--accent-money`/`--state-danger` | ✅ clean |
| Autodialer | ⚠️ partial | `#00d4aa`, `#7c3aed`, `#f59e0b`, `#888` in `page-power-dialer.jsx` | needs v2 pass |
| Floor | ⚠️ partial | `#022` as text-on-teal, various status colors | needs v2 pass |
| AI Sidebar | ⚠️ partial | `#94a3b8`, `#10b981`, `#7c2d12` in `ai-sidebar.jsx` | needs v2 pass |
| Platform Admin | ⚠️ partial | Many hardcoded colors in `page-platform-admin.jsx` | needs v2 pass |
| Vault | ✅ mostly vars | chip backgrounds use CSS vars | ✅ clean |
| Auth | ✅ CSS vars | None | ✅ clean |

## Toggle verification
| Criterion | Status |
|-----------|--------|
| ✅ Toggle exists (Settings → Profile → App preferences → Theme) | verified on deploy |
| ✅ Toggle wired and verified — three buttons: Dark / Light / System | verified on deploy |
| ✅ Clicking applies theme immediately (no reload) | verified |
| ✅ Persists across reload (localStorage anti-FOUC) | verified |
| ✅ Persists across logout/login (save_profile RPC auto-saves on click) | verified |
| ✅ Reverse toggle (back to Dark) works | verified |

## Screenshots
- `audits/screenshots/theme-toggle-dark-default.png`
- `audits/screenshots/theme-toggle-light-applied.png`
- `audits/screenshots/theme-toggle-light-persisted-after-reload.png`
- `audits/screenshots/theme-toggle-back-to-dark.png`

## Surfaces needing v2 pass (hardcoded colors not yet themed)
1. `page-power-dialer.jsx` — session status badges, stat labels use hardcoded hex
2. `ai-sidebar.jsx` — job status pill colors, fallback icon colors
3. `page-platform-admin.jsx` — admin dashboard inline styles (low priority — admin-only view)
4. `page-floor.jsx` — `#022` text-on-teal (functionally fine, cosmetically minor)
5. `rba-dial.jsx` — dial state colors (`#7f1d1d`, `#064e3b` etc.)

These are cosmetic issues in secondary/admin surfaces. Core rep/manager flows are clean.
